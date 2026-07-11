const SYSTEM_MATCHERS = [
  ["Cardiovascular", /cardiac|heart|murmur|pulse|edema|volume|chest pain/i],
  ["Respiratory", /lung|respirat|dyspnea|oxygen|breath|cough/i],
  ["Abdomen", /abdomen|bowel|nausea|vomit|cva/i],
  ["Neurologic", /neuro|mental status|mentation|syncope|weakness/i],
  ["Infectious", /infection|sepsis|fever|antibiotic|culture|source/i],
  ["Medications", /medication|allerg|adherence|supplement/i],
  ["Functional status", /baseline|function|living|support|assistive/i],
  ["General", /general|appearance|distress|chief concern|presenting/i]
];

export function checklistItemSystem(item = {}) {
  const explicit = String(item.system || "").trim();
  if (explicit) return explicit;
  const source = `${item.itemId || ""} ${item.text || ""}`;
  return SYSTEM_MATCHERS.find(([, pattern]) => pattern.test(source))?.[0] || (item.kind === "exam" ? "Focused exam" : "History");
}

export function groupChecklistItemsBySystem(items = []) {
  const groups = new Map();
  for (const item of items) {
    const system = checklistItemSystem(item);
    groups.set(system, [...(groups.get(system) || []), item]);
  }
  return [...groups.entries()].map(([system, groupedItems]) => ({ system, items: groupedItems }));
}
