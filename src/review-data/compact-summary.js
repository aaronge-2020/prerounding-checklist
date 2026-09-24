// Compact clinical-summary builders for the Patient Data Review sheet.
//
// Pure derivation only: no DOM, no storage, no network. These helpers turn the
// already-built review index pieces (laboratory panels, vital candidates) into
// the dense one-page groupings the review sheet renders:
//
// - report items: every result whose value is "Rpt" (report-only placeholder),
//   grouped together so report-only studies can be reviewed individually;
// - pending items: results explicitly marked pending / in process;
// - laboratory family sections: latest panel rows regrouped by source panel
//   (CBC, metabolic, hepatic, coagulation, ...), one row per analyte;
// - paired blood pressure: separate systolic/diastolic vital candidates merged
//   into a single "Blood Pressure" candidate.
import { laboratoryPanelFamily, splitLaboratoryRowsByPanel } from "../patient-context/laboratory-panels.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizedFlag(value) {
  return cleanText(value).toUpperCase();
}

const REPORT_VALUE_PATTERN = /^rpt(?:\s*\((?:ip|p)\))?$/i;

// Values that explicitly mean "no result yet". Deliberately narrow: numeric
// placeholders such as "see comment" or "TNP" are not pending.
const PENDING_VALUE_PATTERN = /^(pending|in[\s-]?process|awaiting(?:[\s-]?results?)?|to[\s-]?follow|result[\s-]?pending|pending[\s-]?result|collected|specimen[\s-]?received)$/i;

const PENDING_FLAG_LABELS = {
  IP: "In Process",
  P: "Pending"
};

export function isReportResult(result) {
  return REPORT_VALUE_PATTERN.test(cleanText(result?.value));
}

export function pendingStatusLabel(result) {
  if (!result) return "";
  const flagLabel = PENDING_FLAG_LABELS[normalizedFlag(result.flag)];
  if (flagLabel) return flagLabel;
  const value = cleanText(result.value);
  // A report placeholder that carries its own in-process marker ("Rpt (IP)")
  // keeps the badge inside the reports section.
  const reportMarker = value.match(/^rpt\s*\((ip|p)\)$/i);
  if (reportMarker) return reportMarker[1].toLowerCase() === "ip" ? "In Process" : "Pending";
  if (PENDING_VALUE_PATTERN.test(value)) {
    return /process/i.test(value) ? "In Process" : "Pending";
  }
  return "";
}

export function isPendingResult(result) {
  // Report-only rows keep their report identity even when flagged in process
  // (for example "Rpt (IP)"): they belong with the other reports, with the
  // in-process status shown as a badge.
  return !isReportResult(result) && pendingStatusLabel(result) !== "";
}

export function abnormalTone(result) {
  const emphasis = cleanText(result?.emphasis).toLowerCase();
  const status = cleanText(result?.abnormality?.status || result?.status).toLowerCase();
  for (const tone of [emphasis, status]) {
    if (tone === "high" || tone === "critical") return "high";
    if (tone === "low") return "low";
    if (tone === "abnormal") return "abnormal";
  }
  return "";
}

function panelContextLabel(panel) {
  return [panel?.dayLabel, panel?.timestamp].filter(Boolean).join(" · ");
}

function collectFlaggedItems(panels, keep) {
  const items = [];
  for (const panel of panels || []) {
    for (const result of panel?.results || []) {
      if (!keep(result)) continue;
      items.push({
        panelId: panel.id,
        panelName: panel.name,
        timestamp: panel.timestamp,
        dayLabel: panel.dayLabel,
        sortTime: Number.isFinite(panel.sortTime) ? panel.sortTime : 0,
        sourceLabel: panel.source?.sourceLabel || "",
        contextLabel: panelContextLabel(panel),
        pendingLabel: pendingStatusLabel(result),
        result
      });
    }
  }
  items.sort((left, right) =>
    (right.sortTime - left.sortTime)
    || String(left.result?.name || "").localeCompare(String(right.result?.name || ""))
  );
  return items;
}

// Every report-only placeholder across all laboratory panels, newest first.
// Each entry stays individually selectable; the placeholder text itself is
// never treated as report content.
export function extractReportItems(panels) {
  return collectFlaggedItems(panels, isReportResult);
}

// Explicitly pending / in-process results that are not report placeholders.
export function extractPendingItems(panels) {
  return collectFlaggedItems(panels, isPendingResult);
}

