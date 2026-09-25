import {
  clinicalDisplayModelFromPromptText,
  laboratoryAbnormality
} from "../patient-context/structured-clinical-data.js?v=20260921-medication-card-v4";
import {
  needsFreeTextResultText
} from "../patient-context/free-text-results.js";
import {
  laboratoryAnalyteKey,
  laboratoryPanelLabel
} from "../patient-context/laboratory-panels.js?v=20260921-medication-card-v4";
import {
  extractPendingItems,
  extractReportItems,
  labFamilySections,
  labNoteItem,
  NOTE_LAB_FAMILY_LABELS,
  NOTE_VITALS_GROUP_KEY,
  NOTE_VITALS_GROUP_LABEL,
  noteLabFamilyKey,
  pairBloodPressureCandidates,
  vitalNoteItem
} from "./compact-summary.js?v=20260924-optional-sections-v1";
import {
  getLabBaseline,
  normalizeLabBaselines
} from "../patient-context/lab-baselines.js?v=20260924-lab-baselines-v1";
import {
  extractNoteClinicalData
} from "../patient-context/note-clinical-extractor.js?v=20260924-note-extractor-v1";
import {
  primaryTeamNoteHasContent
} from "../patient-context/primary-team-note.js?v=20260921-medication-card-v4";

const GROUP_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "vitals", label: "Vital signs" }),
  Object.freeze({ id: "labs", label: "Laboratory results" }),
  Object.freeze({ id: "medications", label: "Medications" }),
  Object.freeze({ id: "imaging", label: "Imaging" }),
  Object.freeze({ id: "microbiology", label: "Microbiology" }),
  Object.freeze({ id: "pathology", label: "Pathology" }),
  Object.freeze({ id: "other_results", label: "Other diagnostic results" })
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedExact(value) {
  return clean(value).toLocaleLowerCase("en-US");
}

function isMedicationName(value) {
  const name = clean(value).replace(/\*\*/g, "").replace(/^(?:\[[^\]]+\]\s*)+/, "");
  return Boolean(name) && !/^(?:Rate|Dose|Freq(?:uency)?|Route|Start|End|PRN Reasons?|PRN Comment|Weight Dosing Info|Admin(?:istration)? Instructions?|Order specific questions?|\d{3,4}(?:-See Alt)?)(?:\s*:|$)/i.test(name);
}

