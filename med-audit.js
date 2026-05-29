const medicationSectionHeading = "MEDICATION ORDERS AND ADMINISTRATION RECORD";

const routePatterns = [
  { pattern: /\b(?:po|p\.o\.|oral|by mouth)\b/i, value: "PO" },
  { pattern: /\b(?:iv|i\.v\.|intravenous)\b/i, value: "IV" },
  { pattern: /\b(?:subcutaneous|subcut|sq|sc)\b/i, value: "subcutaneous" },
  { pattern: /\b(?:im|intramuscular)\b/i, value: "IM" },
  { pattern: /\b(?:inhaled|inhalation|neb|nebulized)\b/i, value: "inhaled" },
  { pattern: /\b(?:topical|transdermal|patch)\b/i, value: "topical/transdermal" },
  { pattern: /\b(?:rectal|pr)\b/i, value: "rectal" },
  { pattern: /\b(?:ophthalmic|eye)\b/i, value: "ophthalmic" },
  { pattern: /\b(?:nasal|intranasal)\b/i, value: "nasal" }
];

const routeNormalization = new Map(routePatterns.map((item) => [item.value.toLowerCase(), item.value]));

const frequencyPatterns = [
  { pattern: /\b(?:q\s*24\s*h|q24h|every\s+24\s+hours?|1x\s+daily|once\s+daily|daily|qd)\b/i, value: "daily" },
  { pattern: /\b(?:q\s*12\s*h|q12h|every\s+12\s+hours?|2x\s+daily|twice\s+daily|bid)\b/i, value: "BID" },
  { pattern: /\b(?:q\s*8\s*h|q8h|every\s+8\s+hours?|3x\s+daily|three\s+times\s+daily|tid)\b/i, value: "TID" },
  { pattern: /\b(?:q\s*6\s*h|q6h|every\s+6\s+hours?|4x\s+daily|four\s+times\s+daily|qid)\b/i, value: "QID" },
  { pattern: /\b(?:q\s*4\s*h|q4h|every\s+4\s+hours?)\b/i, value: "q4h" },
  { pattern: /\b(?:q\s*15\s*min|q15min|every\s+15\s+min(?:ute)?s?)\b/i, value: "q15 min" },
  { pattern: /\b(?:nightly|qhs|bedtime)\b/i, value: "nightly" },
  { pattern: /\b(?:with meals and bedtime|mealtime and bedtime|achs)\b/i, value: "ACHS" }
];

