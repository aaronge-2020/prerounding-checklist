import { decodeClinicalClipboardText, parseEpicClinicalExport } from "./epic-clinical-export-parser.js?v=20260921-lab-panel-ui";
import {
  clinicalDataModel,
  laboratoryAbnormality,
  withClinicalRepresentations
} from "./structured-clinical-data.js?v=20260921-lab-panel-ui";

const REPORT_SEPARATOR = /^\s*[-=]{20,}\s*$/;
const MEDICATION_STATUS = /\b(?:ADMINISTERED|CANCELLED|CANCELED|DISCONTINUED|GIVEN|HELD|MISSED|NOT GIVEN|REFUSED|STOPPED|BCMA EXPIRED)\b/i;
const NARRATIVE_SOURCE_KINDS = new Set([
  "primary_note",
  "consult_note",
  "prior_physical_exam",
  "pre_round_physical_exam",
  "physical_exam",
  "bedside_update",
  "other_chart_text"
]);

function normalizeNewlines(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function compactLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function tableCells(value) {
  return String(value || "")
    .split("|")
    .map((cell) => compactLine(cell))
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.map((value) => compactLine(value)).filter(Boolean))];
}

function trimBlankLines(lines = []) {
  let start = 0;
  let end = lines.length;
  while (start < end && !String(lines[start] || "").trim()) start += 1;
  while (end > start && !String(lines[end - 1] || "").trim()) end -= 1;
  return lines.slice(start, end);
}

function collapseBlankLines(lines = []) {
  const output = [];
  for (const line of trimBlankLines(lines)) {
    if (!String(line || "").trim() && !String(output.at(-1) || "").trim()) continue;
    output.push(String(line || "").replace(/[ \t]+$/g, ""));
  }
  return output;
}

function timingCell(value) {
  const text = compactLine(value);
  return /^(?:@\s*\d|Hospital Day\b|\d+\s+days?\s+prior\b|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\d{3,4}(?:\s+\d{3,4})*)/i.test(text);
}

function administrationMetadata(value) {
  const text = compactLine(value);
  return /^(?:RPH|RN)\s*:/i.test(text) || /^(?:ID\s+)?[a-z]{2,6}\s+(?:Hospital Day|\d+\s+days?\s+prior).*@\d/i.test(text);
}

function cleanMedicationCell(value) {
  return compactLine(value)
    .replace(/\*{2,}/g, "")
    .replace(/\bLATEST_RESULT\b/gi, "")
    .replace(/\bLab\s+\d+\/\d+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function medicationBlocks(lines = []) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (/^\s*INPATIENT\s*\|/i.test(line)) {
      if (current?.length) blocks.push(current);
      current = [line];
      continue;
    }
    if (!current) continue;
    if (REPORT_SEPARATOR.test(line)) {
      if (current.length) blocks.push(current);
      current = null;
      continue;
    }
    current.push(line);
  }
  if (current?.length) blocks.push(current);
  return blocks;
}

function parseMedicationBlock(block = []) {
  const order = [];
  const timing = [];
  const status = [];
  const instructions = [];
  let inInstructions = false;

  for (const rawLine of block.slice(1)) {
    const cells = tableCells(rawLine);
    for (const rawCell of cells) {
      const cell = cleanMedicationCell(rawCell);
      if (!cell) continue;
      if (/^Special Instructions\s*:?$/i.test(cell)) {
        inInstructions = true;
        continue;
      }
      if (inInstructions) {
        instructions.push(cell);
        continue;
      }
      if (MEDICATION_STATUS.test(cell)) {
        status.push(cell);
        continue;
      }
      if (administrationMetadata(cell)) continue;
      if (timingCell(cell)) {
        timing.push(cell.replace(/\s+ID\s+[a-z]{2,6}$/i, ""));
        continue;
      }
      order.push(cell);
    }
  }

  const orderText = unique(order).join(" ");
  if (!orderText || !/(?:\bGive\s*:|\b(?:MG|MCG|GRAMS?|ML|UNITS?)\b|\b(?:TAB|CAP|INJ|SOLN)\b)/i.test(orderText)) return null;
  return {
    orderText,
    timing: unique(timing),
    status: unique(status),
    instructions: unique(instructions)
  };
}