// MAR administration times arrive as bare military times ("2044"); render
// them readably ("20:44") instead of leaking the raw digits into the UI.
function formatAdministrationTime(value) {
  const text = clean(value);
  const match = text.match(/^([01]\d|2[0-3])([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}` : text;
}

function medicationScheduleLabel(entry) {  const section = clean(entry.savedSection);
  const frequency = clean(entry.frequency);
  if (/completed|discontinued/i.test(section)) return "Completed";
  if (/\bPRN\b/i.test(frequency)) return "PRN";
  if (/continuous|titrated/i.test(frequency) || entry.rate) return "Continuous";
  if (/on call/i.test(frequency)) return "On call";
  // No honest schedule label when neither section nor frequency says anything:
  // returning "" keeps the row meta clean instead of showing jargon.
  return frequency ? "Scheduled" : "";
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function slug(value, fallback) {
  return normalizedExact(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || fallback;
}

function stableId(prefix, key, label = prefix) {
  return `${prefix}_${slug(label, prefix)}_${stableHash(key)}`;
}

function fingerprint(value) {
  return `fp_${stableHash(JSON.stringify(value))}`;
}

function sortedDays(days = []) {
  return [...days].sort((left, right) =>
    `${left?.date || ""}\u0000${left?.createdAt || ""}\u0000${left?.id || ""}`.localeCompare(
      `${right?.date || ""}\u0000${right?.createdAt || ""}\u0000${right?.id || ""}`
    )
  );
}

function sourcesForPatient(patient) {
  const sources = [];
  for (const section of patient?.contextSections || []) {
    if (!clean(section?.deidentifiedText)) continue;
    sources.push({
      record: section,
      scope: "admission",
      sourceId: clean(section.id),
      sourceKind: clean(section.sourceKind),
      sourceLabel: clean(section.label) || "Admission source",
      dayId: "admission",
      dayDate: "",
      dayLabel: "Admission",
      dayIndex: -1,
      capturedAt: clean(section.updatedAt || section.createdAt)
    });
  }
  sortedDays(patient?.days || []).forEach((day, dayIndex) => {
    for (const capture of day?.sourceCaptures || []) {
      if (!clean(capture?.deidentifiedText)) continue;
      sources.push({
        record: capture,
        scope: "daily",
        sourceId: clean(capture.id),
        sourceKind: clean(capture.sourceKind),
        sourceLabel: clean(capture.label) || "Hospital-day source",
        dayId: clean(day.id),
        dayDate: clean(day.date),
        dayLabel: clean(day.label) || `Hospital day ${dayIndex + 1}`,
        dayIndex,
        capturedAt: clean(capture.capturedAt || capture.updatedAt || capture.createdAt)
      });
    }
  });
  return sources;
}

function parseClock(value) {
  const match = clean(value).match(/(?:\bat\s+|\s)(\d{1,2}):(\d{2})(?:\s*([AP]M))?\]?$/i)
    || clean(value).match(/\s(\d{2})(\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = String(match[3] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

function explicitTimestamp(value) {
  const text = clean(value).replace(/^@\s*/, "");
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+(\d{1,2})(?::?(\d{2}))?(?:\s*([AP]M))?)?/i);
  if (!match) return null;
  let hour = Number(match[4] || 0);
  const meridiem = String(match[6] || "").toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]), hour, Number(match[5] || 0));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function observationTime(source, timestamp) {
  const explicit = explicitTimestamp(timestamp);
  if (Number.isFinite(explicit)) return explicit;
  const relative = clean(timestamp).match(/^\[?(?:(Hospital Day)\s+(\d+)|(\d+)\s+days?\s+prior to hospital admission|hospital admission day)(?:\s+at\s+(\d{1,2}):(\d{2}))?\]?/i);
  if (relative) {
    const dayOffset = relative[1] ? Number(relative[2]) - 1 : relative[3] ? -Number(relative[3]) : 0;
    return dayOffset * 24 * 60 * 60 * 1000 + (Number(relative[4] || 0) * 60 + Number(relative[5] || 0)) * 60 * 1000;
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(source.dayDate)
    ? new Date(`${source.dayDate}T00:00:00`).getTime()
    : null;
  const clock = parseClock(timestamp);
  if (Number.isFinite(day)) return day + (clock ? (clock.hour * 60 + clock.minute) * 60 * 1000 : 0);
  const hospitalDay = clean(timestamp).match(/Hospital Day\s+(\d+)/i);
  if (hospitalDay) return Number(hospitalDay[1]) * 24 * 60 * 60 * 1000 + (clock ? (clock.hour * 60 + clock.minute) * 60 * 1000 : 0);
  return null;
}

function sourceProvenance(source) {
  return {
    scope: source.scope,
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    sourceLabel: source.sourceLabel,
    dayId: source.dayId,
    dayDate: source.dayDate,
    dayLabel: source.dayLabel,
    capturedAt: source.capturedAt
  };
}

function compareObservations(left, right) {
  if (Number.isFinite(left.sortTime) && Number.isFinite(right.sortTime) && left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
  if (Number.isFinite(left.sortTime) !== Number.isFinite(right.sortTime)) return Number.isFinite(left.sortTime) ? -1 : 1;
  return left.dayIndex - right.dayIndex || left.sourceOrder - right.sourceOrder || left.groupOrder - right.groupOrder || left.rowOrder - right.rowOrder;
}

function observationContext(observation) {
  return [observation.dayLabel, observation.timestamp].filter(Boolean).join(" · ");
}

function displayedObservation(observation, { includeName = false } = {}) {
  const value = [observation.value, observation.unit].filter(Boolean).join(" ");
  const status = observation.status && !["normal", "unknown"].includes(observation.status) ? ` [${observation.status}]` : "";
  const context = observationContext(observation);
  return `${includeName ? `${observation.name}: ` : ""}${value || "No value recorded"}${status}${context ? ` (${context})` : ""}`;
}

function finalizeObservationCandidate(candidate, group) {
  const observations = [...candidate.observations].sort(compareObservations);
  const latest = observations.at(-1) || null;
  const finalized = {
    ...candidate,
    group,
    observations,
    latest,
    insertionText: latest ? displayedObservation(latest, { includeName: true }) : candidate.name,
    searchText: clean([
      candidate.name,
      candidate.unit,
      ...observations.flatMap((observation) => [observation.value, observation.status, observation.flag, observation.dayLabel, observation.timestamp, observation.source.sourceLabel])
    ].join(" ")).toLocaleLowerCase("en-US")
  };
  finalized.fingerprint = fingerprint({
    id: finalized.id,
    observations: observations.map(({ id, value, unit, status, flag, timestamp, dayLabel }) => ({ id, value, unit, status, flag, timestamp, dayLabel }))
  });
  return finalized;
}

function numericValue(value) {
  const match = clean(value).match(/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function splitValueAndUnit(value, unit) {
  const explicitUnit = clean(unit);
  if (explicitUnit) return { value: clean(value), unit: explicitUnit };
  const match = clean(value).match(/^((?:[<>]=?\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s+(.+))?$/);
  return match ? { value: clean(match[1]), unit: clean(match[2]) } : { value: clean(value), unit: "" };
}

function rounded(value) {
  return Number(value.toFixed(1));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function vitalStatistics(candidate, latestVitalTime) {
  const numericObservations = candidate.observations.filter((observation) =>
    Number.isFinite(observation.numericValue)
  );
  if (!numericObservations.length) return null;

  // Prefer a true 24-hour window when timestamps are available.
  if (Number.isFinite(latestVitalTime)) {
    const windowStart = latestVitalTime - 24 * 60 * 60 * 1000;
    const windowed = numericObservations.filter((observation) =>
      Number.isFinite(observation.sortTime)
      && observation.sortTime >= windowStart
      && observation.sortTime <= latestVitalTime
    );
    if (windowed.length) return statisticsFor(windowed, { is24h: true, windowStart, windowEnd: latestVitalTime });
  }
  // Fall back to the range across all available readings (e.g., HPI + vitals
  // section) when timestamps are absent. Label it honestly.
  if (numericObservations.length > 1) return statisticsFor(numericObservations, { is24h: false });
  return null;
}

function statisticsFor(observations, { is24h, windowStart, windowEnd } = {}) {
  const values = observations.map((observation) => observation.numericValue);
  const stats = {
    count: values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    mean: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    median: rounded(median(values))
  };
  if (Number.isFinite(windowStart)) stats.windowStart = windowStart;
  if (Number.isFinite(windowEnd)) stats.windowEnd = windowEnd;
  // Only the timestamp-free fallback sets this; the 24h shape stays exactly
  // as before for backward compatibility.
  if (is24h === false) stats.is24h = false;
  return stats;
}

function vitalInsertionText(candidate, statistics24h) {
  const latest = candidate.latest;
  if (!latest) return candidate.name;
  const latestValue = [latest.value, latest.unit].filter(Boolean).join(" ") || "No value recorded";
  const status = latest.status && !["normal", "unknown"].includes(latest.status) ? ` [${latest.status}]` : "";
  // Clean format: "BP: latest 92/48", not "Blood Pressure (cuff): latest 92/48 (MAP 63)".
  // MAP is only shown when explicitly documented in the note, never auto-computed.
  let text = `${candidate.name}: latest ${latestValue}${status}`;
  if (!statistics24h) return text;
  const unit = candidate.unit ? ` ${candidate.unit}` : "";
  const rangeLabel = statistics24h.is24h === false
    ? `range across ${statistics24h.count} readings`
    : "24-hour range";
  return `${text}; ${rangeLabel} ${statistics24h.minimum}–${statistics24h.maximum}${unit}; median ${statistics24h.median}${unit}`;
}

function resultGroup(resultCategory) {
  const category = normalizedExact(resultCategory);
  if (category === "imaging") return "imaging";
  if (category === "microbiology") return "microbiology";
  if (category === "pathology") return "pathology";
  return "other_results";
}

function diagnosticCandidate(source) {
  const record = source.record;
  const label = clean(record.label) || "Diagnostic result";
  const category = clean(record.resultCategory);
  const context = clean(record.resultContext || record.context);
  const resultDate = clean(record.resultDate);
  const text = String(record.deidentifiedText || "").trim();
  const sourceIdentity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}`;
  const groupKey = resultGroup(category);
  const needsFreeText = needsFreeTextResultText(label, text);
  const candidate = {
    id: stableId("result", sourceIdentity, label),
    kind: "diagnostic_result",
    group: groupKey,
    name: label,
    label,
    resultCategory: category,
    text,
    context,
    resultDate,
    source: sourceProvenance(source),
    // Note-draft grouping: diagnostics group by category (Imaging,
    // Microbiology, ...) in the Objective editor.
    noteGroupKey: `result:${groupKey}`,
    noteGroupLabel: { imaging: "Imaging", microbiology: "Microbiology", pathology: "Pathology" }[groupKey] || "Other results",
    noteLabel: label,
    noteDetail: needsFreeText ? "" : text.split("\n")[0].slice(0, 120),
    // Flag free-text studies (EKG, echo, CT/MRI, cultures, ...) whose pasted
    // value is just a status/placeholder — the student must paste the report.
    needsFreeText
  };
  const details = [category, resultDate, source.dayLabel, context].filter(Boolean).join(" · ");
  candidate.insertionText = `${label}${details ? ` (${details})` : ""}\n${text}`;
  candidate.searchText = clean([label, category, text, context, resultDate, source.dayLabel, source.dayDate].join(" ")).toLocaleLowerCase("en-US");
  candidate.fingerprint = fingerprint({ id: candidate.id, label, category, text, context, resultDate, source: candidate.source });
  return candidate;
}

function laboratoryPanelName(source, group) {
  const sourceLabel = clean(source.sourceLabel);
  const generic = /^(?:laboratory results?|lab results?|morning labs?|admission labs?|epic results(?: with unparsed text)?|epic results review laboratory table)$/i.test(sourceLabel);
  if (!generic && sourceLabel) return clean(sourceLabel.split(/\s+·\s+/)[0]);
  return clean(group.label) && !/^laboratory results?$/i.test(clean(group.label)) ? clean(group.label) : "Laboratory results";
}

function finalizeLaboratoryPanel(candidate) {
  const results = [...candidate.results];
  const context = [candidate.dayLabel, candidate.timestamp].filter(Boolean).join(" · ");
  const renderedResults = results.map((result) => {
    const value = [result.value, result.unit].filter(Boolean).join(" ") || "No value recorded";
    const flag = result.flag ? ` [${result.flag}]` : result.status && !["normal", "unknown"].includes(result.status) ? ` [${result.status}]` : "";
    return `${result.name}: ${value}${flag}`;
  });
  const finalized = {
    ...candidate,
    group: "labs",
    results,
    insertionText: `${candidate.name}${context ? ` (${context})` : ""}\n${renderedResults.join("\n")}`,
    searchText: clean([candidate.name, candidate.dayLabel, candidate.timestamp, candidate.source.sourceLabel, ...results.flatMap((result) => [result.name, result.value, result.unit, result.referenceRange, result.flag, result.status])].join(" ")).toLocaleLowerCase("en-US")
  };
  finalized.fingerprint = fingerprint({
    id: finalized.id,
    name: finalized.name,
    timestamp: finalized.timestamp,
    results: results.map(({ id, name, value, unit, referenceRange, flag, status }) => ({ id, name, value, unit, referenceRange, flag, status }))
  });
  return finalized;
}

// Selection candidates for the compact sheet's report-only and pending rows.
// Each stays individually selectable; the generated note text never copies
// report content from a placeholder.
function flaggedItemSelectionCandidate(kind, item) {
  const name = clean(item.result.name);
  const context = item.contextLabel ? ` (${item.contextLabel})` : "";
  const statusNote = item.pendingLabel ? ` — ${item.pendingLabel}` : "";
  const insertionText = kind === "report"
    ? `${name}${context}: report filed${statusNote} — review the full report in Results Review; this placeholder is not the report content`
    : `${name}${context}: ${item.pendingLabel || "Pending"} — no result available yet`;
  const candidate = {
    id: stableId(kind === "report" ? "report_item" : "pending_item", `${item.panelId}\u0000${item.result.id}`, name),
    kind: "laboratory_result",
    group: "labs",
    name,
    panelName: item.panelName,
    panelId: item.panelId,
    insertionText,
    searchText: clean([name, item.panelName, item.contextLabel, item.sourceLabel, kind === "report" ? "report rpt" : "pending", item.pendingLabel].join(" ")).toLocaleLowerCase("en-US"),
    // Pending results auto-select into their own "Pending labs" group at the
    // bottom of Objective so nothing still in process is silently dropped.
    ...(kind === "pending"
      ? { pendingLab: true, noteGroupKey: "pending-labs", noteGroupLabel: "Pending labs" }
      : {})
  };
  candidate.fingerprint = fingerprint({ id: candidate.id, insertionText });
  return candidate;
}

// At most three points are shown per lab trend. The latest observation always
// anchors the trend; the remaining slots go to the most clinically
// informative earlier points: abnormal results first, then the most recent
// ones. The selection is returned in chronological order.
const MAX_LABORATORY_TREND_POINTS = 3;

function compactLaboratoryTrend(result) {
  // The note shows at most three trend points, each labeled with its hospital
  // day and timestamp so the reader can tell when every value was drawn.
  const observations = selectLaboratoryTrendPoints(
    result.displayTrend?.length ? result.displayTrend : (result.trend || [])
  );
  if (!observations.length) return `${result.name}: No value recorded`;
  const units = new Set(observations.map((entry) => clean(entry.unit)).filter(Boolean));
  const sharedUnit = units.size === 1 ? [...units][0] : "";
  const values = observations.map((entry) => {
    const value = clean(entry.value) || "No value recorded";
    const context = observationContext(entry);
    const labeled = context ? `${value} (${context})` : value;
    return sharedUnit ? labeled : [labeled, entry.unit].filter(Boolean).join(" ");
  });
  const latest = observations.at(-1);
  const flag = latest?.flag ? ` [${latest.flag}]` : latest?.status && !["normal", "unknown"].includes(latest.status) ? ` [${latest.status}]` : "";
  const baselineValue = [clean(result?.baseline?.value), clean(result?.baseline?.unit)].filter(Boolean).join(" ");
  const baseline = baselineValue
    ? ` (baseline ${baselineValue}${clean(result?.baseline?.dateLabel) ? ` · ${clean(result?.baseline?.dateLabel)}` : ""})`
    : "";
  return `${result.name}: ${values.join(" → ")}${sharedUnit ? ` ${sharedUnit}` : ""}${flag}${baseline}`;
}

function selectLaboratoryTrendPoints(observations, maxPoints = MAX_LABORATORY_TREND_POINTS) {
  const sorted = [...(observations || [])];
  if (sorted.length <= maxPoints) return sorted;
  const abnormalityRank = (entry) => {
    switch (entry?.status) {
      case "critical": return 3;
      case "high":
      case "low":
      case "abnormal": return 2;
      default: return 0;
    }
  };
  const ranked = sorted
    .map((entry, index) => ({ entry, index }))
    .slice(0, -1)
    .sort((left, right) => abnormalityRank(right.entry) - abnormalityRank(left.entry) || right.index - left.index);
  const keep = new Set([sorted.length - 1]);
  for (const { index } of ranked) {
    if (keep.size >= maxPoints) break;
    keep.add(index);
  }
  return sorted.filter((_, index) => keep.has(index));
}

function laboratoryTrendKey(panel, analyteName) {
  // The same analyte name can come from different panel types (for example
  // lactate drawn as a serum chemistry versus lactate from a blood gas).
  // Those are different tests and must keep separate trends, so the trend
  // key includes the panel name and not just the analyte.
  return `${laboratoryAnalyteKey(analyteName)}\u0000${normalizedExact(panel?.name)}`;
}

function attachLaboratoryTrends(laboratoryPanels) {
  const trendsByName = new Map();
  for (const panel of laboratoryPanels) {
    for (const result of panel.results) {
      const key = laboratoryTrendKey(panel, result.name);
      if (!trendsByName.has(key)) trendsByName.set(key, []);
      trendsByName.get(key).push({
        id: result.id,
        panelId: panel.id,
        value: result.value,
        numericValue: numericValue(result.value),
        unit: result.unit,
        status: result.status,
        flag: result.flag,
        referenceRange: result.referenceRange,
        timestamp: panel.timestamp,
        dayLabel: panel.dayLabel,
        dayDate: panel.dayDate,
        sortTime: panel.sortTime,
        dayIndex: panel.dayIndex,
        sourceOrder: panel.sourceOrder,
        groupOrder: panel.groupOrder,
        rowOrder: result.rowOrder
      });
    }
  }
  for (const trend of trendsByName.values()) trend.sort(compareObservations);
  return laboratoryPanels.map((panel) => ({
    ...panel,
    results: panel.results.map((result) => {
      const trend = trendsByName.get(laboratoryTrendKey(panel, result.name)) || [];
      return { ...result, trend, displayTrend: selectLaboratoryTrendPoints(trend) };
    })
  }));
}

function latestLaboratoryPanels(laboratoryPanels, { baselines } = {}) {
  const latestByType = new Map();
  const compareRecency = (left, right) => {
    if (Number.isFinite(left.sortTime) && Number.isFinite(right.sortTime) && left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
    if (Number.isFinite(left.sortTime) !== Number.isFinite(right.sortTime)) return Number.isFinite(left.sortTime) ? 1 : -1;
    return left.dayIndex - right.dayIndex || left.sourceOrder - right.sourceOrder || left.groupOrder - right.groupOrder;
  };
  for (const panel of laboratoryPanels) {
    const key = normalizedExact(panel.name) || "laboratory results";
    const current = latestByType.get(key);
    if (!current || compareRecency(panel, current) > 0) latestByType.set(key, panel);
  }
  return [...latestByType.entries()].map(([key, panel]) => {
    const id = stableId("lab_panel", `latest\u0000${key}`, panel.name);
    const trendSearchText = panel.results.flatMap((result) => result.trend || []).flatMap((entry) => [entry.value, entry.unit, entry.flag, entry.status, entry.dayLabel, entry.timestamp]);
    const results = panel.results.map((result) => {
      // Patient-entered baselines ride along so the sheet, the note line,
      // and the editor all read the same value.
      const baseline = getLabBaseline(baselines, result.name);
      const row = baseline ? { ...result, baseline } : result;
      const resultId = stableId("lab_result", `latest\u0000${normalizedExact(panel.name)}\u0000${laboratoryAnalyteKey(result.name)}`, result.name);
      const insertionText = compactLaboratoryTrend(row);
      const familyKey = noteLabFamilyKey(result.name);
      const noteItem = labNoteItem(row);
      const selectionCandidate = {
        id: resultId,
        kind: "laboratory_result",
        group: "labs",
        name: result.name,
        panelName: panel.name,
        insertionText,
        // Final-note grouping: rows collapse into one line/table per panel family.
        noteGroupKey: `lab:${familyKey}`,
        noteGroupLabel: NOTE_LAB_FAMILY_LABELS[familyKey] || familyKey,
        noteLabel: noteItem.label,
        noteDetail: noteItem.detail,
        searchText: clean([panel.name, result.name, result.value, result.unit, result.referenceRange, result.flag, result.status, ...(result.trend || []).flatMap((entry) => [entry.value, entry.unit, entry.flag, entry.status])].join(" ")).toLocaleLowerCase("en-US")
      };
      selectionCandidate.fingerprint = fingerprint({ id: resultId, insertionText });
      return { ...row, selectionCandidate };
    });
    const context = [panel.dayLabel, panel.timestamp].filter(Boolean).join(" · ");
    const next = {
      ...panel,
      id,
      results,
      insertionText: `${panel.name}${context ? ` (${context})` : ""}\n${results.map((result) => result.selectionCandidate.insertionText).join("\n")}`,
      searchText: clean([panel.searchText, ...trendSearchText].join(" ")).toLocaleLowerCase("en-US")
    };
    next.fingerprint = fingerprint({
      id,
      timestamp: next.timestamp,
      dayLabel: next.dayLabel,
      insertionText: next.insertionText
    });
    return next;
  });
}

// A saved vitals / labs / medications source whose narrative the structured
// parsers cannot turn into rows must not vanish from review ("Vital signs
// (0)" with nothing to inspect). Keep it as an explicit opt-in narrative
// candidate carrying the original de-identified text.
const NARRATIVE_SOURCE_KINDS = Object.freeze({
  vital_signs: { group: "vitals", label: "vital signs", noteGroupKey: "narrative_vitals" },
  laboratory_results: { group: "labs", label: "laboratory results", noteGroupKey: "narrative_labs" },
  medication_activity: { group: "medications", label: "medications", noteGroupKey: "narrative_medications" }
});

function narrativeFallbackCandidate(source, sourceOrder, provenance) {
  const config = NARRATIVE_SOURCE_KINDS[source.sourceKind];
  if (!config) return null;
  const rawText = clean(source.record.deidentifiedText);
  if (!rawText) return null;
  // Drop the "Vitals"/"Labs"/"Medications" kind header when present so the
  // card shows the actual narrative.
  const narrativeText = rawText.split(/\r?\n/).filter((line, index) => index > 0 || !/^(vitals|labs?|medications)\s*$/i.test(clean(line))).join("\n").trim() || rawText;
  const identity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}\u0000narrative`;
  const name = `Unparsed ${config.label}`;
  const context = [source.dayLabel, source.sourceLabel].filter(Boolean).join(" · ");
  const candidate = {
    id: stableId("narrative", identity, name),
    kind: "narrative",
    name,
    group: config.group,
    narrativeText,
    observations: [],
    dayLabel: source.dayLabel,
    dayDate: source.dayDate,
    dayIndex: source.dayIndex,
    sourceOrder,
    source: provenance,
    insertionText: narrativeText,
    noteGroupKey: config.noteGroupKey,
    noteGroupLabel: "Narrative source",
    noteLabel: name,
    noteDetail: context,
    searchText: clean(`${name} ${narrativeText} ${context}`).toLocaleLowerCase("en-US")
  };
  candidate.fingerprint = fingerprint({ id: candidate.id, text: narrativeText, dayLabel: source.dayLabel });
  return candidate;
}

// Lenient parser for note-extracted sources. The note extractor just produced
// this text from real parsed rows, so the strict display model must never
// reduce it to an "Unparsed X" card. This parser accepts the extractor's
// canonical "Header\n..." format directly and always yields rows.
function lenientNoteDisplayModel(sourceKind, text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const bodyLines = lines.slice(1); // drop the "Vitals"/"Labs"/"Medications" header
  if (sourceKind === "vital_signs") {
    const rows = [];
    for (const part of bodyLines.join(" ").split(/\s*;\s*/)) {
      const match = part.match(/^(.+?)\s+(\S.*)$/);
      if (!match) continue;
      const name = match[1].trim();
      const value = match[2].trim();
      if (!name || !value) continue;
      rows.push({
        cells: ["", name, value],
        emphasis: "unknown",
        unitUnmarked: /temp/i.test(name) && !/[°CF]\b/i.test(value)
      });
    }
    if (!rows.length) return null;
    return {
      type: "vitals",
      groups: [{ label: "Vital signs", timestamp: "", rows }],
      series: []
    };
  }
  if (sourceKind === "laboratory_results") {
    const rows = [];
    // First try line-based parsing (structured format).
    for (const line of bodyLines) {
      const match = line.match(/^([^:]+):\s*(.+)$/) || line.match(/^(\S+(?:\s+\S+)?)\s+(\S.*)$/);
      if (!match) continue;
      const name = match[1].trim();
      const rest = match[2].trim();
      if (!name || !rest) continue;
      const valueUnit = rest.match(/^(\S+(?:\s*\S+)?)\s+([a-zA-Z/%µμ]+(?:\/[a-zA-Z]+)?)$/);
      rows.push({
        cells: [name, valueUnit ? valueUnit[1] : rest, valueUnit ? valueUnit[2] : "", "", ""],
        emphasis: "unknown"
      });
    }
    // If line-based parsing fails, try narrative patterns (e.g., "WBC is 9",
    // "H&H 9.7/28.2", "platelet count 24,000").
    if (!rows.length) {
      const text = bodyLines.join(" ");
      const patterns = [
        // WBC - avoid matching dates like 01/08/09
        [/\bwhite blood cell count(?: from \d+\/\d+\/\d+)? is (\d+\.?\d*)/i, "WBC"],
        [/\bWBC (?:is )?(\d+\.?\d*)/i, "WBC"],
        // H&H
        [/\bH&H\s+(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/i, "Hgb", "Hct"],
        [/\bhemoglobin[^\d]*?(\d+\.?\d*)/i, "Hgb"],
        [/\bHgb[^\d]*?(\d+\.?\d*)/i, "Hgb"],
        // Platelets
        [/\bplatelet count[^\d]*?([\d,]+)/i, "Platelets"],
        [/\bplatelets[^\d]*?([\d,]+)/i, "Platelets"],
        // Coags
        [/\bINR\s+(\d+\.?\d*)/i, "INR"],
        [/\bPTT[^\d]*?(\d+)/i, "PTT"],
        // Renal
        [/\bBUN[^\d]*?(\d+\.?\d*)/i, "BUN"],
        [/\bcreatinine[^\d]*?(\d+\.?\d*)/i, "Creatinine"],
        [/\bBUN and creatinine\s+(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/i, "BUN", "Creatinine"],
        // Liver
        [/\bAST\s+(\d+)/i, "AST"],
        [/\bALT\s+(\d+)/i, "ALT"],
        [/\balkaline phosphatase\s+(\d+)/i, "Alk Phos"],
        [/\btotal bilirubin\s+(\d+\.?\d*)/i, "Bilirubin"],
        // Cardiac
        [/\btroponin\s+(\d+\.?\d*)/i, "Troponin"],
        [/\bCK\s+(\d+\.?\d*)/i, "CK"],
        // Other
        [/\bLDH\s+(\d+\.?\d*)/i, "LDH"],
      ];
      for (const [pattern, ...names] of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        names.forEach((name, idx) => {
          const value = (match[idx + 1] || "").replace(/,/g, "");
          if (value) rows.push({ cells: [name, value, "", "", ""], emphasis: "unknown" });
        });
      }
    }
    if (!rows.length) return null;
    return { type: "labs", groups: [{ label: "Laboratory results", timestamp: "", rows }] };
  }
  if (sourceKind === "medication_activity") {
    const rows = [];
    for (const line of bodyLines) {
      const name = line.split(/\s+[—–-]\s+/)[0].trim() || line.trim();
      if (!name) continue;
      rows.push({
        cells: [name, line.trim(), "", ""],
        medication: { name, dose: "", route: "", frequency: "", administrations: [] },
        emphasis: "unknown"
      });
    }
    if (!rows.length) return null;
    return { type: "medications", groups: [{ label: "Medications", timestamp: "", rows }] };
  }
  return null;
}

function addClinicalSource(source, sourceOrder, labMap, vitalMap, medicationMap) {
  let display = clinicalDisplayModelFromPromptText(source.sourceKind, source.record.deidentifiedText);
  const provenance = sourceProvenance(source);
  // Count structured candidates actually produced: rows can merge into an
  // existing candidate (same vital name/unit), so map size alone cannot tell
  // "parsed nothing" from "parsed into existing rows".
  let added = 0;
  if (!display?.groups?.length) {
    // Note-extracted sources carry text our own extractor just produced from
    // real parsed rows: the strict display model must never reduce them to an
    // "Unparsed X" card. Parse leniently so every extracted finding survives.
    if (String(source.sourceId || "").startsWith("note_")) {
      display = lenientNoteDisplayModel(source.sourceKind, source.record.deidentifiedText);
    }
    if (!display?.groups?.length) {
      const fallback = narrativeFallbackCandidate(source, sourceOrder, provenance);
      return fallback ? [fallback] : [];
    }
  }

  if (display.type === "labs") {
    display.groups.forEach((group, groupOrder) => {
      const identity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}\u0000${groupOrder}`;
      const name = laboratoryPanelName(source, group);
      const candidate = {
        id: stableId("lab_panel", identity, `${name}-${group.timestamp}`),
        kind: "laboratory_panel",
        name,
        timestamp: clean(group.timestamp),
        dayLabel: source.dayLabel,
        dayDate: source.dayDate,
        sortTime: observationTime(source, group.timestamp),
        dayIndex: source.dayIndex,
        sourceOrder,
        groupOrder,
        source: provenance,
        results: []
      };
      group.rows.forEach((row, rowOrder) => {
        const [resultName = "", displayedValue = "", displayedUnit = "", referenceRange = "", flag = ""] = row.cells || [];
        if (!normalizedExact(resultName)) return;
        const parsed = splitValueAndUnit(displayedValue, displayedUnit);
        const reportedStatus = clean(row.emphasis) || "unknown";
        const calculatedStatus = laboratoryAbnormality({ value: parsed.value, flag, referenceRange }).status;
        candidate.results.push({
          id: stableId("lab_result", `${identity}\u0000${rowOrder}`, resultName),
          name: clean(resultName),
          value: clean(parsed.value),
          unit: clean(parsed.unit),
          referenceRange: clean(referenceRange),
          flag: clean(flag),
          status: reportedStatus === "unknown" ? calculatedStatus : reportedStatus,
          rowOrder,
          parserProvenance: row.provenance || null
        });
      });
      if (candidate.name === "Laboratory results") candidate.name = laboratoryPanelLabel(candidate.results);
      if (candidate.results.length) {
        labMap.set(identity, candidate);
        added += candidate.results.length;
      }
    });
  }

  if (display.type === "vitals") {
    const seriesByName = new Map();
    for (const series of display.series || []) {
      const key = normalizedExact(series.name);
      if (!seriesByName.has(key)) seriesByName.set(key, []);
      seriesByName.get(key).push(series);
    }
    display.groups.forEach((group, groupOrder) => group.rows.forEach((row, rowOrder) => {
      const [, name = "", value = ""] = row.cells || [];
      const unit = clean(seriesByName.get(normalizedExact(name))?.[0]?.unit);
      const key = `${normalizedExact(name)}\u0000${normalizedExact(unit)}`;
      if (!normalizedExact(name)) return;
      if (!vitalMap.has(key)) vitalMap.set(key, {
        id: stableId("vital", key, name),
        kind: "vital_sign",
        name: clean(name),
        unit,
        observations: []
      });
      const identity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}\u0000${groupOrder}\u0000${rowOrder}`;
      vitalMap.get(key).observations.push({
        id: stableId("vital_observation", identity, name),
        name: clean(name),
        value: clean(value),
        unit,
        unitUnmarked: Boolean(row.unitUnmarked),
        status: clean(row.emphasis) || "unknown",
        timestamp: clean(group.timestamp),
        dayLabel: source.dayLabel,
        dayDate: source.dayDate,
        numericValue: numericValue(value),
        sortTime: observationTime(source, group.timestamp),
        dayIndex: source.dayIndex,
        sourceOrder,
        groupOrder,
        rowOrder,
        source: provenance,
        parserProvenance: row.provenance || null
      });
      added += 1;
    }));
  }

  if (display.type === "medications") {
    display.groups.forEach((group, groupOrder) => group.rows.forEach((row, rowOrder) => {
      const [legacyName = "", legacyDose = "", legacyRoute = "", legacyAdministrations = ""] = row.cells || [];
      const medication = row.medication || {};
      const name = clean(medication.name || legacyName).replace(/\*\*/g, "").replace(/^(?:\[[^\]]+\]\s*)+/, "");
      if (!isMedicationName(name)) return;
      const administrations = (Array.isArray(medication.administrations)
        ? medication.administrations.map(clean).filter(Boolean)
        : clean(legacyAdministrations).split(/\s*(?:·|;)\s*/).filter(Boolean)
      ).map(formatAdministrationTime);
      const key = normalizedExact(name);
      if (!key) return;
      if (!medicationMap.has(key)) medicationMap.set(key, {
        id: stableId("medication", key, name),
        kind: "medication",
        name: clean(name),
        observations: []
      });
      const identity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}\u0000${groupOrder}\u0000${rowOrder}`;
      medicationMap.get(key).observations.push({
        id: stableId("medication_entry", identity, name),
        name: clean(name),
        dose: clean(medication.dose || legacyDose),
        rate: clean(medication.rate),
        route: clean(medication.route || legacyRoute),
        frequency: clean(medication.frequency),
        administrations,
        administrationTimes: administrations.join(" · "),
        latestAdministration: administrations.at(-1) || "",
        prnReason: clean(medication.prnReason),
        prnComment: clean(medication.prnComment),
        timing: clean(medication.timing),
        savedSection: clean(group.label),
        timestamp: clean(group.timestamp),
        dayLabel: source.dayLabel,
        dayDate: source.dayDate,
        sortTime: observationTime(source, group.timestamp),
        dayIndex: source.dayIndex,
        sourceOrder,
        groupOrder,
        rowOrder,
        source: provenance,
        parserProvenance: row.provenance || null
      });
      added += 1;
    }));
  }

  // The source parsed into zero structured candidates: keep the narrative
  // visible instead of dropping it silently.
  if (!added) {
    const fallback = narrativeFallbackCandidate(source, sourceOrder, provenance);
    return fallback ? [fallback] : [];
  }
  return [];
}

