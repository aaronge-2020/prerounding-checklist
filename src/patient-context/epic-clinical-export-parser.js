const EPIC_RESULT_TIMESTAMP = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:[ T,]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?|\d{4}))?$/i;
const RESULT_VALUE = /^(?:[-+]?\d|[<>]=?\s*[-+]?\d|positive\b|negative\b|detected\b|not detected\b|reactive\b|nonreactive\b|pending\b|present\b|absent\b|rpt\b)/i;
const RESULT_LEGEND = /^\(([A-Z]{1,4})\)\s*:\s*(.+)$/i;
const REPORT_LEGEND = /^(Rpt)\s*:\s*(View report\b.*)$/i;
const MAR_FIELD = /\b(Dose|Freq(?:uency)?|Route|Start|End)\s*:\s*/gi;
const MAR_FIELD_START = /^(?:Dose|Freq(?:uency)?|Route|Start|End)\s*:/i;
const MAR_INSTRUCTIONS = /^Admin(?:istration)? Instructions?\s*:\s*(.*)$/i;
const MAR_EVENT = /(?:^|\s)(\d{1,2}:\d{2}(?:\s*[AP]M)?|\d{3,4})(?:\s*\(\s*([^)]*?)\s*\))?(?:\s*(\[[A-Z]+\]))?(?=\s|$)/gi;

const VITAL_FIELDS = [
  { label: "Blood Pressure (cuff)", aliases: ["blood pressure (cuff)", "blood pressure", "bp (cuff)", "bp"] },
  { label: "Temperature", aliases: ["temperature", "temp"] },
  { label: "Respirations", aliases: ["respirations", "respiratory rate", "resp"] },
  { label: "Weight (kg)", aliases: ["weight (kg)", "weight"] },
  { label: "SpO2 (%)", aliases: ["spo2 (%)", "spo2", "oxygen saturation"] },
  { label: "O2 Device", aliases: ["o2 device", "oxygen device"] },
  { label: "MAP (cuff)", aliases: ["map (cuff)", "map"] },
  { label: "RASS Score", aliases: ["rass score", "rass"] },
  { label: "Braden Scale", aliases: ["braden scale", "braden"] },
  { label: "Source", aliases: ["source"] },
  { label: "Pulse", aliases: ["pulse", "heart rate"] }
];

function decodeEntity(match, hex, decimal) {
  const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return match;
  }
}

export function decodeClinicalClipboardText(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, decodeEntity)
    .replace(/&(?:tab);/gi, "\t")
    .replace(/&(?:nbsp);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n?/g, "\n");
}