function renderMedicationReport(lines = []) {
  const reportHeader = lines.some((line) => /\*{0,2}\s*INPATIENT ORDERS\s*\*{0,2}/i.test(line));
  const administrationHeader = lines.some((line) => /MEDICATION ADMINISTRATION HISTORY/i.test(line));
  const blocks = medicationBlocks(lines);
  const cprsTableHeader =
    lines.some((line) => /^\s*Location\s*\|/i.test(line)) &&
    lines.some((line) => /Start Date\s+Stop Date/i.test(line)) &&
    blocks.length >= 2;
  if (!reportHeader && !administrationHeader && !cprsTableHeader) return null;
  const medications = blocks.map(parseMedicationBlock).filter(Boolean);
  if (!medications.length) return null;

  const formatId = administrationHeader ? "cprs_mar" : "cprs_inpatient_orders";
  const formatLabel = administrationHeader ? "CPRS medication administration report" : "CPRS inpatient-order table";
  const model = clinicalDataModel({
    kind: "medication_activity",
    sourceSystem: "CPRS",
    formatId,
    formatLabel,
    groups: [{
      id: "medications_1",
      label: "Medication activity",
      timestamp: "",
      rows: medications.map((medication, index) => ({
        id: `medication_${index + 1}`,
        name: medication.orderText,
        dose: "",
        frequency: "",
        route: "",
        timing: medication.timing.join("; "),
        status: medication.status,
        administrations: [],
        instructions: medication.instructions.join(" "),
        sourceIndex: index
      }))
    }]
  });
  return withClinicalRepresentations({
    recognized: true,
    formatId,
    formatLabel,
    suggestedSourceKind: "medication_activity",
    itemCount: medications.length,
    summary: `${medications.length} medication ${medications.length === 1 ? "entry" : "entries"}; report columns, separators, and pharmacy routing rows removed.`,
    preservedUnparsedText: false
  }, model);
}

function previousPanelTitle(lines, timelineIndex) {
  for (let index = timelineIndex - 1; index >= Math.max(0, timelineIndex - 5); index -= 1) {
    const candidate = compactLine(lines[index]);
    if (!candidate) continue;
    if (/^(?:SIGNIFICANT )?LABORATORY DATA\s*:?$/i.test(candidate) || /^No data available for\b/i.test(candidate)) continue;
    return { index, title: candidate };
  }
  return { index: timelineIndex, title: "Laboratory panel" };
}

function parseCprsLaboratoryTables(lines = []) {
  const panels = [];
  for (let index = 0; index < lines.length; index += 1) {
    const timeline = compactLine(lines[index]).match(/^Timeline\s*:\s*(.+)$/i);
    if (!timeline) continue;
    let headerIndex = index + 1;
    while (headerIndex < Math.min(lines.length, index + 6) && !/Test Name\s+Result/i.test(lines[headerIndex])) headerIndex += 1;
    if (headerIndex >= Math.min(lines.length, index + 6)) continue;
    let rowIndex = headerIndex + 1;
    while (rowIndex < lines.length && (/^\s*-{3,}/.test(lines[rowIndex]) || !String(lines[rowIndex] || "").trim())) rowIndex += 1;
    const rows = [];
    while (rowIndex < lines.length) {
      const row = compactLine(lines[rowIndex]);
      if (!row || /^Timeline\s*:/i.test(row) || REPORT_SEPARATOR.test(row)) break;
      if (!/^Test Name\s+Result/i.test(row)) rows.push(row);
      rowIndex += 1;
    }
    if (!rows.length) continue;
    const panel = previousPanelTitle(lines, index);
    panels.push({
      title: panel.title,
      timeline: timeline[1],
      rows,
      range: [panel.index, Math.max(headerIndex, rowIndex - 1)]
    });
    index = Math.max(index, rowIndex - 1);
  }
  return panels;
}

function parseCprsLabRow(text, sourceIndex) {
  const row = compactLine(text);
  const match = row.match(/^(.*?)\s+((?:[<>]=?\s*)?[-+]?(?:\d+(?:\.\d+)?|\.\d+)|positive|negative|detected|not detected|reactive|nonreactive|pending)(?:\s+\(?([HL]{1,2}|A|ABN)\)?)?\s+(\S+)\s+([-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:-|–|—|to)\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+))$/i);
  if (!match) {
    return {
      name: row,
      value: "",
      unit: "",
      referenceRange: "",
      flag: "",
      abnormality: laboratoryAbnormality(),
      sourceIndex
    };
  }
  const [, name, value, flag = "", unit, referenceRange] = match;
  return {
    name: compactLine(name),
    value: compactLine(value),
    unit: compactLine(unit),
    referenceRange: compactLine(referenceRange),
    flag: compactLine(flag),
    abnormality: laboratoryAbnormality({ value, flag, referenceRange }),
    sourceIndex
  };
}