function finalizeMedicationCandidate(candidate) {
  const observations = [...candidate.observations].sort(compareObservations);
  const latestSavedEntry = observations.at(-1) || null;
  const describe = (entry) => {
    const regimen = [entry.dose, entry.route, entry.frequency].filter(Boolean).join(" ");
    const details = [regimen, entry.rate && `rate ${entry.rate}`, entry.latestAdministration && `last listed ${entry.latestAdministration}`].filter(Boolean).join(" · ");
    return `${entry.dayLabel}${details ? `: ${details}` : ""}`;
  };
  const scheduleLabel = latestSavedEntry ? medicationScheduleLabel(latestSavedEntry) : "";
  const regimen = latestSavedEntry ? [latestSavedEntry.dose, latestSavedEntry.route, latestSavedEntry.frequency].filter(Boolean).join(" · ") : "";
  const prnDetails = latestSavedEntry ? [latestSavedEntry.prnReason, latestSavedEntry.prnComment].filter(Boolean).join(" — ") : "";
  const finalized = {
    ...candidate,
    group: "medications",
    observations,
    history: observations,
    latestSavedEntry,
    dose: latestSavedEntry?.dose || "",
    rate: latestSavedEntry?.rate || "",
    route: latestSavedEntry?.route || "",
    frequency: latestSavedEntry?.frequency || "",
    scheduleLabel,
    regimen,
    administrations: latestSavedEntry?.administrations || [],
    administrationTimes: latestSavedEntry?.administrationTimes || "",
    latestAdministration: latestSavedEntry?.latestAdministration || "",
    prnReason: latestSavedEntry?.prnReason || "",
    prnComment: latestSavedEntry?.prnComment || "",
    insertionText: latestSavedEntry
      ? `${candidate.name}${regimen ? ` — ${regimen}` : ""}${latestSavedEntry.rate ? ` · rate ${latestSavedEntry.rate}` : ""}${latestSavedEntry.latestAdministration ? `; latest listed administration ${latestSavedEntry.latestAdministration}` : "; no administration documented"}${prnDetails ? `; documented PRN use: ${prnDetails}` : ""}${observations.length > 1 ? `; saved history ${observations.map(describe).join(" | ")}` : ""}`
      : candidate.name,
    // Final-note grouping: medications collapse into their own Medications
    // section at the very end of the note, never into Objective.
    noteGroupKey: "medications",
    noteGroupLabel: "Medications",
    noteLabel: candidate.name,
    noteDetail: [regimen, latestSavedEntry?.latestAdministration ? `latest ${latestSavedEntry.latestAdministration}` : "", scheduleLabel].filter(Boolean).join(" · "),
    searchText: clean([candidate.name, ...observations.flatMap((entry) => [entry.dose, entry.rate, entry.route, entry.frequency, entry.administrationTimes, entry.prnReason, entry.prnComment, entry.savedSection, entry.dayLabel])].join(" ")).toLocaleLowerCase("en-US")
  };
  finalized.fingerprint = fingerprint({
    id: finalized.id,
    entries: observations.map(({ id, dose, rate, route, frequency, administrationTimes, prnReason, prnComment, savedSection, dayLabel }) => ({ id, dose, rate, route, frequency, administrationTimes, prnReason, prnComment, savedSection, dayLabel }))
  });
  return finalized;
}