function compact(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function nonemptyLines(value) {
  return decodeClinicalClipboardText(value)
    .split("\n")
    .map((raw, index) => ({ index, raw: raw.replace(/[ \t]+$/g, ""), text: compact(raw) }))
    .filter((line) => line.text);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function unconsumedText(lines, consumed) {
  return lines
    .filter((line) => !consumed.has(line.index))
    .map((line) => line.text)
    .join("\n")
    .trim();
}

function addUnparsedSection(parts, label, remainder) {
  if (remainder) parts.push(`${label}\n${remainder}`);
}

function isEpicHeading(text, pattern) {
  return pattern.test(text.replace(/\s*:\s*$/, ""));
}

function parseResultPair(text) {
  if (!text.includes(":") || text.includes("|")) return null;
  const separator = text.lastIndexOf(":");
  const label = compact(text.slice(0, separator));
  const value = compact(text.slice(separator + 1));
  if (!label || !value || label.length > 140 || value.length > 240) return null;
  if (/^(?:legend|dose|freq(?:uency)?|route|start|end|admin(?:istration)? instructions?|rph|rn)(?:\b|$)/i.test(label)) return null;
  if (/^\([A-Z]{1,4}\)$/i.test(label)) return null;
  return { label, value };
}

function renderEpicResults(value) {
  const lines = nonemptyLines(value);
  if (!lines.length) return null;
  const consumed = new Set();
  const groups = [];
  const legends = [];
  let currentGroup = null;
  let hasResultsHeading = false;

  for (const line of lines) {
    if (isEpicHeading(line.text, /^(?:results?(?: from epic)?|laboratory results?|lab results?)$/i)) {
      hasResultsHeading = true;
      consumed.add(line.index);
      continue;
    }
    const timestamp = line.text.match(EPIC_RESULT_TIMESTAMP);
    if (timestamp) {
      currentGroup = { collected: line.text, results: [], timestampIndex: line.index };
      groups.push(currentGroup);
      continue;
    }
    const legend = line.text.match(RESULT_LEGEND) || line.text.match(REPORT_LEGEND);
    if (legend) {
      const code = /^rpt$/i.test(legend[1]) ? "Rpt" : legend[1].toUpperCase();
      legends.push({ code, meaning: compact(legend[2]), index: line.index });
      continue;
    }
    const pair = /\t|\|/.test(line.raw) ? null : parseResultPair(line.text);
    if (!pair) continue;
    if (!currentGroup) {
      currentGroup = { collected: "", results: [], timestampIndex: null };
      groups.push(currentGroup);
    }
    currentGroup.results.push({ ...pair, index: line.index });
  }

  const results = groups.flatMap((group) => group.results);
  const resultishCount = results.filter((result) => RESULT_VALUE.test(result.value)).length;
  const timestampedResultCount = groups.filter((group) => group.collected && group.results.length).length;
  const recognized =
    results.length >= 2 && (hasResultsHeading || resultishCount >= 1 || timestampedResultCount >= 1) ||
    results.length === 1 && (hasResultsHeading || (timestampedResultCount === 1 && resultishCount === 1));
  if (!recognized) return null;

  for (const group of groups) {
    if (!group.results.length) continue;
    if (group.timestampIndex !== null) consumed.add(group.timestampIndex);
    group.results.forEach((result) => consumed.add(result.index));
  }
  legends.forEach((legend) => consumed.add(legend.index));

  const renderedGroups = groups
    .filter((group) => group.results.length)
    .map((group) => {
      const rows = group.results.map((result) => `Result. ${result.label}: ${result.value}`);
      return [`Collected. ${group.collected || "Not included in pasted source."}`, ...rows].join("\n");
    });
  const parts = [`Laboratory and diagnostic results parsed from Epic export.\n\n${renderedGroups.join("\n\n")}`];
  if (legends.length) parts.push(`Reported flag definitions.\n${legends.map((legend) => `${legend.code}: ${legend.meaning}`).join("\n")}`);
  const remainder = unconsumedText(lines, consumed);
  addUnparsedSection(parts, "Unparsed Epic result text preserved as pasted.", remainder);

  return {
    recognized: true,
    formatId: remainder ? "epic_results_with_remainder" : "epic_results",
    formatLabel: remainder ? "Epic results with unparsed text" : "Epic results",
    suggestedSourceKind: remainder ? "" : "results",
    outputText: parts.join("\n\n"),
    itemCount: results.length,
    summary: `${plural(results.length, "result")} across ${plural(renderedGroups.length, "collection group")}${legends.length ? `; ${plural(legends.length, "flag definition")}` : ""}${remainder ? "; unrecognized text preserved" : ""}.`,
    preservedUnparsedText: Boolean(remainder)
  };
}

function marSection(text) {
  const normalized = text.replace(/\s*:\s*$/, "");
  if (/^Medications$/i.test(normalized)) return "Medications";
  if (/^Completed Medications$/i.test(normalized)) return "Completed Medications";
  if (/^Other Encounter(?: Medications)?$/i.test(normalized)) return "Other Encounter";
  if (/^(?:Scheduled|PRN|Continuous|Discontinued|Held|Active) Medications$/i.test(normalized)) return normalized;
  return "";
}

function marChrome(text) {
  return (
    /^(?:1 Day|3 Days|7 Days|10 Days)(?:\s|$)/i.test(text) ||
    /^(?:<\s*)?Today(?:\s*>|$)/i.test(text) ||
    /^Legend\s*:?$/i.test(text) ||
    /^(?:Medications\s+)?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4})+$/i.test(text)
  );
}

function isMarHeading(text) {
  return /^(?:(?:this is|copied)\s+(?:the\s+)?)?MAR$/i.test(text.replace(/\s*:\s*$/, ""));
}

function extractMarFields(text) {
  const matches = [...text.matchAll(MAR_FIELD)];
  if (!matches.length) return [];
  return matches.map((match, index) => ({
    key: match[1].toLowerCase().startsWith("freq") ? "Frequency" : match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
    value: compact(text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length))
  })).filter((field) => field.value);
}

function extractMarEvents(text) {
  const events = [];
  for (const match of text.matchAll(MAR_EVENT)) {
    const dose = compact(match[2]);
    events.push(`${match[1]}${dose ? ` (${dose})` : ""}${match[3] ? ` ${match[3]}` : ""}`);
  }
  return events;
}