function parseCprsVitals(lines = []) {
  const headerIndex = lines.findIndex((line) => /DATE\s*\/\s*TIME\s+TEMP\s+PULSE\s+RESP\s+BP\s+PAIN\s+WEIGHT/i.test(line));
  if (headerIndex < 0) return null;
  const rows = [];
  let endIndex = headerIndex + 1;
  while (endIndex < lines.length && String(lines[endIndex] || "").trim() && /@\s*\d{1,4}\b/.test(lines[endIndex])) {
    const row = compactLine(lines[endIndex]);
    if (row) rows.push(row);
    endIndex += 1;
  }
  if (!rows.length) return null;
  const groups = rows.map((row, rowIndex) => {
    const match = row.match(/^(.*?)\s+@\s*(\d{1,4})\s+(.+)$/);
    if (!match) return { id: `vitals_${rowIndex + 1}`, label: "Vital signs", timestamp: "", rows: [{ name: "Vital-sign row", value: row, unit: "", sourceIndex: headerIndex + 1 + rowIndex }] };
    const values = match[3].split(/\s+/).filter(Boolean);
    if (values.length < 5) return { id: `vitals_${rowIndex + 1}`, label: "Vital signs", timestamp: `${match[1]} @ ${match[2]}`, rows: [{ name: "Vital-sign row", value: match[3], unit: "", sourceIndex: headerIndex + 1 + rowIndex }] };
    const labels = ["Temperature", "Pulse", "Respiratory rate", "Blood pressure", "Pain", "Weight"];
    return {
      id: `vitals_${rowIndex + 1}`,
      label: "Vital signs",
      timestamp: `${match[1]} @ ${match[2]}`,
      rows: values.slice(0, labels.length).map((value, index) => ({
        id: `vital_${rowIndex + 1}_${index + 1}`,
        name: labels[index],
        value,
        unit: "",
        sourceIndex: headerIndex + 1 + rowIndex
      }))
    };
  });
  return { groups, rowCount: rows.length, range: [headerIndex, endIndex - 1] };
}

function rangeIndexes(ranges = []) {
  const indexes = new Set();
  for (const [start, end] of ranges) for (let index = start; index <= end; index += 1) indexes.add(index);
  return indexes;
}

function renderCprsStructuredTables(lines = []) {
  const vitals = parseCprsVitals(lines);
  const labs = parseCprsLaboratoryTables(lines);
  if (!vitals && !labs.length) return null;

  const ranges = [];
  if (vitals) ranges.push(vitals.range);
  if (labs.length) ranges.push(...labs.map((panel) => panel.range));
  const removed = rangeIndexes(ranges);
  const remainder = collapseBlankLines(lines.filter((_, index) => !removed.has(index))).join("\n").trim();
  const counts = [];
  if (vitals) counts.push(`${vitals.rowCount} vital-sign ${vitals.rowCount === 1 ? "row" : "rows"}`);
  if (labs.length) counts.push(`${labs.reduce((total, panel) => total + panel.rows.length, 0)} laboratory results`);
  if (remainder) counts.push("non-table text preserved unchanged");

  const sections = [];
  if (vitals) {
    const formatId = "cprs_vitals";
    const formatLabel = "CPRS vital-sign table";
    const model = clinicalDataModel({ kind: "vital_signs", sourceSystem: "CPRS", formatId, formatLabel, groups: vitals.groups });
    sections.push({
      id: "cprs_vitals_1",
      sourceKind: "vital_signs",
      ...withClinicalRepresentations({
        recognized: true,
        formatId,
        formatLabel,
        suggestedSourceKind: "vital_signs",
        itemCount: vitals.groups.reduce((total, group) => total + group.rows.length, 0),
        summary: `${vitals.rowCount} vital-sign ${vitals.rowCount === 1 ? "row" : "rows"}.`,
        preservedUnparsedText: false
      }, model)
    });
  }
  if (labs.length) {
    const formatId = "cprs_labs";
    const formatLabel = "CPRS laboratory tables";
    const model = clinicalDataModel({
      kind: "laboratory_results",
      sourceSystem: "CPRS",
      formatId,
      formatLabel,
      groups: labs.map((panel, panelIndex) => ({
        id: `panel_${panelIndex + 1}`,
        label: panel.title,
        timestamp: panel.timeline,
        rows: panel.rows.map((row, rowIndex) => ({
          id: `lab_${panelIndex + 1}_${rowIndex + 1}`,
          ...parseCprsLabRow(row, panel.range[0] + rowIndex)
        }))
      }))
    });
    sections.push({
      id: "cprs_labs_1",
      sourceKind: "laboratory_results",
      ...withClinicalRepresentations({
        recognized: true,
        formatId,
        formatLabel,
        suggestedSourceKind: "laboratory_results",
        itemCount: labs.reduce((total, panel) => total + panel.rows.length, 0),
        summary: `${labs.reduce((total, panel) => total + panel.rows.length, 0)} laboratory results.`,
        preservedUnparsedText: false
      }, model)
    });
  }
  if (remainder) {
    sections.push({
      id: "cprs_unparsed_1",
      sourceKind: "other_chart_text",
      recognized: false,
      formatId: "unparsed_cprs_text",
      formatLabel: "Unparsed CPRS text",
      outputText: remainder,
      promptText: remainder,
      itemCount: 0,
      summary: "Narrative text preserved unchanged.",
      preservedUnparsedText: true
    });
  }

  const formatId = sections.length > 1 ? "cprs_mixed_tables" : sections[0].formatId;
  const formatLabel = sections.length > 1 ? "Mixed CPRS text with structured tables" : sections[0].formatLabel;
  return {
    recognized: true,
    formatId,
    formatLabel,
    suggestedSourceKind: sections.length === 1 ? sections[0].sourceKind : "",
    sections: sections.length > 1 ? sections : undefined,
    structuredData: sections.length === 1 ? sections[0].structuredData : undefined,
    displayModel: sections.length === 1 ? sections[0].displayModel : undefined,
    displayModels: sections.filter((section) => section.displayModel).map((section) => section.displayModel),
    promptText: sections.map((section) => section.promptText || section.outputText).join("\n\n"),
    outputText: sections.map((section) => section.outputText).join("\n\n"),
    itemCount: sections.reduce((total, section) => total + section.itemCount, 0),
    summary: `${counts.join("; ")}.`,
    preservedUnparsedText: Boolean(remainder)
  };
}