function coalesceUnitlessObservations(candidateMap) {
  for (const [key, candidate] of [...candidateMap.entries()]) {
    if (candidate.unit) continue;
    const sameNameWithUnits = [...candidateMap.values()].filter((other) =>
      other !== candidate && normalizedExact(other.name) === normalizedExact(candidate.name) && Boolean(other.unit)
    );
    if (sameNameWithUnits.length !== 1) continue;
    sameNameWithUnits[0].observations.push(...candidate.observations);
    candidateMap.delete(key);
  }
}

// Narrative notes (admission H&P, daily progress notes) embed the same clinical
// data the compact sheet shows — home meds, exam vitals, narrative labs, and
// study results — in prose. The extractor re-emits them in the canonical
// prompt-text formats, so they flow through the exact same display-model
// pipeline as pasted Epic/CPRS exports instead of a parallel candidate path.
const NOTE_CANONICAL_TEXTS = Object.freeze([
  Object.freeze({ key: "medications", sourceKind: "medication_activity", sectionLabel: "Medications" }),
  Object.freeze({ key: "vitals", sourceKind: "vital_signs", sectionLabel: "Vitals" }),
  Object.freeze({ key: "labs", sourceKind: "laboratory_results", sectionLabel: "Labs" })
]);

function studyResultCategory(label) {
  const normalized = normalizedExact(label);
  if (/\b(?:ct|cta|mri|mra|cxr|xr|x-?ray|us|ultrasound|echo|tte|tee|pet|kub|dexa)\b/.test(normalized)) return "imaging";
  if (/\bcultures?\b/.test(normalized) || /^(?:blood|sputum|urine|wound|csf)\b/.test(normalized)) return "microbiology";
  if (/\bpath(?:ology)?\b|\bbiopsy\b/.test(normalized)) return "pathology";
  return "other_results";
}

