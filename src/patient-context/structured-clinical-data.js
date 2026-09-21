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
        provenance: row.provenance
      }))
    })),
    series: observationSeries(model)
  };
}

function medicationDisplay(model) {
  return {
    type: "medications",
    view: "medication_table",
    title: "Medication activity",
    columns: ["Medication", "Order", "Status / administrations", "Instructions"],
    groups: model.groups.map((group) => ({
      label: group.label,
      timestamp: group.timestamp,
      rows: group.rows.map((row) => ({
        id: row.id,
        cells: [
          row.name,
          [row.dose, row.frequency, row.route, row.timing].filter(Boolean).join(" · "),
          [...(row.status || []), ...(row.administrations || [])].join(" · "),
          row.instructions
        ],
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
  return [...series.values()];
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
    ["Oxygen saturation", "SpO2"],
    ["MAP (cuff)", "MAP"],
    ["Weight (kg)", "Weight"]
  ]);
  const lines = ["Vitals"];
  for (const group of model.groups) {
    const prefix = group.timestamp ? `@ ${group.timestamp}: ` : "";
    lines.push(`${prefix}${group.rows.map((row) => `${abbreviations.get(row.name) || row.name} ${row.value}`).join("; ")}`);
  }
  return lines.filter(Boolean).join("\n");
}

function medicationPrompt(model) {
  const lines = ["Medications"];
  for (const group of model.groups) {
    for (const row of group.rows) {
      const order = [row.dose, row.frequency, row.route, row.timing].filter(Boolean).join("; ");
      const activity = [...(row.status || []), ...(row.administrations || [])].join("; ");
      const details = [order, activity, row.instructions].filter(Boolean).join(" | ");
      lines.push(`${group.label ? `[${group.label}] ` : ""}${row.name}${details ? ` — ${details}` : ""}`);
    }
  }
  return lines.join("\n");
}

const SAVED_VITAL_NAMES = [
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
  ["Temp", "Temperature"]
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
      return {
        id: `saved_vital_${groups.length + 1}_${rowIndex + 1}`,
        name: SAVED_VITAL_LABELS.get(name) || name,
        value: clean(measurement.slice(name.length)),
        unit: ""
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
    if (!groups.has(groupLabel)) groups.set(groupLabel, []);
    groups.get(groupLabel).push({
      id: `saved_medication_${groups.size}_${groups.get(groupLabel).length + 1}`,
      cells: [clean(match[2]), clean(match[3]) || "—"],
      emphasis: "unknown",
      provenance: { sourceSystem: "Saved de-identified source", formatId: "saved_prompt_medications", group: groupLabel, timestamp: "", sourceIndex: null }
    });
  }
  if (!groups.size) return null;
  return {
    type: "medications",
    view: "medication_table",
    title: "Medication activity",
    columns: ["Medication", "Details"],
    groups: [...groups.entries()].map(([label, rows]) => ({ label, timestamp: "", rows })),
    provenance: { sourceSystem: "Saved de-identified source", formatId: "saved_prompt_medications", formatLabel: "Saved medication activity", extraction: "canonical_prompt_text" }
  };
}

export function clinicalDisplayModelFromPromptText(sourceKind, value) {
  const lines = String(value || "").split(/\r?\n/).map(clean).filter(Boolean);
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
