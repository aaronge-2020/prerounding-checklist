import {
  clinicalDisplayModelFromPromptText,
  laboratoryAbnormality
} from "../patient-context/structured-clinical-data.js?v=20260921-clinical-review-fix";

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
  const insertionText = latest
    ? observations.length > 1
      ? `${candidate.name}: latest ${displayedObservation(latest)}; trend ${observations.map((observation) => displayedObservation(observation)).join(" → ")}`
      : displayedObservation(latest, { includeName: true })
    : candidate.name;
  const finalized = {
    ...candidate,
    group,
    observations,
    latest,
    insertionText,
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
  if (!Number.isFinite(latestVitalTime)) return null;
  const observations = candidate.observations.filter((observation) =>
    Number.isFinite(observation.numericValue)
    && Number.isFinite(observation.sortTime)
    && observation.sortTime >= latestVitalTime - 24 * 60 * 60 * 1000
    && observation.sortTime <= latestVitalTime
  );
  if (!observations.length) return null;
  const values = observations.map((observation) => observation.numericValue);
  return {
    count: values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    mean: rounded(values.reduce((total, value) => total + value, 0) / values.length),
    median: rounded(median(values)),
    windowStart: latestVitalTime - 24 * 60 * 60 * 1000,
    windowEnd: latestVitalTime
  };
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
  const candidate = {
    id: stableId("result", sourceIdentity, label),
    kind: "diagnostic_result",
    group: resultGroup(category),
    name: label,
    label,
    resultCategory: category,
    text,
    context,
    resultDate,
    source: sourceProvenance(source)
  };
  const details = [category, resultDate, source.dayLabel, context].filter(Boolean).join(" · ");
  candidate.insertionText = `${label}${details ? ` (${details})` : ""}\n${text}`;
  candidate.searchText = clean([label, category, text, context, resultDate, source.dayLabel, source.dayDate].join(" ")).toLocaleLowerCase("en-US");
  candidate.fingerprint = fingerprint({ id: candidate.id, label, category, text, context, resultDate, source: candidate.source });
  return candidate;
}

function addClinicalSource(source, sourceOrder, labMap, vitalMap, medicationMap) {
  const display = clinicalDisplayModelFromPromptText(source.sourceKind, source.record.deidentifiedText);
  if (!display?.groups?.length) return;
  const provenance = sourceProvenance(source);

  if (display.type === "labs") {
    display.groups.forEach((group, groupOrder) => group.rows.forEach((row, rowOrder) => {
      const [name = "", displayedValue = "", displayedUnit = "", referenceRange = "", flag = ""] = row.cells || [];
      const parsed = splitValueAndUnit(displayedValue, displayedUnit);
      const value = parsed.value;
      const unit = parsed.unit;
      const reportedStatus = clean(row.emphasis) || "unknown";
      const calculatedStatus = laboratoryAbnormality({ value, flag, referenceRange }).status;
      const key = `${normalizedExact(name)}\u0000${normalizedExact(unit)}`;
      if (!normalizedExact(name)) return;
      if (!labMap.has(key)) labMap.set(key, {
        id: stableId("lab", key, name),
        kind: "laboratory_result",
        name: clean(name),
        unit: clean(unit),
        observations: []
      });
      const identity = `${source.scope}\u0000${source.dayId}\u0000${source.sourceId}\u0000${groupOrder}\u0000${rowOrder}`;
      labMap.get(key).observations.push({
        id: stableId("lab_observation", identity, name),
        name: clean(name),
        value: clean(value),
        unit: clean(unit),
        referenceRange: clean(referenceRange),
        flag: clean(flag),
        status: reportedStatus === "unknown" ? calculatedStatus : reportedStatus,
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
    }));
    return;
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
    }));
    return;
  }

  if (display.type === "medications") {
    display.groups.forEach((group, groupOrder) => group.rows.forEach((row, rowOrder) => {
      const [name = "", dose = "", route = "", administrationTimes = ""] = row.cells || [];
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
        dose: clean(dose),
        route: clean(route),
        administrationTimes: clean(administrationTimes),
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
    }));
  }
}