function isMarEventLine(text) {
  MAR_EVENT.lastIndex = 0;
  const events = extractMarEvents(text);
  MAR_EVENT.lastIndex = 0;
  if (!events.length) return false;
  const residue = compact(text.replace(MAR_EVENT, ""));
  MAR_EVENT.lastIndex = 0;
  return !residue || /^[-–—,;]+$/.test(residue);
}

function isMedicationCandidate(lines, position) {
  const text = lines[position]?.text || "";
  if (!text || marChrome(text) || marSection(text) || MAR_FIELD_START.test(text) || MAR_INSTRUCTIONS.test(text) || isMarEventLine(text)) return false;
  if (EPIC_RESULT_TIMESTAMP.test(text) || RESULT_LEGEND.test(text)) return false;
  for (let offset = 1; offset <= 4 && position + offset < lines.length; offset += 1) {
    const next = lines[position + offset].text;
    if (marSection(next)) return false;
    if (MAR_FIELD_START.test(next) || MAR_INSTRUCTIONS.test(next) || isMarEventLine(next)) return true;
    if (!marChrome(next)) return false;
  }
  return false;
}

function hasMarMetadataAhead(lines, position) {
  for (let offset = 1; offset <= 4 && position + offset < lines.length; offset += 1) {
    const next = lines[position + offset].text;
    if (MAR_FIELD_START.test(next) || MAR_INSTRUCTIONS.test(next)) return true;
    if (!marChrome(next)) return false;
  }
  return false;
}

function renderEpicMar(value) {
  const lines = nonemptyLines(value);
  if (!lines.length) return null;
  const hasMarHeader = lines.some(
    (line) => isMarHeading(line.text) || marSection(line.text) || /^Medications\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.test(line.text)
  );
  const fieldLineCount = lines.filter((line) => MAR_FIELD_START.test(line.text)).length;
  if (!hasMarHeader && fieldLineCount < 2) return null;

  const consumed = new Set();
  const medications = [];
  let section = "Medications";
  let current = null;
  let inInstructions = false;

  const finishCurrent = () => {
    if (!current) return;
    current.instructions = compact(current.instructions.join(" "));
    medications.push(current);
    current = null;
    inInstructions = false;
  };

  for (let position = 0; position < lines.length; position += 1) {
    const line = lines[position];
    const heading = marSection(line.text);
    if (heading) {
      finishCurrent();
      section = heading;
      consumed.add(line.index);
      continue;
    }
    if (isMarHeading(line.text) || marChrome(line.text)) {
      consumed.add(line.index);
      continue;
    }
    const medicationCandidate = isMedicationCandidate(lines, position);
    if (medicationCandidate && (!inInstructions || hasMarMetadataAhead(lines, position))) {
      finishCurrent();
      current = { name: line.text, section, fields: [], administrations: [], instructions: [], indexes: [line.index] };
      consumed.add(line.index);
      continue;
    }
    if (!current) continue;

    const instructions = line.text.match(MAR_INSTRUCTIONS);
    if (instructions) {
      inInstructions = true;
      current.indexes.push(line.index);
      consumed.add(line.index);
      if (instructions[1]) current.instructions.push(instructions[1]);
      continue;
    }
    const fields = extractMarFields(line.text);
    if (fields.length) {
      inInstructions = false;
      current.fields.push(...fields);
      current.indexes.push(line.index);
      consumed.add(line.index);
      continue;
    }
    if (isMarEventLine(line.text)) {
      inInstructions = false;
      current.administrations.push(...extractMarEvents(line.text));
      current.indexes.push(line.index);
      consumed.add(line.index);
      continue;
    }
    if (inInstructions) {
      current.instructions.push(line.text);
      current.indexes.push(line.index);
      consumed.add(line.index);
    }
  }
  finishCurrent();

  if (!medications.length) return null;
  const evidenceCount = medications.filter((medication) => medication.fields.length || medication.administrations.length).length;
  if (!hasMarHeader && evidenceCount < 1) return null;

  const rendered = medications.map((medication, index) => {
    const details = [`MAR section. ${medication.section}`, `Medication ${index + 1}. ${medication.name}`];
    for (const field of medication.fields) details.push(`${field.key}. ${field.value}`);
    for (const administration of medication.administrations) details.push(`Administration. ${administration}`);
    if (medication.instructions) details.push(`Admin instructions. ${medication.instructions}`);
    return details.join("\n");
  });
  const parts = [`Medication activity parsed from Epic MAR.\n\n${rendered.join("\n\n")}`];
  const remainder = unconsumedText(lines, consumed);
  addUnparsedSection(parts, "Unparsed Epic MAR text preserved as pasted.", remainder);
  const administrationCount = medications.reduce((total, medication) => total + medication.administrations.length, 0);

  return {
    recognized: true,
    formatId: remainder ? "epic_mar_with_remainder" : "epic_mar",
    formatLabel: remainder ? "Epic MAR with unparsed text" : "Epic MAR",
    suggestedSourceKind: remainder ? "" : "medication_activity",
    outputText: parts.join("\n\n"),
    itemCount: medications.length,
    summary: `${plural(medications.length, "medication entry", "medication entries")}; ${plural(administrationCount, "administration")}${remainder ? "; unrecognized text preserved" : ""}.`,
    preservedUnparsedText: Boolean(remainder)
  };
}