function noteClinicalSources(patient) {
  const notes = [];
  if (patient?.admissionPrimaryTeamNote) {
    notes.push({
      note: patient.admissionPrimaryTeamNote,
      label: "Admission H&P",
      scope: "admission",
      dayId: "admission",
      dayDate: "",
      dayLabel: "Admission",
      dayIndex: -1
    });
  }
  sortedDays(patient?.days || []).forEach((day, dayIndex) => {
    if (!day?.primaryTeamNote) return;
    notes.push({
      note: day.primaryTeamNote,
      label: `${clean(day.label) || `Hospital day ${dayIndex + 1}`} progress note`,
      scope: "daily",
      dayId: clean(day.id),
      dayDate: clean(day.date),
      dayLabel: clean(day.label) || `Hospital day ${dayIndex + 1}`,
      dayIndex
    });
  });
  const synthetic = [];
  notes.forEach((entry, noteOrder) => {
    const { note } = entry;
    if (!primaryTeamNoteHasContent(note)) return;
    const sections = {};
    for (const [fieldId, section] of Object.entries(note.sections || {})) {
      sections[fieldId] = section?.deidentifiedText || "";
    }
    const extracted = extractNoteClinicalData(sections, { noteType: note.noteType });
    const noteKey = clean(note.id) || `note_${noteOrder}`;
    for (const { key, sourceKind, sectionLabel } of NOTE_CANONICAL_TEXTS) {
      const text = extracted[`${key}Text`];
      if (!clean(text)) continue;
      synthetic.push({
        record: {
          id: `note_${noteKey}_${key}`,
          label: `${entry.label} ${sectionLabel}`,
          sourceKind,
          deidentifiedText: text
        },
        scope: entry.scope,
        sourceId: `note_${noteKey}_${key}`,
        sourceKind,
        sourceLabel: entry.label,
        dayId: entry.dayId,
        dayDate: entry.dayDate,
        dayLabel: entry.dayLabel,
        dayIndex: entry.dayIndex,
        capturedAt: clean(note.updatedAt || note.createdAt)
      });
    }
    extracted.studies.forEach((study, studyIndex) => {
      synthetic.push({
        record: {
          id: `note_${noteKey}_study_${studyIndex}`,
          label: study.label,
          sourceKind: "results",
          resultCategory: studyResultCategory(study.label),
          resultContext: entry.label,
          resultDate: "",
          deidentifiedText: study.text
        },
        scope: entry.scope,
        sourceId: `note_${noteKey}_study_${studyIndex}`,
        sourceKind: "results",
        sourceLabel: entry.label,
        dayId: entry.dayId,
        dayDate: entry.dayDate,
        dayLabel: entry.dayLabel,
        dayIndex: entry.dayIndex,
        capturedAt: clean(note.updatedAt || note.createdAt)
      });
    });
  });
  return synthetic;
}