function analyteKey(name) {
  return cleanText(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function panelRecency(panel) {
  if (Number.isFinite(panel?.sortTime)) return panel.sortTime;
  return Number.NEGATIVE_INFINITY;
}

// Latest panels regrouped by source panel family (CBC, metabolic, hepatic,
// coagulation, ...). One row per analyte: when several panels carry the same
// analyte, the latest panel's row wins and its trend already spans history.
// Report-only and pending rows are excluded; they live in their own sections.
export function labFamilySections(panels) {
  const sections = new Map();
  for (const panel of panels || []) {
    const displayRows = (panel.results || []).filter(
      (result) => !isReportResult(result) && !isPendingResult(result)
    );
    for (const { key, label, rows } of splitLaboratoryRowsByPanel(displayRows)) {
      if (!sections.has(key)) {
        sections.set(key, {
          key,
          label,
          rowsByAnalyte: new Map(),
          panels: [],
          panelIds: new Set(),
          latestTimestamp: "",
          latestDayLabel: "",
          latestSortTime: Number.NEGATIVE_INFINITY
        });
      }
      const section = sections.get(key);
      if (!section.panelIds.has(panel.id)) {
        section.panelIds.add(panel.id);
        section.panels.push(panel);
      }
      for (const row of rows) {
        const existing = section.rowsByAnalyte.get(analyteKey(row.name));
        if (!existing || panelRecency(panel) >= panelRecency(existing.panel)) {
          section.rowsByAnalyte.set(analyteKey(row.name), { result: row, panel });
        }
      }
      const recency = panelRecency(panel);
      if (recency >= section.latestSortTime) {
        section.latestSortTime = recency;
        section.latestTimestamp = panel.timestamp || "";
        section.latestDayLabel = panel.dayLabel || "";
      }
    }
  }
  return [...sections.values()].map((section) => {
    const rows = [...section.rowsByAnalyte.values()].sort((left, right) =>
      String(left.result?.name || "").localeCompare(String(right.result?.name || ""))
    );
    return {
      key: section.key,
      label: section.label,
      timestamp: section.latestTimestamp,
      dayLabel: section.latestDayLabel,
      abnormalCount: rows.filter(({ result }) => abnormalTone(result)).length,
      panels: section.panels,
      rows
    };
  });
}

const SYSTOLIC_PATTERN = /systolic/i;
const DIASTOLIC_PATTERN = /diastolic/i;

function findPressureIndex(list, pattern) {
  // Prefer cuff pressures over arterial-line pressures so an arterial systolic
  // never pairs with a cuff diastolic.
  const isArterial = (candidate) => /arterial/i.test(candidate?.name || "");
  let index = list.findIndex((candidate) => pattern.test(candidate?.name || "") && !isArterial(candidate));
  if (index < 0) index = list.findIndex((candidate) => pattern.test(candidate?.name || ""));
  return index;
}

export function displayVitalName(name) {
  const text = cleanText(name);
  if (/arterial/i.test(text) && /blood pressure/i.test(text)) return "Art BP";
  if (/blood pressure/i.test(text)) return "BP";
  return text;
}

function vitalLatestLabel(latest) {
  if (!latest) return "";
  return [latest.dayLabel, latest.timestamp].filter(Boolean).join(" · ");
}

function vitalRangeText(statistics) {
  if (!statistics || !Number.isFinite(statistics.minimum) || !Number.isFinite(statistics.maximum)) return "";
  return `${statistics.minimum}–${statistics.maximum}`;
}

const STATUS_SEVERITY = { critical: 4, high: 3, abnormal: 2, low: 2 };

function worstStatus(...statuses) {
  let best = "";
  let bestRank = -1;
  for (const status of statuses) {
    const text = cleanText(status).toLowerCase();
    const rank = STATUS_SEVERITY[text] ?? (text && text !== "unknown" && text !== "normal" ? 1 : 0);
    if (rank > bestRank) {
      bestRank = rank;
      best = text;
    }
  }
  return best;
}

// Merge separate systolic/diastolic vital candidates into single Blood
// Pressure candidates — every pair, not just the first. Candidates that
// already carry a combined "120/80" value are left untouched; a lone
// systolic or diastolic row with no partner is also left as-is. Arterial-line
// pressures pair only with each other and cuff pressures only with each
// other: an arterial systolic never merges with a cuff diastolic, even when
// one type has no partner at all.
export function pairBloodPressureCandidates(vitals) {
  let list = [...(vitals || [])];
  const skipped = new Set();
  for (;;) {
    const systolicIndex = list.findIndex((candidate, index) =>
      !skipped.has(index) && SYSTOLIC_PATTERN.test(candidate?.name || ""));
    if (systolicIndex < 0) return list;
    const systolic = list[systolicIndex];
    const arterial = /arterial/i.test(systolic?.name || "");
    const diastolicIndex = list.findIndex((candidate, index) =>
      index !== systolicIndex
      && DIASTOLIC_PATTERN.test(candidate?.name || "")
      && /arterial/i.test(candidate?.name || "") === arterial
    );
    if (diastolicIndex < 0) {
      skipped.add(systolicIndex);
      continue;
    }
    list = mergePressurePair(list, systolicIndex, diastolicIndex, arterial);
    skipped.clear();
  }
}

function mergePressurePair(list, systolicIndex, diastolicIndex, arterial) {
  const systolic = list[systolicIndex];
  const diastolic = list[diastolicIndex];
  const systolicLatest = systolic.latest;
  const diastolicLatest = diastolic.latest;
  const systolicValue = cleanText(systolicLatest?.value) || "—";
  const diastolicValue = cleanText(diastolicLatest?.value) || "—";
  const unit = cleanText(systolicLatest?.unit || diastolicLatest?.unit) || "mmHg";
  const latestLabel = vitalLatestLabel(systolicLatest) || vitalLatestLabel(diastolicLatest);
  const observations = [...(systolic.observations || []), ...(diastolic.observations || [])]
    .sort((left, right) => (left.sortTime || 0) - (right.sortTime || 0));
  const systolicRange = vitalRangeText(systolic.statistics24h);
  const diastolicRange = vitalRangeText(diastolic.statistics24h);
  const rangeText = [
    systolicRange ? `SBP ${systolicRange}` : "",
    diastolicRange ? `DBP ${diastolicRange}` : ""
  ].filter(Boolean).join(" · ");
  const valueText = `${systolicValue}/${diastolicValue}${unit ? ` ${unit}` : ""}`;
  const merged = {
    ...systolic,
    id: `bp_pair_${systolic.id}__${diastolic.id}`,
    name: arterial ? "Arterial Blood Pressure" : "Blood Pressure",
    unit,
    latest: {
      ...(systolicLatest?.sortTime >= diastolicLatest?.sortTime ? systolicLatest : diastolicLatest),
      value: `${systolicValue}/${diastolicValue}`,
      unit
    },
    observations,
    statistics24h: null,
    statisticsText: rangeText ? `${rangeText} (24h)` : "",
    insertionText: `${arterial ? "Arterial Blood Pressure" : "Blood Pressure"}: ${valueText}${latestLabel ? ` (latest ${latestLabel})` : ""}${rangeText ? `; 24-hour range ${rangeText}${unit ? ` ${unit}` : ""}` : ""}`,
    searchText: cleanText(`${systolic.searchText} ${diastolic.searchText} blood pressure bp`).toLowerCase(),
    fingerprint: `${systolic.fingerprint}|${diastolic.fingerprint}`,
    pairedFrom: [systolic.id, diastolic.id],
    status: worstStatus(systolicLatest?.status, diastolicLatest?.status) || "unknown"
  };
  // The spread above carries the systolic candidate's compact note text; the
  // merged pair needs its own "BP 128/78" form.
  const mergedNoteItem = vitalNoteItem(merged);
  merged.noteLabel = mergedNoteItem.label;
  merged.noteDetail = mergedNoteItem.detail;
  const keepIndex = Math.min(systolicIndex, diastolicIndex);
  const next = list.filter((_, index) => index !== systolicIndex && index !== diastolicIndex);
  next.splice(keepIndex, 0, merged);
  return next;
}

export function shortDateTime(sortTime) {
  if (!Number.isFinite(sortTime)) return "";
  const date = new Date(sortTime);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// "15.2 (9/19 06:00) → 8.8 (9/21 06:00)": the compact per-row trend line for
// laboratory analytes. Falls back to the single latest value when there is no
// trend.
export function compactLabTrendLine(result) {
  const points = result?.displayTrend || result?.trend || [];
  const dated = points
    .map((point) => {
      const value = cleanText(point?.value);
      if (!value) return "";
      const when = shortDateTime(point?.sortTime);
      return when ? `${value} (${when})` : value;
    })
    .filter(Boolean);
  const unit = cleanText(result?.unit);
  if (dated.length >= 2) return `${dated.join(" → ")}${unit ? ` ${unit}` : ""}`;
  const latestValue = [cleanText(result?.value), unit].filter(Boolean).join(" ") || "No value recorded";
  return latestValue;
}

// "120 (9/19) → 126": compact trend line for vital chips.
export function compactVitalTrendLine(displayTrend) {
  const points = displayTrend?.points || [];
  if (points.length < 2) return "";
  return points
    .map((point) => {
      const value = cleanText(point?.value);
      if (!value) return "";
      if (Number.isFinite(point?.sortTime)) {
        const date = new Date(point.sortTime);
        if (!Number.isNaN(date.getTime())) return `${value} (${date.getMonth() + 1}/${date.getDate()})`;
      }
      return cleanText(point?.observedAt) ? `${value} (${cleanText(point.observedAt)})` : value;
    })
    .filter(Boolean)
    .join(" → ");
}

// ---------------------------------------------------------------------------
// Final-note objective grouping.
//
// The draft's Objective section used to concatenate every selected block's
// verbose insertion text (one paragraph per vital, one per lab row). These
// helpers give each selectable candidate a compact single-line form plus a
// grouping key so the note renderer can emit one "Vitals:" line and one line
// per laboratory panel family (CBC, metabolic, ...).
// ---------------------------------------------------------------------------

export const NOTE_VITALS_GROUP_KEY = "vitals";
export const NOTE_VITALS_GROUP_LABEL = "Vitals";

export const NOTE_LAB_FAMILY_ORDER = [
  "cbc",
  "metabolic",
  "comprehensive_metabolic",
  "hepatic",
  "coagulation",
  "blood_gas",
  "blood_bank",
  "osmolality",
  "other"
];

export const NOTE_LAB_FAMILY_LABELS = {
  cbc: "CBC",
  metabolic: "Basic metabolic panel",
  comprehensive_metabolic: "Comprehensive metabolic panel",
  hepatic: "Hepatic function panel",
  coagulation: "Coagulation panel",
  blood_gas: "Blood gas",
  blood_bank: "Blood bank",
  osmolality: "Osmolality",
  other: "Other laboratory results"
};

// Single-analyte family key for note grouping. The differential folds into
// the CBC family; metabolic+hepatic merging happens at render time when both
// families are selected.
export function noteLabFamilyKey(analyteName) {
  const key = laboratoryPanelFamily(analyteName);
  return key === "cbc_differential" ? "cbc" : key;
}

const SHORT_VITAL_NAME_PATTERNS = [
  [/arterial.*blood pressure/i, "Art BP"],
  [/blood pressure/i, "BP"],
  [/heart rate/i, "HR"],
  [/^pulse$/i, "HR"],
  [/respirat/i, "RR"],
  [/oxygen saturation|^spo2$/i, "SpO2"],
  [/temperature/i, "Temp"]
];

export function shortVitalName(name) {
  const text = cleanText(name);
  for (const [pattern, short] of SHORT_VITAL_NAME_PATTERNS) {
    if (pattern.test(text)) return short;
  }
  return text;
}

function abnormalVitalFlag(candidate) {
  const status = cleanText(candidate?.latest?.status).toLowerCase();
  if (status && status !== "normal" && status !== "unknown") return ` [${status}]`;
  return "";
}

// "HR" / "75 bpm (59–77)": structured single-line form for the note's Vitals
// table. Markdown joins label and detail; rich HTML renders two columns.
export function vitalNoteItem(candidate) {
  const latest = candidate?.latest;
  const detail = [cleanText(latest?.value), cleanText(latest?.unit)].filter(Boolean).join(" ") || "—";
  const range = vitalRangeText(candidate?.statistics24h) || cleanText(candidate?.statisticsText);
  return {
    label: shortVitalName(candidate?.name),
    detail: `${detail}${range ? ` (${range})` : ""}${abnormalVitalFlag(candidate)}`
  };
}

// "Creatinine" / "1.6 mg/dL [H] (1.2 → 1.6; baseline 0.9 mg/dL · Sep 2024)":
// structured single-line form for one lab row inside the note's per-family
// table. The trend suffix only appears when the earliest shown point differs
// from the latest; a patient-entered baseline is appended after it.
export function labNoteItem(result) {
  const detail = [cleanText(result?.value), cleanText(result?.unit)].filter(Boolean).join(" ") || "—";
  const flag = cleanText(result?.flag) ? ` [${cleanText(result.flag)}]` : "";
  const points = (result?.displayTrend || result?.trend || [])
    .map((point) => cleanText(point?.value))
    .filter(Boolean);
  const suffixes = [];
  if (points.length >= 2 && points[0] !== points[points.length - 1]) {
    suffixes.push(`${points[0]} → ${points[points.length - 1]}`);
  }
  const baselineValue = [cleanText(result?.baseline?.value), cleanText(result?.baseline?.unit)].filter(Boolean).join(" ");
  if (baselineValue) {
    const when = cleanText(result?.baseline?.dateLabel);
    suffixes.push(`baseline ${baselineValue}${when ? ` · ${when}` : ""}`);
  }
  const suffix = suffixes.length ? ` (${suffixes.join("; ")})` : "";
  return { label: cleanText(result?.name), detail: `${detail}${flag}${suffix}` };
}