function delimitedCells(line) {
  if (line.includes("\t")) return line.split("\t").map(compactLine);
  if (line.includes("|")) {
    const cells = line.split("|").map(compactLine);
    if (!cells[0]) cells.shift();
    if (!cells.at(-1)) cells.pop();
    return cells;
  }
  return [];
}

const EPIC_WIDE_VITAL_HEADERS = [
  "Date/Time",
  "Temp",
  "Pulse",
  "Heart Rate (Monitored)",
  "Resp",
  "BP",
  "MAP",
  "Arterial BP",
  "Arterial MAP",
  "SpO2",
  "O2 Device",
  "O2 Flow Rate",
  "FiO2",
  "Weight"
];

function cleanVitalCell(value) {
  return compactLine(value).replace(/^\*\*(.*?)\*\*$/, "$1").replace(/^[—–-]$/, "");
}

function vitalTableHeaders(line) {
  const cells = delimitedCells(line);
  if (cells.length >= 8 && /date\s*\/\s*time/i.test(cells[0]) && cells.some((cell) => /(?:temp|spo2|heart rate|resp)/i.test(cell))) return cells;
  const compactHeader = cells.join(" ");
  if (/date\s*\/\s*time.*temp.*heart rate.*spo2/i.test(compactHeader)) return EPIC_WIDE_VITAL_HEADERS;
  return [];
}

function numberAndUnit(value, defaultUnit = "") {
  const match = cleanVitalCell(value).match(/([-+]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return match ? { value: match[1], unit: defaultUnit } : null;
}

function vitalRowsForCell(name, rawValue, sourceIndex) {
  const value = cleanVitalCell(rawValue);
  if (!value) return [];
  const row = (measurement, parsedValue, unit = "") => ({ name: measurement, value: parsedValue, unit, sourceIndex });
  if (/^(?:BP|Blood Pressure)$/i.test(name) || /^Arterial BP$/i.test(name)) {
    const match = value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (!match) return [row(name, value)];
    const prefix = /^Arterial/i.test(name) ? "Arterial " : "";
    return [row(`${prefix}Systolic BP`, match[1], "mmHg"), row(`${prefix}Diastolic BP`, match[2], "mmHg")];
  }
  const definitions = [
    [/^(?:Temp|Temperature)$/i, "Temperature", "°C"],
    [/^Pulse$/i, "Pulse", "bpm"],
    [/^Heart Rate/i, "Heart Rate (Monitored)", "bpm"],
    [/^(?:Resp|Respirations|Respiratory Rate)$/i, "Respirations", "breaths/min"],
    [/^MAP$/i, "MAP (cuff)", "mmHg"],
    [/^Arterial MAP$/i, "MAP (arterial)", "mmHg"],
    [/^SpO2/i, "SpO2", "%"],
    [/^O2 Flow/i, "O2 Flow Rate", "L/min"],
    [/^FiO2/i, "FiO2", "%"],
    [/^Weight/i, "Weight", "kg"]
  ];
  const definition = definitions.find(([pattern]) => pattern.test(name));
  if (!definition) return [row(name.replace(/^\$\s*/, ""), value)];
  const numeric = numberAndUnit(value, definition[2]);
  return numeric ? [row(definition[1], numeric.value, numeric.unit)] : [row(definition[1], value)];
}

function renderWideVitalTable(lines = []) {
  const headerIndex = lines.findIndex((line, index) => index < 12 && vitalTableHeaders(line).length);
  if (headerIndex < 0) return null;
  const originalHeaders = vitalTableHeaders(lines[headerIndex]);
  const headers = originalHeaders.length === 1 || originalHeaders.slice(1).every((header) => !header)
    ? EPIC_WIDE_VITAL_HEADERS
    : originalHeaders.map((header) => compactLine(header));
  const groups = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = delimitedCells(lines[index]);
    if (!cells.length || cells.every((cell) => /^:?-{3,}:?$/.test(compactLine(cell)))) continue;
    const timestamp = cleanVitalCell(cells[0]);
    if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{3,4}$/.test(timestamp)) continue;
    const rows = headers.slice(1).flatMap((header, cellIndex) => vitalRowsForCell(header, cells[cellIndex + 1], index));
    if (rows.length) groups.push({ id: `vitals_${groups.length + 1}`, label: "Vital signs", timestamp, rows: rows.map((row, rowIndex) => ({ id: `vital_${groups.length + 1}_${rowIndex + 1}`, ...row })) });
  }
  if (!groups.length) return null;
  const formatId = "epic_wide_vitals";
  const formatLabel = "Epic vital-sign flowsheet";
  const model = clinicalDataModel({ kind: "vital_signs", sourceSystem: "Epic", formatId, formatLabel, groups });
  const itemCount = groups.reduce((total, group) => total + group.rows.length, 0);
  return withClinicalRepresentations({
    recognized: true,
    formatId,
    formatLabel,
    suggestedSourceKind: "vital_signs",
    itemCount,
    summary: `${groups.length} time points and ${itemCount} vital-sign measurements; empty cells removed.`,
    preservedUnparsedText: false
  }, model);
}