// Explicit student confirmations for temperature readings whose source never
// stated a unit. The override resolves the ambiguity at the review boundary:
// every observation (and the note text built from it) carries the confirmed
// unit instead of a fabricated one.
function applyTemperatureUnitOverrides(candidates, overrides) {
  const confirmed = overrides && typeof overrides === "object" ? overrides : {};
  return (candidates || []).map((candidate) => {
    const unit = confirmed[candidate.id];
    if (!candidate.unitUnmarked || (unit !== "°F" && unit !== "°C")) return candidate;
    const observations = candidate.observations.map((observation) => ({ ...observation, unit, unitUnmarked: false }));
    const latest = observations.at(-1) || null;
    return {
      ...candidate,
      unit,
      unitUnmarked: false,
      observations,
      latest,
      insertionText: latest ? displayedObservation({ ...latest, unit }, { includeName: true }) : candidate.name,
      searchText: clean([candidate.name, unit, ...observations.flatMap((observation) => [observation.value, observation.status, observation.flag, observation.dayLabel, observation.timestamp, observation.source.sourceLabel])].join(" ")).toLocaleLowerCase("en-US")
    };
  });
}

export function buildClinicalReviewIndex(patient, options = {}) {
  const labMap = new Map();
  const vitalMap = new Map();
  const medicationMap = new Map();
  const diagnostics = [];
  const narratives = [];
  const sources = [...sourcesForPatient(patient), ...noteClinicalSources(patient)];

  sources.forEach((source, sourceOrder) => {
    if (source.sourceKind === "results") diagnostics.push(diagnosticCandidate(source));
    else narratives.push(...addClinicalSource(source, sourceOrder, labMap, vitalMap, medicationMap));
  });

  coalesceUnitlessObservations(vitalMap);
  const laboratoryPanels = [...labMap.values()].map(finalizeLaboratoryPanel);
  const labs = latestLaboratoryPanels(attachLaboratoryTrends(laboratoryPanels), {
    baselines: normalizeLabBaselines(patient?.labBaselines)
  });
  let vitals = [...vitalMap.values()].map((candidate) => {
    const finalized = finalizeObservationCandidate(candidate, "vitals");
    return { ...finalized, unitUnmarked: finalized.observations.some((observation) => observation.unitUnmarked) };
  });
  vitals = applyTemperatureUnitOverrides(vitals, options?.temperatureUnits);
  const latestVitalTime = vitals.flatMap((candidate) => candidate.observations)
    .filter((observation) => Number.isFinite(observation.numericValue) && Number.isFinite(observation.sortTime))
    .reduce((latest, observation) => Math.max(latest, observation.sortTime), Number.NEGATIVE_INFINITY);
  vitals = vitals.map((candidate) => {
    const statistics24h = vitalStatistics(candidate, latestVitalTime);
    const next = { ...candidate, statistics24h, insertionText: vitalInsertionText(candidate, statistics24h) };
    next.fingerprint = fingerprint({ id: next.id, observations: next.observations.map(({ id, value, unit, timestamp, dayLabel }) => ({ id, value, unit, timestamp, dayLabel })), statistics24h });
    // Final-note grouping: all vitals collapse into one Vitals table/line.
    next.noteGroupKey = NOTE_VITALS_GROUP_KEY;
    next.noteGroupLabel = NOTE_VITALS_GROUP_LABEL;
    const noteItem = vitalNoteItem(next);
    next.noteLabel = noteItem.label;
    next.noteDetail = noteItem.detail;
    next.noteRange = noteItem.range;
    next.noteMean = noteItem.mean;
    return next;
  });
  const medications = [...medicationMap.values()].map(finalizeMedicationCandidate);

  // Compact-sheet groupings. Systolic/diastolic pairs merge into one Blood
  // Pressure candidate; report-only placeholders and explicitly pending
  // results are lifted out of the panels into their own selectable lists;
  // laboratory rows are regrouped by source panel family (CBC, metabolic, ...).
  vitals = pairBloodPressureCandidates(vitals);
  const reportItems = extractReportItems(laboratoryPanels).map((item) => ({
    ...item,
    selectionCandidate: flaggedItemSelectionCandidate("report", item)
  }));
  const pendingItems = extractPendingItems(laboratoryPanels).map((item) => ({
    ...item,
    selectionCandidate: flaggedItemSelectionCandidate("pending", item)
  }));
  const labFamilies = labFamilySections(labs);

  const byGroup = new Map(GROUP_DEFINITIONS.map(({ id }) => [id, []]));
  for (const candidate of [...vitals, ...labs, ...medications, ...diagnostics, ...narratives]) byGroup.get(candidate.group)?.push(candidate);
  for (const candidates of byGroup.values()) candidates.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const groups = GROUP_DEFINITIONS.map((definition) => ({ ...definition, candidates: byGroup.get(definition.id) }));
  const candidates = groups.flatMap((group) => group.candidates);
  const objectiveCandidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const panel of labs) {
    for (const result of panel.results) objectiveCandidateMap.set(result.selectionCandidate.id, result.selectionCandidate);
  }
  for (const item of [...reportItems, ...pendingItems]) {
    objectiveCandidateMap.set(item.selectionCandidate.id, item.selectionCandidate);
  }
  const objectiveCandidates = [...objectiveCandidateMap.values()];
  return {
    patientId: clean(patient?.id),
    groups,
    candidates,
    objectiveCandidates,
    vitals: byGroup.get("vitals"),
    labs: byGroup.get("labs"),
    medications: byGroup.get("medications"),
    diagnosticResults: diagnostics.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    reportItems,
    pendingItems,
    labFamilies
  };
}

export function filterClinicalReviewCandidates(indexOrCandidates, query = "", { group = "" } = {}) {
  const candidates = Array.isArray(indexOrCandidates) ? indexOrCandidates : indexOrCandidates?.candidates || [];
  const normalizedQuery = normalizedExact(query);
  return candidates.filter((candidate) =>
    (!group || candidate.group === group)
    && (!normalizedQuery || candidate.searchText.includes(normalizedQuery))
  );
}