function vitalFieldFor(text) {
  const lower = compact(text).toLowerCase();
  return VITAL_FIELDS.find((field) => field.aliases.some((alias) => lower === alias || lower.startsWith(`${alias} `)));
}

function removeVitalLabel(text, aliases, fromEnd = false) {
  const sorted = [...aliases].sort((left, right) => right.length - left.length);
  for (const alias of sorted) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(fromEnd ? `\\s*${escaped}\\s*$` : `^\\s*${escaped}\\s*`, "i");
    if (pattern.test(text)) return text.replace(pattern, "");
  }
  return text;
}

function parseVitalLine(line) {
  const field = vitalFieldFor(line.text);
  if (!field) return null;
  const cells = line.raw.split(/\t+/).map(compact).filter(Boolean);
  let values = [];
  if (cells.length >= 2) {
    values = cells.filter((cell) => !field.aliases.some((alias) => compact(cell).toLowerCase() === alias));
  } else {
    let remainder = removeVitalLabel(line.text, field.aliases);
    remainder = removeVitalLabel(remainder, field.aliases, true);
    if (compact(remainder)) values = [compact(remainder)];
  }
  if (!values.length) return null;
  return { label: field.label, value: values.join(" | "), truncated: values.some((entry) => /\.\.\.|…/.test(entry)) };
}

function renderEpicVitals(value) {
  const lines = nonemptyLines(value);
  if (!lines.length) return null;
  const consumed = new Set();
  let hasHeading = false;
  const vitals = [];
  for (const line of lines) {
    if (isEpicHeading(line.text, /^vital signs?$|^vitals$/i)) {
      hasHeading = true;
      consumed.add(line.index);
      continue;
    }
    const vital = parseVitalLine(line);
    if (!vital) continue;
    vitals.push(vital);
    consumed.add(line.index);
  }
  if (vitals.length < 2 && !(hasHeading && vitals.length)) return null;

  const rows = vitals.map((vital) => `${vital.label}. ${vital.value}${vital.truncated ? ". Copied value appears truncated." : ""}`);
  const parts = [`Vital signs and clinical observations parsed from Epic export.\n${rows.join("\n")}`];
  const remainder = unconsumedText(lines, consumed);
  addUnparsedSection(parts, "Unparsed Epic vital-sign text preserved as pasted.", remainder);
  const truncatedCount = vitals.filter((vital) => vital.truncated).length;
  return {
    recognized: true,
    formatId: remainder ? "epic_vitals_with_remainder" : "epic_vitals",
    formatLabel: remainder ? "Epic vitals with unparsed text" : "Epic vitals",
    suggestedSourceKind: remainder ? "" : "results",
    outputText: parts.join("\n\n"),
    itemCount: vitals.length,
    summary: `${plural(vitals.length, "vital-sign field")}${truncatedCount ? `; ${plural(truncatedCount, "truncated copied value")}` : ""}${remainder ? "; unrecognized text preserved" : ""}.`,
    preservedUnparsedText: Boolean(remainder)
  };
}

function findVitalsBoundary(lines) {
  for (let position = 0; position < lines.length; position += 1) {
    const line = lines[position];
    if (isEpicHeading(line.text, /^vital signs?$|^vitals$/i)) {
      const followingVitals = lines.slice(position + 1, position + 14).filter((candidate) => parseVitalLine(candidate)).length;
      if (followingVitals) return line.index;
    }
    if (!parseVitalLine(line)) continue;
    const nearbyVitals = lines.slice(position, position + 10).filter((candidate) => parseVitalLine(candidate)).length;
    if (nearbyVitals >= 2) return line.index;
  }
  return null;
}