const FRAGMENTED_LAB_CELL = /^\s*\|\s*\|\s*$/;
const FRAGMENTED_LAB_RULE = /^\s*\|\s*-+\s*\|\s*$/;
const FRAGMENTED_LAB_TIMESTAMP = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?$/i;

function cleanFragmentedLabCell(value) {
  return compactLine(value)
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/\\\*/g, "*")
    .replace(/\\\s+/g, " ")
    .trim();
}

function fragmentedLabCells(lines = []) {
  const cells = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!FRAGMENTED_LAB_CELL.test(lines[index]) || !FRAGMENTED_LAB_RULE.test(lines[index + 1])) continue;
    const sourceIndex = index;
    const payload = [];
    let reachedLegend = false;
    index += 2;
    while (index < lines.length) {
      const text = String(lines[index] || "").trim();
      if (FRAGMENTED_LAB_CELL.test(lines[index]) && FRAGMENTED_LAB_RULE.test(lines[index + 1] || "")) {
        index -= 1;
        break;
      }
      if (vitalTableHeaders(lines[index]).length) {
        index -= 1;
        break;
      }
      if (/^\*{0,2}\((?:LL|HH|H|L)\)\*{0,2}\s*:|^\(P\)\s*:|^Rpt\s*:/i.test(text)) {
        reachedLegend = true;
        break;
      }
      if (text) payload.push(text);
      index += 1;
    }
    cells.push({ text: cleanFragmentedLabCell(payload.join(" ")), sourceIndex });
    if (reachedLegend) break;
  }
  return cells;
}

function fragmentedLabDescriptor(value) {
  const text = cleanFragmentedLabCell(value);
  const number = "(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
  const interval = new RegExp(`^(.+?)((?:[<>]=?\\s*)?-?${number}\\s*(?:-|–|—|to)\\s*(?:[<>]=?\\s*)?-?${number})\\s+(.+)$`, "i");
  const threshold = new RegExp(`^(.+?)([<>]=?\\s*-?${number})\\s+(.+)$`, "i");
  const match = text.match(interval) || text.match(threshold);
  return match
    ? { name: compactLine(match[1]), referenceRange: compactLine(match[2]), unit: compactLine(match[3]) }
    : { name: text, referenceRange: "", unit: "" };
}

function fragmentedLabValue(value) {
  const text = cleanFragmentedLabCell(value).replace(/\\\s*$/g, "").trim();
  const flagged = text.match(/^(.*?)\s+\((LL|HH|H|L|P)\)$/i);
  return {
    value: compactLine(flagged ? flagged[1] : text),
    flag: compactLine(flagged?.[2] || "").toUpperCase()
  };
}

