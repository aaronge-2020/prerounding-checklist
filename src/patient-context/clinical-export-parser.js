import { decodeClinicalClipboardText, parseEpicClinicalExport } from "./epic-clinical-export-parser.js?v=20260908-epic-parser-submit";

const REPORT_SEPARATOR = /^\s*[-=]{20,}\s*$/;
const MEDICATION_STATUS = /\b(?:ADMINISTERED|CANCELLED|CANCELED|DISCONTINUED|GIVEN|HELD|MISSED|NOT GIVEN|REFUSED|STOPPED|BCMA EXPIRED)\b/i;

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

  const entries = medications.map((medication, index) => {
    const fields = [`Medication ${index + 1}. ${medication.orderText}`];
    if (medication.timing.length) fields.push(`Order timing. ${medication.timing.join("; ")}`);
    if (medication.status.length) fields.push(`Administration or order status. ${medication.status.join("; ")}`);
    if (medication.instructions.length) fields.push(`Special instructions. ${medication.instructions.join(" ")}`);
    return fields.join("\n");
  });

  return {
    recognized: true,
    formatId: administrationHeader ? "cprs_mar" : "cprs_inpatient_orders",
    formatLabel: administrationHeader ? "CPRS medication administration report" : "CPRS inpatient-order table",
    suggestedSourceKind: "medication_activity",
    outputText: `Medication activity parsed from CPRS report.\n\n${entries.join("\n\n")}`,
    itemCount: medications.length,
    summary: `${medications.length} medication ${medications.length === 1 ? "entry" : "entries"}; report columns, separators, and pharmacy routing rows removed.`,
    preservedUnparsedText: false
  };
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
  const renderedRows = rows.map((row) => {
    const match = row.match(/^(.*?)\s+@\s*(\d{1,4})\s+(.+)$/);
    if (!match) return `Vital-sign row. ${row}`;
    const values = match[3].split(/\s+/).filter(Boolean);
    if (values.length < 5) return `Vital-sign row. ${row}`;
    const labels = ["Temperature", "Pulse", "Respiratory rate", "Blood pressure", "Pain", "Weight"];
    const measurements = values.slice(0, labels.length).map((value, index) => `${labels[index]}. ${value}`);
    return `Recorded ${match[1]} at ${match[2]}. ${measurements.join("; ")}.`;
  });
  return { rows: renderedRows, range: [headerIndex, endIndex - 1] };
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

  const parts = [];
  const ranges = [];
  if (vitals) {
    parts.push(`Vital signs parsed from CPRS table.\n${vitals.rows.join("\n")}`);
    ranges.push(vitals.range);
  }
  if (labs.length) {
    const renderedPanels = labs.map((panel) => `Panel. ${panel.title}\nCollected. ${panel.timeline}\n${panel.rows.join("\n")}`);
    parts.push(`Laboratory results parsed from CPRS tables.\n\n${renderedPanels.join("\n\n")}`);
    ranges.push(...labs.map((panel) => panel.range));
  }

  const removed = rangeIndexes(ranges);
  const remainderLines = collapseBlankLines(lines.filter((_, index) => !removed.has(index)));
  const remainder = remainderLines.join("\n").trim();
  if (remainder) parts.push(`Unparsed source text preserved as pasted.\n${remainder}`);
  const counts = [];
  if (vitals) counts.push(`${vitals.rows.length} vital-sign ${vitals.rows.length === 1 ? "row" : "rows"}`);
  if (labs.length) counts.push(`${labs.reduce((total, panel) => total + panel.rows.length, 0)} laboratory results`);
  if (remainder) counts.push("non-table text preserved unchanged");

  return {
    recognized: true,
    formatId: remainder ? "cprs_mixed_tables" : vitals && labs.length ? "cprs_vitals_labs" : vitals ? "cprs_vitals" : "cprs_labs",
    formatLabel: remainder
      ? "Mixed CPRS text with structured tables"
      : vitals && labs.length
        ? "CPRS vital-sign and laboratory tables"
        : vitals
          ? "CPRS vital-sign table"
          : "CPRS laboratory tables",
    suggestedSourceKind: remainder ? "" : "results",
    outputText: parts.join("\n\n"),
    itemCount: (vitals?.rows.length || 0) + labs.reduce((total, panel) => total + panel.rows.length, 0),
    summary: `${counts.join("; ")}.`,
    preservedUnparsedText: Boolean(remainder)
  };
}

function delimitedCells(line) {
  if (line.includes("\t")) return line.split(/\t+/).map(compactLine);
  if (/\s+\|\s+/.test(line)) return line.split(/\s+\|\s+/).map(compactLine);
  return [];
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
    const fields = headers.map((header, cellIndex) => (cells[cellIndex] ? `${header}. ${cells[cellIndex]}` : "")).filter(Boolean);
    if (fields.length >= 2) rows.push(fields.join("; "));
  }
  if (!rows.length) return null;
  const noun = medicationTable ? "medication activity" : "laboratory results";
  return {
    recognized: true,
    formatId: medicationTable ? "delimited_medication_table" : "delimited_lab_table",
    formatLabel: medicationTable ? "Medication clipboard table" : "Laboratory clipboard table",
    suggestedSourceKind: medicationTable ? "medication_activity" : "results",
    outputText: `${medicationTable ? "Medication activity" : "Laboratory results"} parsed from clipboard table.\n${rows.map((row, index) => `${medicationTable ? `Medication ${index + 1}` : "Result"}. ${row}`).join("\n")}`,
    itemCount: rows.length,
    summary: `${rows.length} ${noun} ${rows.length === 1 ? "row" : "rows"}; empty clipboard columns removed.`,
    preservedUnparsedText: false
  };
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

export function parseClinicalExport(value) {
  const rawText = normalizeNewlines(value).trim();
  if (!rawText) return plainTextResult("");
  const epicResult = parseEpicClinicalExport(value);
  if (epicResult) {
    return {
      ...epicResult,
      rawCharacterCount: rawText.length,
      parsedCharacterCount: epicResult.outputText.length
    };
  }
  const lines = decodeClinicalClipboardText(value).split("\n");
  const parsers = [renderMedicationReport, renderDelimitedClipboardTable, renderCprsStructuredTables];
  for (const parser of parsers) {
    const result = parser(lines);
    if (result) {
      return {
        ...result,
        rawCharacterCount: rawText.length,
        parsedCharacterCount: result.outputText.length
      };
    }
  }
  return {
    ...plainTextResult(rawText),
    rawCharacterCount: rawText.length,
    parsedCharacterCount: rawText.length
  };
}

export function prepareClinicalExportForSave(value, priorResult = null) {
  const rawText = normalizeNewlines(value).trim();
  const parseResult = priorResult?.recognized && priorResult.edited ? priorResult : parseClinicalExport(value);
  return {
    rawText,
    parseResult,
    sourceText: parseResult.recognized ? String(parseResult.outputText || "").trim() : rawText
  };
}