function finalizeMedicationCandidate(candidate) {
  const observations = [...candidate.observations].sort(compareObservations);
  const latestSavedEntry = observations.at(-1) || null;
  const describe = (entry) => {
    const details = [
      entry.dose && `dose ${entry.dose}`,
      entry.route && `route ${entry.route}`,
      entry.administrationTimes && `administered ${entry.administrationTimes}`
    ].filter(Boolean).join(" · ");
    return `${entry.dayLabel}${details ? `: ${details}` : ""}`;
  };
  const finalized = {
    ...candidate,
    group: "medications",
    observations,
    history: observations,
    latestSavedEntry,
    dose: latestSavedEntry?.dose || "",
    route: latestSavedEntry?.route || "",
    administrationTimes: latestSavedEntry?.administrationTimes || "",
    insertionText: latestSavedEntry
      ? `${candidate.name} — latest saved entry ${describe(latestSavedEntry)}${observations.length > 1 ? `; saved history ${observations.map(describe).join(" | ")}` : ""}`
      : candidate.name,
    searchText: clean([candidate.name, ...observations.flatMap((entry) => [entry.dose, entry.route, entry.administrationTimes, entry.savedSection, entry.dayLabel])].join(" ")).toLocaleLowerCase("en-US")
  };
  finalized.fingerprint = fingerprint({
    id: finalized.id,
    entries: observations.map(({ id, dose, route, administrationTimes, savedSection, dayLabel }) => ({ id, dose, route, administrationTimes, savedSection, dayLabel }))
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

export function buildClinicalReviewIndex(patient) {
  const labMap = new Map();
  const vitalMap = new Map();
  const medicationMap = new Map();
  const diagnostics = [];
  const sources = sourcesForPatient(patient);

  sources.forEach((source, sourceOrder) => {
    if (source.sourceKind === "results") diagnostics.push(diagnosticCandidate(source));
    else addClinicalSource(source, sourceOrder, labMap, vitalMap, medicationMap);
  });

  coalesceUnitlessObservations(labMap);
  coalesceUnitlessObservations(vitalMap);
  const labs = [...labMap.values()].map((candidate) => finalizeObservationCandidate(candidate, "labs"));
  let vitals = [...vitalMap.values()].map((candidate) => finalizeObservationCandidate(candidate, "vitals"));
  const latestVitalTime = vitals.flatMap((candidate) => candidate.observations)
    .filter((observation) => Number.isFinite(observation.numericValue) && Number.isFinite(observation.sortTime))
    .reduce((latest, observation) => Math.max(latest, observation.sortTime), Number.NEGATIVE_INFINITY);
  vitals = vitals.map((candidate) => {
    const statistics24h = vitalStatistics(candidate, latestVitalTime);
    const next = { ...candidate, statistics24h };
    next.fingerprint = fingerprint({ id: next.id, observations: next.observations.map(({ id, value, unit, timestamp, dayLabel }) => ({ id, value, unit, timestamp, dayLabel })), statistics24h });
    return next;
  });
  const medications = [...medicationMap.values()].map(finalizeMedicationCandidate);

  const byGroup = new Map(GROUP_DEFINITIONS.map(({ id }) => [id, []]));
  for (const candidate of [...vitals, ...labs, ...medications, ...diagnostics]) byGroup.get(candidate.group)?.push(candidate);
  for (const candidates of byGroup.values()) candidates.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const groups = GROUP_DEFINITIONS.map((definition) => ({ ...definition, candidates: byGroup.get(definition.id) }));
  const candidates = groups.flatMap((group) => group.candidates);
  return {
    patientId: clean(patient?.id),
    groups,
    candidates,
    vitals: byGroup.get("vitals"),
    labs: byGroup.get("labs"),
    medications: byGroup.get("medications"),
    diagnosticResults: diagnostics.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
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