function findMarBoundary(lines, vitalsBoundary) {
  const beforeVitals = lines.filter((line) => vitalsBoundary === null || line.index < vitalsBoundary);
  for (let position = 0; position < beforeVitals.length; position += 1) {
    const line = beforeVitals[position];
    if (isMarHeading(line.text)) return line.index;
    if (/^(?:1 Day|3 Days|7 Days|10 Days)(?:\s|$)/i.test(line.text)) return line.index;
    if (/^Medications\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.test(line.text)) return line.index;
    if (marSection(line.text)) {
      const nearbyMetadata = beforeVitals.slice(position + 1, position + 8).some((candidate) => MAR_FIELD_START.test(candidate.text));
      if (nearbyMetadata) return line.index;
    }
  }
  for (let position = 1; position < beforeVitals.length; position += 1) {
    if (!MAR_FIELD_START.test(beforeVitals[position].text)) continue;
    const candidate = beforeVitals[position - 1];
    if (!parseResultPair(candidate.text) && !EPIC_RESULT_TIMESTAMP.test(candidate.text)) return candidate.index;
  }
  return null;
}

function mixedSection({ kind, text, result, index }) {
  if (!result) {
    return {
      id: `unparsed_${index + 1}`,
      formatId: "unparsed_epic_section",
      formatLabel: "Unparsed source text",
      sourceKind: "other_chart_text",
      outputText: text.trim(),
      itemCount: 0,
      summary: "This part of the paste was preserved unchanged for review.",
      preservedUnparsedText: true
    };
  }
  const sourceKind = kind === "mar" ? "medication_activity" : "results";
  return {
    id: `${kind}_${index + 1}`,
    ...result,
    sourceKind
  };
}

function renderMixedEpicExport(value) {
  const decoded = decodeClinicalClipboardText(value);
  const allLines = decoded.split("\n");
  const lines = allLines
    .map((raw, index) => ({ index, raw: raw.replace(/[ \t]+$/g, ""), text: compact(raw) }))
    .filter((line) => line.text);
  if (!lines.length) return null;

  const vitalsBoundary = findVitalsBoundary(lines);
  const marBoundary = findMarBoundary(lines, vitalsBoundary);
  const boundaries = [marBoundary, vitalsBoundary].filter((boundary) => boundary !== null).sort((left, right) => left - right);
  if (!boundaries.length) return null;

  const segments = [];
  const firstBoundary = boundaries[0];
  if (firstBoundary > 0) segments.push({ kind: "results", start: 0, end: firstBoundary });
  if (marBoundary !== null) segments.push({ kind: "mar", start: marBoundary, end: vitalsBoundary !== null && vitalsBoundary > marBoundary ? vitalsBoundary : allLines.length });
  if (vitalsBoundary !== null) segments.push({ kind: "vitals", start: vitalsBoundary, end: allLines.length });
  if (segments.length < 2) return null;

  const parsers = { results: renderEpicResults, mar: renderEpicMar, vitals: renderEpicVitals };
  const sections = segments
    .map((segment, index) => {
      const text = allLines.slice(segment.start, segment.end).join("\n").trim();
      return text ? mixedSection({ kind: segment.kind, text, result: parsers[segment.kind](text), index }) : null;
    })
    .filter(Boolean);
  const recognizedSections = sections.filter((section) => section.formatId !== "unparsed_epic_section");
  if (sections.length < 2 || recognizedSections.length < 2) return null;

  const sourceLabels = sections.map((section) => section.sourceKind === "medication_activity" ? "Medication activity" : section.sourceKind === "results" ? "Results" : "Other chart text");
  const outputText = sections
    .map((section, index) => `Source ${index + 1}. ${sourceLabels[index]} — ${section.formatLabel}\n${section.outputText}`)
    .join("\n\n");
  return {
    recognized: true,
    formatId: "epic_mixed_export",
    formatLabel: "Mixed Epic export",
    suggestedSourceKind: "",
    sections,
    outputText,
    itemCount: sections.reduce((total, section) => total + section.itemCount, 0),
    summary: `${plural(sections.length, "source section")} detected: ${sections.map((section, index) => `${sourceLabels[index]} (${section.summary.replace(/\.$/, "")})`).join("; ")}.`,
    preservedUnparsedText: sections.some((section) => section.preservedUnparsedText)
  };
}

export function parseEpicClinicalExport(value) {
  const mixed = renderMixedEpicExport(value);
  if (mixed) return mixed;
  const parsers = [renderEpicMar, renderEpicVitals, renderEpicResults];
  for (const parser of parsers) {
    const result = parser(value);
    if (result) return result;
  }
  return null;
}
