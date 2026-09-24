export const STRUCTURED_CLINICAL_DATA_SCHEMA = "prerounding_clinical_data_v1";

const EXPLICIT_FLAGS = new Map([
  ["H", "high"],
  ["HH", "high"],
  ["HIGH", "high"],
  ["L", "low"],
  ["LL", "low"],
  ["LOW", "low"],
  ["A", "abnormal"],
  ["ABN", "abnormal"],
  ["ABNORMAL", "abnormal"]
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedFlag(value) {
  return clean(value).replace(/^[[(]|[\])]$/g, "").replace(/\*/g, "").toUpperCase();
}

function finiteNumber(value) {
  const match = clean(value).match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function comparatorNumber(value) {
  const match = clean(value).match(/^([<>]=?)\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))$/);
  if (!match) return null;
  const number = Number(match[2]);
  return Number.isFinite(number) ? { operator: match[1], number } : null;
}

function numericRange(value) {
  const match = clean(value).match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:-|–|—|to)\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))$/i);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return Number.isFinite(low) && Number.isFinite(high) && low <= high ? { low, high } : null;
}

export function laboratoryAbnormality({ value = "", flag = "", referenceRange = "" } = {}) {
  const flagCode = normalizedFlag(flag);
  if (EXPLICIT_FLAGS.has(flagCode)) {
    return { status: EXPLICIT_FLAGS.get(flagCode), basis: "explicit_flag", flag: flagCode };
  }
  const number = finiteNumber(value);
  const range = numericRange(referenceRange);
  if (!range) return { status: "unknown", basis: "none", flag: flagCode };
  if (number === null) {
    const comparator = comparatorNumber(value);
    if (!comparator) return { status: "unknown", basis: "none", flag: flagCode };
    if (
      comparator.operator === "<" && comparator.number <= range.low ||
      comparator.operator === "<=" && comparator.number < range.low
    ) return { status: "low", basis: "reference_range_bound", flag: flagCode };
    if (
      comparator.operator === ">" && comparator.number >= range.high ||
      comparator.operator === ">=" && comparator.number > range.high
    ) return { status: "high", basis: "reference_range_bound", flag: flagCode };
    return { status: "unknown", basis: "indeterminate_bound", flag: flagCode };
  }
  if (number < range.low) return { status: "low", basis: "reference_range", flag: flagCode };
  if (number > range.high) return { status: "high", basis: "reference_range", flag: flagCode };
  return { status: "normal", basis: "reference_range", flag: flagCode };
}

export function clinicalDataModel({ kind, sourceSystem, formatId, formatLabel, groups = [] } = {}) {
  return {
    schema: STRUCTURED_CLINICAL_DATA_SCHEMA,
    kind,
    provenance: {
      sourceSystem: clean(sourceSystem),
      formatId: clean(formatId),
      formatLabel: clean(formatLabel),
      extraction: "standard_format_only"
    },
    groups: groups.map((group, groupIndex) => ({
      id: clean(group.id) || `group_${groupIndex + 1}`,
      label: clean(group.label),
      timestamp: clean(group.timestamp),
      rows: (group.rows || []).map((row, rowIndex) => ({
        id: clean(row.id) || `row_${groupIndex + 1}_${rowIndex + 1}`,
        ...row,
        provenance: {
          sourceSystem: clean(sourceSystem),
          formatId: clean(formatId),
          group: clean(group.label),
          timestamp: clean(group.timestamp),
          sourceIndex: Number.isInteger(row.sourceIndex) ? row.sourceIndex : null
        }
      }))
    }))
  };
}

function laboratoryDisplay(model) {
  return {
    type: "labs",
    view: "table_and_trends",
    title: "Laboratory results",
    columns: ["Test", "Result", "Units", "Reference range", "Flag"],
    groups: model.groups.map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      rows: group.rows.map((row) => ({
        id: row.id,
        cells: [row.name, row.value, row.unit, row.referenceRange, row.flag],
        emphasis: row.abnormality?.status || "unknown",
        provenance: row.provenance
      }))
    })),
    series: observationSeries(model)
  };
}