function normalizedLabName(value) {
  return compactLine(value).toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function laboratoryPanelFamily(name) {
  const normalized = normalizedLabName(name);
  if (/^(?:wbc|white blood cell count|hemoglobin|hgb|hematocrit|hct|platelets?|platelet count|rbc|red blood cell count|mcv|mch|mchc|rdw|mpv|nucleated rbc|nrbc)(?:\b|%)/.test(normalized)) return "cbc";
  if (/^(?:neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?|immature granulocytes?|absolute neutrophil count|anc)(?:\b|%)/.test(normalized)) return "cbc_differential";
  if (/^(?:sodium|potassium|chloride|co2 total|carbon dioxide|bicarbonate|anion gap|bun|blood urea nitrogen|creatinine|egfr|glucose(?: bld)?|calcium)$/.test(normalized)) return "metabolic";
  if (/^(?:albumin|total protein|protein total|ast|aspartate aminotransferase|alt|alanine aminotransferase|alkaline phosphatase|alk phos|bilirubin(?: total| direct| indirect)?|ggt)$/.test(normalized)) return "hepatic";
  if (/^(?:pt|prothrombin time|inr|ptt|aptt|partial thromboplastin time|fibrinogen|d dimer)$/.test(normalized)) return "coagulation";
  if (/^(?:ph|pco2|po2|hco3|base excess|lactate|oxygen saturation|o2 saturation)(?:\b|$)/.test(normalized)) return "blood_gas";
  if (/^(?:crossmatch|transfuse|type and screen|abo|rh|antibody screen)/.test(normalized)) return "blood_bank";
  if (/^osmolality(?:\b|$)/.test(normalized)) return "osmolality";
  return "other";
}

function splitLaboratoryRowsByPanel(rows = []) {
  const families = rows.map((row) => laboratoryPanelFamily(row.name));
  const hasMetabolic = families.includes("metabolic");
  const hasHepatic = families.includes("hepatic");
  const hasDifferential = families.includes("cbc_differential");
  const buckets = new Map();
  rows.forEach((row, index) => {
    let key = families[index];
    if ((key === "metabolic" || key === "hepatic") && hasMetabolic && hasHepatic) key = "comprehensive_metabolic";
    if (key === "cbc_differential") key = "cbc";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  const labels = {
    cbc: hasDifferential ? "CBC with differential" : "CBC",
    metabolic: "Basic metabolic panel",
    comprehensive_metabolic: "Comprehensive metabolic panel",
    hepatic: "Hepatic function panel",
    coagulation: "Coagulation panel",
    blood_gas: "Blood gas",
    blood_bank: "Blood bank",
    osmolality: "Osmolality",
    other: "Other laboratory results"
  };
  const order = ["cbc", "metabolic", "comprehensive_metabolic", "hepatic", "coagulation", "blood_gas", "blood_bank", "osmolality", "other"];
  return order.filter((key) => buckets.has(key)).map((key) => ({ key, label: labels[key], rows: buckets.get(key) }));
}

function laboratoryPanelSections(model, { sourceSystem, formatId } = {}) {
  return model.groups.map((group, index) => {
    const formatLabel = `${group.label} · ${group.timestamp}`;
    const sectionModel = clinicalDataModel({ kind: "laboratory_results", sourceSystem, formatId, formatLabel, groups: [group] });
    return {
      id: `laboratory_panel_${index + 1}`,
      sourceKind: "laboratory_results",
      panelLabel: group.label,
      ...withClinicalRepresentations({
        recognized: true,
        formatId,
        formatLabel,
        suggestedSourceKind: "laboratory_results",
        itemCount: group.rows.length,
        summary: `${group.rows.length} result${group.rows.length === 1 ? "" : "s"} in ${group.label} collected ${group.timestamp}.`,
        preservedUnparsedText: false
      }, sectionModel)
    };
  });
}

function renderFragmentedEpicLabTable(lines = []) {
  const cells = fragmentedLabCells(lines);
  const headingIndex = cells.findIndex((cell) => /^Latest Reference Range & Units$/i.test(cell.text));
  if (headingIndex < 0) return null;
  const timestamps = [];
  let rowStart = headingIndex + 1;
  while (rowStart < cells.length && FRAGMENTED_LAB_TIMESTAMP.test(cells[rowStart].text)) {
    timestamps.push(cells[rowStart].text);
    rowStart += 1;
  }
  if (!timestamps.length) return null;

  const width = timestamps.length + 1;
  const parsedRows = [];
  for (let index = rowStart; index < cells.length; index += width) {
    const descriptorCell = cells[index];
    if (!descriptorCell?.text) continue;
    const descriptor = fragmentedLabDescriptor(descriptorCell.text);
    const results = timestamps.map((timestamp, timestampIndex) => ({
      timestamp,
      sourceIndex: cells[index + timestampIndex + 1]?.sourceIndex ?? descriptorCell.sourceIndex,
      ...fragmentedLabValue(cells[index + timestampIndex + 1]?.text || "")
    }));
    if (results.some((result) => result.value)) parsedRows.push({ ...descriptor, sourceIndex: descriptorCell.sourceIndex, results });
  }
  const resultCount = parsedRows.reduce((total, row) => total + row.results.filter((result) => result.value).length, 0);
  if (!parsedRows.length || !resultCount) return null;

  const formatId = "epic_fragmented_labs";
  const formatLabel = "Epic Results Review laboratory table";
  const model = clinicalDataModel({
    kind: "laboratory_results",
    sourceSystem: "Epic",
    formatId,
    formatLabel,
    groups: timestamps.flatMap((timestamp, timestampIndex) => {
      const rows = parsedRows.flatMap((row, rowIndex) => {
        const result = row.results[timestampIndex];
        if (!result?.value) return [];
        return [{
          id: `result_${timestampIndex + 1}_${rowIndex + 1}`,
          name: row.name,
          value: result.value,
          unit: row.unit,
          referenceRange: row.referenceRange,
          flag: result.flag,
          abnormality: laboratoryAbnormality({ value: result.value, flag: result.flag, referenceRange: row.referenceRange }),
          sourceIndex: result.sourceIndex
        }];
      });
      return splitLaboratoryRowsByPanel(rows).map((panel, panelIndex) => ({
        id: `collection_${timestampIndex + 1}_${panelIndex + 1}`,
        label: panel.label,
        timestamp,
        rows: panel.rows
      }));
    })
  });
  const sections = laboratoryPanelSections(model, { sourceSystem: "Epic", formatId });
  return {
    ...withClinicalRepresentations({
    recognized: true,
    formatId,
    formatLabel,
    suggestedSourceKind: "laboratory_results",
    itemCount: resultCount,
    summary: `${resultCount} laboratory results across ${timestamps.length} collection times; empty copied cells removed.`,
    preservedUnparsedText: false
    }, model),
    sections,
    displayModels: sections.map((section) => section.displayModel)
  };
}

function renderFragmentedLabsWithWideVitals(lines = []) {
  const vitalIndex = lines.findIndex((line) => vitalTableHeaders(line).length);
  if (vitalIndex <= 0) return null;
  const labs = renderFragmentedEpicLabTable(lines.slice(0, vitalIndex));
  const vitals = renderWideVitalTable(lines.slice(vitalIndex));
  if (!labs || !vitals) return null;
  const sections = [
    ...(labs.sections || [{ id: "epic_fragmented_labs_1", sourceKind: "laboratory_results", ...labs }]),
    { id: "epic_wide_vitals_1", sourceKind: "vital_signs", ...vitals }
  ];
  return {
    recognized: true,
    formatId: "epic_mixed_fragmented_labs_vitals",
    formatLabel: "Epic laboratory results and vital signs",
    suggestedSourceKind: "",
    sections,
    displayModels: sections.map((section) => section.displayModel),
    promptText: sections.map((section) => section.promptText).join("\n\n"),
    outputText: sections.map((section) => section.outputText).join("\n\n"),
    itemCount: sections.reduce((total, section) => total + section.itemCount, 0),
    summary: `${sections.length} source sections detected: ${labs.summary} ${vitals.summary}`,
    preservedUnparsedText: false
  };
}

function renderDelimitedClipboardTable(lines = []) {
  const headerIndex = lines.findIndex((line, index) => index < 12 && delimitedCells(line).length >= 2);
  if (headerIndex < 0) return null;
  const headers = delimitedCells(lines[headerIndex]);
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const labTable =
    normalizedHeaders.some((header) => /^(?:component|test|test name|analyte)$/.test(header)) &&
    normalizedHeaders.some((header) => /^(?:result|value)$/.test(header));
  const medicationTable =
    normalizedHeaders.some((header) => /^(?:medication|drug|medication name)$/.test(header)) &&
    normalizedHeaders.some((header) => /(?:action|administration|status|given)/.test(header));
  if (!labTable && !medicationTable) return null;

  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (!String(lines[index] || "").trim()) continue;
    const cells = delimitedCells(lines[index]);
    if (cells.length < 2) continue;
    const values = Object.fromEntries(normalizedHeaders.map((header, cellIndex) => [header, cells[cellIndex] || ""]));
    if (Object.values(values).filter(Boolean).length >= 2) rows.push({ values, sourceIndex: index });
  }
  if (!rows.length) return null;
  const noun = medicationTable ? "medication activity" : "laboratory results";
  const valueFor = (row, patterns) => Object.entries(row.values).find(([header]) => patterns.some((pattern) => pattern.test(header)))?.[1] || "";
  const formatId = medicationTable ? "delimited_medication_table" : "delimited_lab_table";
  const formatLabel = medicationTable ? "Medication clipboard table" : "Laboratory clipboard table";
  const kind = medicationTable ? "medication_activity" : "laboratory_results";
  const groups = medicationTable
    ? [{
        id: "medications_1",
        label: "Medication activity",
        timestamp: "",
        rows: rows.map((row, index) => ({
          id: `medication_${index + 1}`,
          name: valueFor(row, [/^(?:medication|drug|medication name)$/]),
          dose: valueFor(row, [/dose/]),
          frequency: valueFor(row, [/(?:frequency|freq)/]),
          route: valueFor(row, [/route/]),
          timing: valueFor(row, [/(?:time|date|start|end)/]),
          status: [valueFor(row, [/(?:action|administration|status|given)/])].filter(Boolean),
          administrations: [],
          instructions: valueFor(row, [/(?:instruction|comment|note)/]),
          sourceIndex: row.sourceIndex
        }))
      }]
    : [...new Set(rows.map((row) => valueFor(row, [/^(?:collected|collection|date\/time|date|time)$/])))].map((timestamp, groupIndex) => ({
        id: `labs_${groupIndex + 1}`,
        label: "Laboratory results",
        timestamp,
        rows: rows.filter((row) => valueFor(row, [/^(?:collected|collection|date\/time|date|time)$/]) === timestamp).map((row, rowIndex) => {
          const value = valueFor(row, [/^(?:result|value)$/]);
          const flag = valueFor(row, [/^(?:flag|abnormal|status)$/]);
          const referenceRange = valueFor(row, [/(?:reference range|ref range|range)/]);
          return {
            id: `lab_${groupIndex + 1}_${rowIndex + 1}`,
            name: valueFor(row, [/^(?:component|test|test name|analyte)$/]),
            value,
            unit: valueFor(row, [/^(?:unit|units)$/]),
            referenceRange,
            flag,
            abnormality: laboratoryAbnormality({ value, flag, referenceRange }),
            sourceIndex: row.sourceIndex
          };
        })
      }));
  const model = clinicalDataModel({ kind, sourceSystem: "Clipboard table", formatId, formatLabel, groups });
  return withClinicalRepresentations({
    recognized: true,
    formatId,
    formatLabel,
    suggestedSourceKind: kind,
    itemCount: rows.length,
    summary: `${rows.length} ${noun} ${rows.length === 1 ? "row" : "rows"}; empty clipboard columns removed.`,
    preservedUnparsedText: false
  }, model);
}

function plainTextResult(rawText) {
  return {
    recognized: false,
    formatId: "plain_text",
    formatLabel: "Text kept as pasted",
    suggestedSourceKind: "",
    outputText: rawText,
    itemCount: 0,
    summary: rawText
      ? "No supported Epic, CPRS, or clipboard-table format was recognized. Narrative text is intentionally not reorganized."
      : "Paste a chart source to check for a supported table format.",
    preservedUnparsedText: Boolean(rawText)
  };
}

function nonExpandingResult(result, rawText) {
  if (String(result?.outputText || "").length <= rawText.length) return result;
  return {
    ...result,
    canonicalPromptText: result.promptText || result.outputText,
    promptText: rawText,
    outputText: rawText,
    usedSourceTextForCompactness: true
  };
}

export function parseClinicalExport(value, { sourceKind = "" } = {}) {
  const rawText = normalizeNewlines(value).trim();
  if (!rawText) return plainTextResult("");
  if (NARRATIVE_SOURCE_KINDS.has(sourceKind)) {
    return {
      ...plainTextResult(rawText),
      summary: "This source type is narrative and is intentionally kept exactly as pasted.",
      intentionallySkipped: true,
      rawCharacterCount: rawText.length,
      parsedCharacterCount: rawText.length
    };
  }
  const lines = decodeClinicalClipboardText(value).split("\n");
  const fragmentedMixedResult = renderFragmentedLabsWithWideVitals(lines);
  if (fragmentedMixedResult) {
    const compactResult = nonExpandingResult(fragmentedMixedResult, rawText);
    return { ...compactResult, rawCharacterCount: rawText.length, parsedCharacterCount: compactResult.outputText.length };
  }
  const epicResult = parseEpicClinicalExport(value);
  if (epicResult) {
    const compactResult = nonExpandingResult(epicResult, rawText);
    return {
      ...compactResult,
      rawCharacterCount: rawText.length,
      parsedCharacterCount: compactResult.outputText.length
    };
  }
  const parsers = [renderMedicationReport, renderFragmentedEpicLabTable, renderWideVitalTable, renderDelimitedClipboardTable, renderCprsStructuredTables];
  for (const parser of parsers) {
    const result = parser(lines);
    if (result) {
      const compactResult = nonExpandingResult(result, rawText);
      return {
        ...compactResult,
        rawCharacterCount: rawText.length,
        parsedCharacterCount: compactResult.outputText.length
      };
    }
  }
  return {
    ...plainTextResult(rawText),
    rawCharacterCount: rawText.length,
    parsedCharacterCount: rawText.length
  };
}

export function prepareClinicalExportForSave(value, priorResult = null, { sourceKind = "" } = {}) {
  const rawText = normalizeNewlines(value).trim();
  const parseResult = priorResult?.recognized && priorResult.edited && !NARRATIVE_SOURCE_KINDS.has(sourceKind)
    ? priorResult
    : parseClinicalExport(value, { sourceKind });
  return {
    rawText,
    parseResult,
    sourceText: parseResult.recognized
      ? String(parseResult.edited ? parseResult.outputText : parseResult.canonicalPromptText || parseResult.outputText || "").trim()
      : rawText
  };
}