const statusPatterns = [
  { pattern: /\b(?:held by provider|held|hold)\b/i, value: "held" },
  { pattern: /\b(?:patient refused|refused)\b/i, value: "refused" },
  { pattern: /\b(?:not given|missed|omitted|skipped)\b/i, value: "not given" },
  { pattern: /\b(?:given|administered|completed|scanned|infusing|started)\b/i, value: "given" },
  { pattern: /\b(?:discontinued|dc'd|d\/c|stopped|expired)\b/i, value: "discontinued" },
  { pattern: /\b(?:ordered|active order|scheduled|current inpatient|scheduled med(?:s|ication)?|order)\b/i, value: "ordered" }
];

const ambiguousMedicationPatterns = [
  /\b(?:sliding scale|correction scale|per protocol|titrate|titrated|insulin drip|infusion|variable|range dose|dose range)\b/i,
  /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?|mL|ml)\b/i
];

function cleanLine(line) {
  return String(line || "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalLine(line) {
  return cleanLine(line)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\bDay\s+[+-]?\d+(?:\s+\w+)?(?:\s+\(\d{4}\))?/gi, "")
    .replace(/\b(?:early morning|morning|afternoon|evening|overnight)\b/gi, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelySectionHeading(line) {
  const cleaned = cleanLine(line);
  if (!cleaned || cleaned.length > 80) {
    return false;
  }
  return /^[A-Z0-9 /&()_-]+:?$/.test(cleaned) && /[A-Z]{3}/.test(cleaned);
}

export function extractMedicationAdministrationText(text) {
  const source = String(text || "");
  const headingRegex = new RegExp(`${medicationSectionHeading}\\s*:?[\\t ]*\\n?`, "i");
  const match = headingRegex.exec(source);
  if (!match) {
    return "";
  }

  const after = source.slice(match.index + match[0].length);
  const nextBlock = /\n(?:SOAP NOTE|ADDITIONAL LABS AND RESULTS|HANDOFF SUMMARY AND OTHER CONTEXT|BEDSIDE QUESTION CHECKLIST|TARGETED PHYSICAL EXAM CHECKLIST|New checklist answers and exam findings|Admission intake information)\s*:/i.exec(after);
  return (nextBlock ? after.slice(0, nextBlock.index) : after).trim();
}

function detectContextMode(line, currentMode) {
  const normalized = cleanLine(line).toLowerCase();
  if (!normalized) {
    return currentMode;
  }
  if (/\b(?:mar|administration record|administered medications|given medications|medication administration)\b/.test(normalized)) {
    return "administration";
  }
  if (/\b(?:orders?|active medications?|scheduled meds?|current inpatient|medication orders|scheduled medications)\b/.test(normalized)) {
    return "order";
  }
  return currentMode;
}

function statusForLine(line, contextMode) {
  for (const item of statusPatterns) {
    if (item.pattern.test(line)) {
      return item.value;
    }
  }
  return contextMode === "administration" ? "given" : "ordered";
}

function parseDose(line) {
  const match = line.match(/\b(\d+(?:\.\d+)?)\s*(mcg|microgram(?:s)?|mg|g|unit(?:s)?|u|mL|ml|%|patch(?:es)?|tab(?:let)?s?|cap(?:sule)?s?)\b/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  const unitRaw = match[2].toLowerCase();
  let unit = unitRaw;
  let normalizedValue = value;
  let normalizedUnit = unitRaw;
  if (/^microgram|^mcg$/.test(unitRaw)) {
    unit = "mcg";
    normalizedValue = value / 1000;
    normalizedUnit = "mg";
  } else if (unitRaw === "g") {
    unit = "g";
    normalizedValue = value * 1000;
    normalizedUnit = "mg";
  } else if (unitRaw === "u" || /^unit/.test(unitRaw)) {
    unit = "units";
    normalizedUnit = "units";
  } else if (unitRaw === "ml") {
    unit = "mL";
    normalizedUnit = "mL";
  } else if (/^patch/.test(unitRaw)) {
    unit = value === 1 ? "patch" : "patches";
    normalizedUnit = "patch";
  } else if (/^tab/.test(unitRaw)) {
    unit = value === 1 ? "tablet" : "tablets";
    normalizedUnit = "tablet";
  } else if (/^cap/.test(unitRaw)) {
    unit = value === 1 ? "capsule" : "capsules";
    normalizedUnit = "capsule";
  }
  return {
    value,
    unit,
    text: `${match[1]} ${unit}`,
    normalizedValue,
    normalizedUnit,
    index: match.index
  };
}

function parseRoute(line) {
  const item = routePatterns.find((candidate) => candidate.pattern.test(line));
  return item ? item.value : "";
}

function normalizeRoute(route) {
  return routeNormalization.get(String(route || "").toLowerCase()) || route || "";
}

function parseFrequency(line) {
  const item = frequencyPatterns.find((candidate) => candidate.pattern.test(line));
  return item ? item.value : "";
}

function normalizeFrequency(frequency) {
  return String(frequency || "").toLowerCase().replace(/\s+/g, "");
}

function stripNoiseBeforeName(line) {
  return line
    .replace(/^\s*(?:ordered|active|scheduled|mar|given|administered|held|refused|not given)\s*[:;-]\s*/i, "")
    .replace(/^\s*(?:Day\s+[+-]?\d+(?:\s+\w+)?(?:\s+\(\d{4}\))?|\d{1,2}:\d{2})\s*[:;-]?\s*/i, "")
    .replace(/^\s*(?:scheduled meds?|current inpatient medications?|medication orders?|mar|administration record)\s*[:;-]\s*/i, "")
    .trim();
}

function parseMedicationName(line, dose) {
  let cleaned = stripNoiseBeforeName(canonicalLine(line));
  cleaned = cleaned.replace(/\b(?:given|administered|held by provider|held|patient refused|refused|not given|ordered|active|scheduled|completed|scanned|infusing|started)\b.*$/i, "").trim();
  const doseIndex = dose?.index ?? -1;
  if (doseIndex > 0) {
    cleaned = stripNoiseBeforeName(canonicalLine(line).slice(0, doseIndex));
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.split(",")[0];
  }
  cleaned = cleaned
    .replace(/\b(?:po|p\.o\.|iv|i\.v\.|subcutaneous|subcut|sq|sc|im|oral|intravenous|topical|transdermal|inhaled|rectal|ophthalmic|nasal)\b.*$/i, "")
    .replace(/\b(?:daily|nightly|bid|tid|qid|qhs|q\d+h|prn|as needed)\b.*$/i, "")
    .replace(/[,:;|()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (!words.length || words.length > 5) {
    return "";
  }
  if (/^(?:medications?|scheduled|current|active|orders?|mar|administration|record)$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function normalizeMedicationName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(?:hcl|hydrochloride|sodium|potassium|calcium|oral|injection|tablet|capsule|solution)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isComparableDose(left, right) {
  return Boolean(left && right && left.normalizedUnit && left.normalizedUnit === right.normalizedUnit);
}

function dosesMatch(left, right) {
  if (!isComparableDose(left, right)) {
    return false;
  }
  return Math.abs(left.normalizedValue - right.normalizedValue) < 0.0001;
}

function isMedicationLine(line) {
  return /\b\d+(?:\.\d+)?\s*(?:mcg|micrograms?|mg|g|units?|u|mL|ml|%|patch(?:es)?|tab(?:let)?s?|cap(?:sule)?s?)\b/i.test(line) ||
    /\b(?:given|administered|held|refused|not given|ordered|scheduled|active order|prn)\b/i.test(line);
}

function parseMedicationRecord(line, contextMode) {
  const cleaned = cleanLine(line);
  if (!cleaned || isLikelySectionHeading(cleaned) || !isMedicationLine(cleaned)) {
    return null;
  }
  const status = statusForLine(cleaned, contextMode);
  const dose = parseDose(cleaned);
  const name = parseMedicationName(cleaned, dose);
  if (!name) {
    return null;
  }
  const route = parseRoute(cleaned);
  const frequency = parseFrequency(cleaned);
  const isPrn = /\b(?:prn|as needed)\b/i.test(cleaned);
  const ambiguous = ambiguousMedicationPatterns.some((pattern) => pattern.test(cleaned));
  return {
    name,
    key: normalizeMedicationName(name),
    dose,
    route,
    frequency,
    status,
    isPrn,
    ambiguous,
    sourceLine: cleaned
  };
}

export function parseMedicationRecords(text) {
  const source = String(text || "");
  let contextMode = "order";
  const records = [];
  source.split(/\r?\n/).forEach((line) => {
    const cleaned = cleanLine(line);
    if (!cleaned) {
      return;
    }
    contextMode = detectContextMode(cleaned, contextMode);
    const record = parseMedicationRecord(cleaned, contextMode);
    if (record) {
      records.push(record);
    }
  });
  return records;
}

function issue(category, medication, message, records = []) {
  return {
    category,
    medication,
    message,
    sourceLines: [...new Set(records.map((record) => record?.sourceLine).filter(Boolean))]
  };
}

function bestMatchingAdmin(order, admins) {
  const candidates = admins.filter((admin) => admin.key === order.key);
  if (!candidates.length) {
    return null;
  }
  const routeMatch = candidates.find((admin) => order.route && admin.route && normalizeRoute(order.route) === normalizeRoute(admin.route));
  return routeMatch || candidates[0];
}

export function auditMedicationAdministration(text) {
  const medText = extractMedicationAdministrationText(text) || String(text || "").trim();
  if (!medText) {
    return {
      hasMedicationSource: false,
      records: [],
      issues: [],
      counts: {},
      summary: "No medication orders or MAR text was provided."
    };
  }
  const records = parseMedicationRecords(medText);
  const orders = records.filter((record) => record.status === "ordered" && !record.sourceLine.match(/\b(?:discontinued|stopped|expired)\b/i));
  const administrations = records.filter((record) => ["given", "held", "refused", "not given"].includes(record.status));
  const givenAdmins = administrations.filter((record) => record.status === "given");
  const notGivenAdmins = administrations.filter((record) => record.status !== "given");
  const issues = [];

  const ordersByKey = new Map();
  orders.forEach((order) => {
    if (!ordersByKey.has(order.key)) {
      ordersByKey.set(order.key, []);
    }
    ordersByKey.get(order.key).push(order);
  });

  for (const order of orders) {
    const sameMedOrders = ordersByKey.get(order.key) || [];
    const matchingAdmin = bestMatchingAdmin(order, administrations);
    if (order.ambiguous || sameMedOrders.some((candidate) => candidate !== order && candidate.dose && order.dose && !dosesMatch(candidate.dose, order.dose))) {
      issues.push(issue("Needs verification", order.name, `${order.name}: dose schedule or titration is ambiguous in pasted orders; verify active order and MAR.`, [order, matchingAdmin]));
      continue;
    }
    if (order.isPrn && !matchingAdmin) {
      continue;
    }
    if (!matchingAdmin) {
      issues.push(issue("Possible missed or not documented", order.name, `${order.name}: active/scheduled order found, but no matching administration was found in the pasted MAR; verify in MAR.`, [order]));
      continue;
    }
    if (matchingAdmin.status !== "given") {
      issues.push(issue("Held/refused/not given", order.name, `${order.name}: documented as ${matchingAdmin.status}; verify reason and whether the plan changes.`, [order, matchingAdmin]));
      continue;
    }
    if (isComparableDose(order.dose, matchingAdmin.dose) && !dosesMatch(order.dose, matchingAdmin.dose)) {
      issues.push(issue("Dose mismatch", order.name, `${order.name}: ordered ${order.dose.text}, but pasted MAR shows ${matchingAdmin.dose.text} given; verify dose in MAR.`, [order, matchingAdmin]));
    }
    if (order.route && matchingAdmin.route && normalizeRoute(order.route) !== normalizeRoute(matchingAdmin.route)) {
      issues.push(issue("Route mismatch", order.name, `${order.name}: ordered route ${order.route}, but pasted MAR shows ${matchingAdmin.route}; verify route in MAR.`, [order, matchingAdmin]));
    }
    if (order.frequency && matchingAdmin.frequency && normalizeFrequency(order.frequency) !== normalizeFrequency(matchingAdmin.frequency)) {
      issues.push(issue("Frequency or timing mismatch", order.name, `${order.name}: ordered ${order.frequency}, but pasted MAR shows ${matchingAdmin.frequency}; verify timing in MAR.`, [order, matchingAdmin]));
    }
  }

  givenAdmins.forEach((admin) => {
    if (!ordersByKey.has(admin.key)) {
      issues.push(issue("Administered without matching order", admin.name, `${admin.name}: pasted MAR shows administration, but no matching active order was parsed; verify in MAR/orders.`, [admin]));
    }
    if (admin.ambiguous) {
      issues.push(issue("Needs verification", admin.name, `${admin.name}: administration line appears protocol-based or titratable; verify current order and MAR.`, [admin]));
    }
  });

  notGivenAdmins.forEach((admin) => {
    if (!ordersByKey.has(admin.key)) {
      issues.push(issue("Held/refused/not given", admin.name, `${admin.name}: pasted MAR documents ${admin.status}; verify whether an active order remains.`, [admin]));
    }
  });

  const deduped = [];
  const seen = new Set();
  issues.forEach((item) => {
    const key = `${item.category}|${item.medication}|${item.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  });
  const counts = deduped.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  return {
    hasMedicationSource: true,
    records,
    issues: deduped,
    counts,
    summary: deduped.length
      ? `${deduped.length} medication item${deduped.length === 1 ? "" : "s"} to verify.`
      : "No medication administration discrepancies detected in the pasted medication/MAR text. Verify against the live MAR before rounds."
  };
}

export function medicationAuditActionCount(audit) {
  return audit?.issues?.length || 0;
}

export function formatMedicationAuditForPrompt(audit) {
  if (!audit?.hasMedicationSource) {
    return "";
  }
  const lines = [
    "Medication Administration Audit:",
    "This is a local ordered-versus-given comparison from pasted Epic medication orders/MAR text. Treat findings as items to verify in the live MAR, not definitive medication-error determinations."
  ];
  if (!audit.issues.length) {
    lines.push("- No missed doses, held/refused doses, or dose/frequency/route mismatches were detected from the pasted medication/MAR text.");
    return lines.join("\n");
  }
  const categoryOrder = [
    "Possible missed or not documented",
    "Dose mismatch",
    "Frequency or timing mismatch",
    "Route mismatch",
    "Held/refused/not given",
    "Administered without matching order",
    "Needs verification"
  ];
  categoryOrder.forEach((category) => {
    const items = audit.issues.filter((item) => item.category === category);
    if (!items.length) {
      return;
    }
    lines.push(`${category}:`);
    items.forEach((item) => {
      lines.push(`- ${item.message}`);
    });
  });
  return lines.join("\n");
}