function vitalDisplay(model) {
  const series = observationSeries(model);
  return {
    type: "vitals",
    view: "table_and_trends",
    title: "Vital signs",
    columns: ["Recorded", "Measurement", "Value"],
    groups: model.groups.map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      rows: group.rows.map((row) => ({
        id: row.id,
        cells: [group.timestamp, row.name, row.value],
        emphasis: "unknown",
        unitUnmarked: Boolean(row.unitUnmarked),
        provenance: row.provenance
      }))
    })),
    series,
    statistics24h: vitalStatistics24h(series)
  };
}

function parseChartDate(value) {
  const text = clean(value);
  const hospitalDay = text.match(/^\[?Hospital Day\s+(\d+)\s+at\s+(\d{1,2}):(\d{2})\]?/i);
  if (hospitalDay) return new Date(2000, 0, Number(hospitalDay[1]), Number(hospitalDay[2]), Number(hospitalDay[3]));
  const priorDay = text.match(/^\[?(\d+)\s+days?\s+prior to hospital admission(?:\s+at\s+(\d{1,2}):(\d{2}))?\]?/i);
  if (priorDay) return new Date(2000, 0, 1 - Number(priorDay[1]), Number(priorDay[2] || 0), Number(priorDay[3] || 0));
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:\s+(\d{1,2})(?::?(\d{2}))?)?/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]), Number(match[4] || 0), Number(match[5] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function medicationDisplay(model) {
  return {
    type: "medications",
    view: "medication_table",
    title: "Medication activity",
    columns: ["Medication", "Current regimen", "Most recent administration", "Administration history"],
    groups: model.groups.map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      rows: group.rows.map((row) => ({
        id: row.id,
        cells: [
          row.name,
          [row.dose, row.rate && `rate ${row.rate}`, row.route, row.frequency].filter(Boolean).join(" · "),
          row.administrations?.at(-1) || "",
          (row.administrations || []).join(" · ")
        ],
        medication: {
          name: row.name,
          dose: row.dose || "",
          rate: row.rate || "",
          route: row.route || "",
          frequency: row.frequency || "",
          timing: row.timing || "",
          start: row.start || "",
          end: row.end || "",
          asOfDate: row.asOfDate || "",
          status: row.status || [],
          administrations: row.administrations || [],
          prnReason: row.prnReason || "",
          prnComment: row.prnComment || "",
          weightDosingInfo: row.weightDosingInfo || ""
        },
        emphasis: "unknown",
        provenance: row.provenance
      }))
    }))
  };
}

function observationSeries(model) {
  const series = new Map();
  for (const group of model.groups) {
    for (const row of group.rows) {
      const numericValue = finiteNumber(row.value);
      if (numericValue === null) continue;
      const unit = clean(row.unit);
      const key = `${row.name}\u0000${unit}`;
      if (!series.has(key)) series.set(key, { name: row.name, unit, points: [] });
      series.get(key).points.push({
        timestamp: group.timestamp,
        value: numericValue,
        unit,
        abnormality: row.abnormality?.status || "unknown",
        provenance: row.provenance
      });
    }
  }
  return [...series.values()].map((entry) => ({
    ...entry,
    points: [...entry.points].sort((left, right) => {
      const leftTime = parseChartDate(left.timestamp)?.getTime();
      const rightTime = parseChartDate(right.timestamp)?.getTime();
      return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? leftTime - rightTime : 0;
    })
  }));
}

function rounded(value) {
  return Number(value.toFixed(1));
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function vitalStatistics24h(series = []) {
  const timestamped = series.flatMap((entry) => entry.points.map((point) => parseChartDate(point.timestamp)?.getTime()).filter(Number.isFinite));
  const latest = timestamped.length ? Math.max(...timestamped) : null;
  return series.map((entry) => {
    const windowPoints = latest === null
      ? entry.points
      : entry.points.filter((point) => {
          const timestamp = parseChartDate(point.timestamp)?.getTime();
          return Number.isFinite(timestamp) && timestamp >= latest - 24 * 60 * 60 * 1000 && timestamp <= latest;
        });
    const values = windowPoints.map((point) => point.value).filter(Number.isFinite);
    if (!values.length) return null;
    return {
      name: entry.name,
      unit: entry.unit,
      count: values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      mean: rounded(values.reduce((total, value) => total + value, 0) / values.length),
      median: rounded(median(values))
    };
  }).filter(Boolean);
}

export function clinicalDisplayModel(model) {
  if (!model || model.schema !== STRUCTURED_CLINICAL_DATA_SCHEMA) return null;
  if (model.kind === "laboratory_results") return { ...laboratoryDisplay(model), provenance: model.provenance };
  if (model.kind === "vital_signs") return { ...vitalDisplay(model), provenance: model.provenance };
  if (model.kind === "medication_activity") return { ...medicationDisplay(model), provenance: model.provenance };
  return null;
}

function rowSuffix(row) {
  let suffix = row.unit ? ` ${row.unit}` : "";
  if (row.referenceRange) suffix += `; ref ${row.referenceRange}`;
  if (row.flag) suffix += `; flag ${row.flag}`;
  return suffix;
}

function laboratoryPrompt(model) {
  const lines = ["Labs"];
  for (const group of model.groups) {
    if (group.timestamp) lines.push(`@ ${group.timestamp}`);
    for (const row of group.rows) lines.push(`${row.name}: ${row.value}${rowSuffix(row)}`);
  }
  return lines.join("\n");
}

function vitalPrompt(model) {
  const abbreviations = new Map([
    ["Blood Pressure (cuff)", "BP"],
    ["Blood pressure", "BP"],
    ["Temperature", "Temp"],
    ["Respirations", "RR"],
    ["Respiratory rate", "RR"],
    ["Pulse", "HR"],
    ["Heart Rate (Monitored)", "HRm"],
    ["Systolic BP", "SBP"],
    ["Diastolic BP", "DBP"],
    ["Arterial Systolic BP", "Art SBP"],
    ["Arterial Diastolic BP", "Art DBP"],
    ["Oxygen saturation", "SpO2"],
    ["MAP (cuff)", "MAP"],
    ["MAP (arterial)", "Art MAP"],
    ["O2 Flow Rate", "O2 flow"],
    ["Weight (kg)", "Weight"]
  ]);
  const lines = ["Vitals"];
  for (const group of model.groups) {
    const prefix = group.timestamp ? `@ ${group.timestamp}: ` : "";
    // Units are part of the saved record: an explicit °F/°C marker survives
    // the round trip instead of being re-derived (or fabricated) on load.
    lines.push(`${prefix}${group.rows.map((row) => `${abbreviations.get(row.name) || row.name} ${row.value}${row.unit ? ` ${row.unit}` : ""}`).join("; ")}`);
  }
  return lines.filter(Boolean).join("\n");
}

function medicationPrompt(model) {
  const lines = ["Medications"];
  for (const group of model.groups) {
    for (const row of group.rows) {
      const activity = [...(row.status || []), ...(row.administrations || [])].join("; ");
      const details = [
        row.dose && `Dose: ${row.dose}`,
        row.rate && `Rate: ${row.rate}`,
        row.route && `Route: ${row.route}`,
        row.frequency && `Frequency: ${row.frequency}`,
        row.prnReason && `PRN reason: ${row.prnReason}`,
        row.prnComment && `PRN parameters: ${row.prnComment}`,
        activity && `Administrations: ${activity}`
      ].filter(Boolean).join(" | ");
      lines.push(`${group.label ? `[${group.label}] ` : ""}${row.name}${details ? ` — ${details}` : ""}`);
    }
  }
  return lines.join("\n");
}

const SAVED_VITAL_NAMES = [
  "Heart Rate (Monitored)",
  "Arterial Systolic BP",
  "Arterial Diastolic BP",
  "MAP (arterial)",
  "Systolic BP",
  "Diastolic BP",
  "O2 Flow Rate",
  "Art SBP",
  "Art DBP",
  "Art MAP",
  "O2 flow",
  "HRm",
  "SBP",
  "DBP",
  "FiO2",
  "Blood Pressure (cuff)",
  "Respiratory rate",
  "Oxygen saturation",
  "Temperature",
  "Respirations",
  "Weight (kg)",
  "RASS Score",
  "Braden Scale",
  "O2 Device",
  "MAP (cuff)",
  "Blood pressure",
  "Pulse",
  "Pain",
  "Weight",
  "Source",
  "SpO2",
  "Temp",
  "MAP",
  "BP",
  "HR",
  "RR"
].sort((left, right) => right.length - left.length);

const SAVED_VITAL_LABELS = new Map([
  ["BP", "Blood Pressure (cuff)"],
  ["HR", "Pulse"],
  ["RR", "Respirations"],
  ["Temp", "Temperature"],
  ["HRm", "Heart Rate (Monitored)"],
  ["SBP", "Systolic BP"],
  ["DBP", "Diastolic BP"],
  ["Art SBP", "Arterial Systolic BP"],
  ["Art DBP", "Arterial Diastolic BP"],
  ["Art MAP", "MAP (arterial)"],
  ["O2 flow", "O2 Flow Rate"],
  ["MAP", "MAP (cuff)"]
]);

const SAVED_VITAL_UNITS = new Map([
  // NOTE: Temperature is intentionally absent. An unmarked temperature must
  // never be assigned a unit by the loader; ambiguity is carried explicitly
  // via unitUnmarked and resolved by the student at the review boundary.
  ["Pulse", "bpm"],
  ["Heart Rate (Monitored)", "bpm"],
  ["Respirations", "breaths/min"],
  ["Respiratory rate", "breaths/min"],
  ["Blood Pressure (cuff)", "mmHg"],
  ["Blood pressure", "mmHg"],
  ["Systolic BP", "mmHg"],
  ["Diastolic BP", "mmHg"],
  ["Arterial Systolic BP", "mmHg"],
  ["Arterial Diastolic BP", "mmHg"],
  ["MAP (cuff)", "mmHg"],
  ["MAP (arterial)", "mmHg"],
  ["SpO2", "%"],
  ["Oxygen saturation", "%"],
  ["FiO2", "%"],
  ["O2 Flow Rate", "L/min"],
  ["Weight", "kg"],
  ["Weight (kg)", "kg"]
]);

function savedLaboratoryModel(lines) {
  const groups = [];
  let group = { id: "saved_labs_1", label: "Laboratory results", timestamp: "", rows: [] };
  groups.push(group);
  for (const line of lines.slice(1)) {
    if (line.startsWith("@ ")) {
      group = { id: `saved_labs_${groups.length + 1}`, label: "Laboratory results", timestamp: clean(line.slice(2)), rows: [] };
      groups.push(group);
      continue;
    }
    const match = line.match(/^(.+):\s+((?:(?:[<>]=?\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+)|positive\b|negative\b|detected\b|not detected\b|reactive\b|nonreactive\b|pending\b|present\b|absent\b|rpt\b).*)$/i);
    if (!match) continue;
    const details = match[2].split(/;\s*/);
    const resultAndUnit = clean(details.shift());
    const numeric = resultAndUnit.match(/^([<>]=?\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s+(.+))?$/);
    const value = numeric ? clean(numeric[1]) : resultAndUnit;
    const unit = numeric ? clean(numeric[2]) : "";
    const referenceRange = clean(details.find((part) => /^ref\s+/i.test(part))?.replace(/^ref\s+/i, ""));
    const flag = clean(details.find((part) => /^flag\s+/i.test(part))?.replace(/^flag\s+/i, ""));
    group.rows.push({
      id: `saved_lab_${groups.length}_${group.rows.length + 1}`,
      name: clean(match[1]),
      value,
      unit,
      referenceRange,
      flag,
      abnormality: laboratoryAbnormality({ value, flag, referenceRange })
    });
  }
  const populated = groups.filter((entry) => entry.rows.length);
  return populated.length
    ? clinicalDataModel({ kind: "laboratory_results", sourceSystem: "Saved de-identified source", formatId: "saved_prompt_labs", formatLabel: "Saved laboratory results", groups: populated })
    : null;
}

// Explicit unit tokens the saved "Vitals" text may carry. Parsed back
// verbatim so an explicit °F never degrades into the legacy °C assumption.
const EXPLICIT_VITAL_UNIT_PATTERN = /(°F|°C|breaths\/min|L\/min|mmHg|bpm|kg|%)(?=\s*$)/i;

function splitSavedVitalValue(text) {
  const remainder = clean(text);
  const match = remainder.match(EXPLICIT_VITAL_UNIT_PATTERN);
  if (!match) return { value: remainder, unit: "" };
  return { value: clean(remainder.slice(0, match.index)), unit: match[1] };
}

function savedVitalModel(lines) {
  const groups = [];
  for (const line of lines.slice(1)) {
    let text = clean(line);
    let timestamp = "";
    if (text.startsWith("@ ")) {
      const firstMeasurement = SAVED_VITAL_NAMES
        .map((name) => ({ name, index: text.indexOf(name, 2) }))
        .filter(({ index }) => index > 2)
        .sort((left, right) => left.index - right.index)[0];
      if (!firstMeasurement) continue;
      timestamp = clean(text.slice(2, firstMeasurement.index).replace(/:\s*$/, ""));
      text = text.slice(firstMeasurement.index);
    }
    const rows = text.split(/;\s*/).map((measurement, rowIndex) => {
      const name = SAVED_VITAL_NAMES.find((candidate) => measurement === candidate || measurement.startsWith(`${candidate} `));
      if (!name) return null;
      const normalizedName = SAVED_VITAL_LABELS.get(name) || name;
      const parsed = splitSavedVitalValue(measurement.slice(name.length));
      // Legacy saved text wrote temperatures without a unit; the old loader
      // fabricated °C. Keep that ambiguity visible instead of re-fabricating
      // it: an unmarked temperature carries no unit at all.
      const unitUnmarked = !parsed.unit && normalizedName === "Temperature";
      const unit = unitUnmarked ? "" : (parsed.unit || SAVED_VITAL_UNITS.get(normalizedName) || "");
      return {
        id: `saved_vital_${groups.length + 1}_${rowIndex + 1}`,
        name: normalizedName,
        value: parsed.value,
        unit,
        unitUnmarked
      };
    }).filter(Boolean);
    if (rows.length) groups.push({ id: `saved_vitals_${groups.length + 1}`, label: "Vital signs", timestamp, rows });
  }
  return groups.length
    ? clinicalDataModel({ kind: "vital_signs", sourceSystem: "Saved de-identified source", formatId: "saved_prompt_vitals", formatLabel: "Saved vital signs", groups })
    : null;
}

function savedMedicationDisplay(lines) {
  const groups = new Map();
  for (const line of lines.slice(1)) {
    const match = clean(line).match(/^(?:\[([^\]]+)\]\s*)?(.+?)(?:\s+—\s+(.+))?$/);
    if (!match) continue;
    const groupLabel = clean(match[1]) || "Medication activity";
    const name = clean(match[2]).replace(/\*\*/g, "").replace(/^(?:\[[^\]]+\]\s*)+/, "");
    if (!name || /^(?:Rate|Dose|Freq(?:uency)?|Route|Start|End|PRN Reasons?|PRN Comment|Weight Dosing Info|Admin(?:istration)? Instructions?|Order specific questions?|\d{3,4}(?:-See Alt)?)(?:\s*:|$)/i.test(name)) continue;
    const details = clean(match[3]);
    const detailParts = details.split(/\s+\|\s+/).filter(Boolean);
    const labeled = Object.fromEntries(detailParts.map((part) => {
      const field = part.match(/^(Dose|Rate|Route|Frequency|Administrations|PRN reason|PRN parameters)\s*:\s*(.*)$/i);
      return field ? [field[1].toLowerCase().replace(/\s+/g, ""), clean(field[2])] : ["", ""];
    }).filter(([key]) => key));
    let dose = labeled.dose || "";
    let rate = labeled.rate || "";
    let route = labeled.route || "";
    let frequency = labeled.frequency || "";
    let administrations = labeled.administrations || "";
    let prnReason = labeled.prnreason || "";
    let prnComment = labeled.prnparameters || "";
    if (!Object.keys(labeled).length) {
      const [legacyOrder = "", legacyActivity = ""] = detailParts;
      const orderParts = legacyOrder.split(/;\s*/).map(clean).filter(Boolean);
      route = orderParts.find((part) => /^(?:PO|IV|IM|SC|SQ|SL|TD|INH|ORAL|RECTAL|SWISH\s*&\s*SPIT|PER\s+(?:G|NG|NJ|PEG)\s+TUBE)$/i.test(part)) || "";
      dose = orderParts.find((part) => part !== route && !/^(?:start|end)\s+|^(?:Day \d+|Starts in \d+ days?|Course ended)$|^(?:once|daily|nightly|continuous|titrated|on call|every\b|q\d+h\b|\d+x\s*daily\b|\d+ times? daily)/i.test(part)) || "";
      frequency = orderParts.find((part) => /^(?:once|daily|nightly|continuous|titrated|on call|every\b|q\d+h\b|\d+x\s*daily\b|\d+ times? daily)/i.test(part)) || "";
      administrations = legacyActivity;
    }
    const administrationList = administrations.split(/\s*;\s*/).map(clean).filter(Boolean);
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push({
      id: `saved_medication_${groups.size}_${groups.get(groupLabel).length + 1}`,
      cells: [
        name,
        [dose, rate && `rate ${rate}`, route, frequency].filter(Boolean).join(" · "),
        administrationList.at(-1) || "",
        administrationList.join(" · ")
      ],
      medication: {
        name,
        dose,
        rate,
        route,
        frequency,
        timing: "",
        start: "",
        end: "",
        asOfDate: "",
        status: [],
        administrations: administrationList,
        prnReason,
        prnComment,
        weightDosingInfo: ""
      },
      emphasis: "unknown",
      provenance: { sourceSystem: "Saved de-identified source", formatId: "saved_prompt_medications", group: groupLabel, timestamp: "", sourceIndex: null }
    });
  }
  if (!groups.size) return null;
  return {
    type: "medications",
    view: "medication_table",
    title: "Medication activity",
    columns: ["Medication", "Current regimen", "Most recent administration", "Administration history"],
    groups: [...groups.entries()].map(([label, rows]) => ({ label, timestamp: "", rows })),
    provenance: { sourceSystem: "Saved de-identified source", formatId: "saved_prompt_medications", formatLabel: "Saved medication activity", extraction: "canonical_prompt_text" }
  };
}

export function clinicalDisplayModelFromPromptText(sourceKind, value) {
  // Quick De-ID review artifacts (latest-result / lab ordinal tags) must never
  // leak into clinical parsing: strip them from every line before dispatching
  // to the vitals / labs / medication parsers.
  const deidLabTagPattern = /\*\*\[LATEST_RESULT\]\*\*\s*|\[Lab\s+\d+\/\d+\]\s*/gi;
  const lines = String(value || "").split(/\r?\n/).map((line) => clean(line).replace(deidLabTagPattern, "").trim()).filter(Boolean);
  if (!lines.length) return null;
  if (sourceKind === "laboratory_results" && lines[0] === "Labs") {
    const model = savedLaboratoryModel(lines);
    return model ? clinicalDisplayModel(model) : null;
  }
  if (sourceKind === "vital_signs" && lines[0] === "Vitals") {
    const model = savedVitalModel(lines);
    return model ? clinicalDisplayModel(model) : null;
  }
  if (sourceKind === "medication_activity" && lines[0] === "Medications") return savedMedicationDisplay(lines);
  return null;
}

export function clinicalPromptText(model) {
  if (!model || model.schema !== STRUCTURED_CLINICAL_DATA_SCHEMA) return "";
  if (model.kind === "laboratory_results") return laboratoryPrompt(model);
  if (model.kind === "vital_signs") return vitalPrompt(model);
  if (model.kind === "medication_activity") return medicationPrompt(model);
  return "";
}

export function withClinicalRepresentations(result, model) {
  const promptText = clinicalPromptText(model);
  return {
    ...result,
    structuredData: model,
    displayModel: clinicalDisplayModel(model),
    promptText,
    outputText: promptText
  };
}
