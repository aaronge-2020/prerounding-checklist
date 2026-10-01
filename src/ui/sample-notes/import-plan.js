// Pure fixture-to-import-plan conversion for Sample Notes "Add to vault".
// No DOM, no storage, no network: buildImportPlan(note) turns one sample
// fixture into an ordered list of chart sources in the exact canonical
// text formats the app's own parsers recognize (the same formats produced
// by clinicalPromptText), so imported sources parse in Review, feed the
// calculator patient bindings, and expose medications to drug checks.
//
// Source order: note, vitals, labs, medications, imaging. The note body
// carries the synthetic patient header; structured sources stay clean
// machine formats, the way real EHR exports arrive.

const SOURCE_ROLES = {
  primary_note: "admission_reason",
  vital_signs: "admission_results",
  laboratory_results: "admission_results",
  results: "admission_results",
  medication_activity: "procedures_devices"
};

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function labTestLine(test) {
  const name = clean(test.name);
  if (!name) return "";
  let line = `${name}: ${clean(test.value)}`;
  if (clean(test.units)) line += ` ${clean(test.units)}`;
  if (clean(test.ref)) line += `; ref ${clean(test.ref)}`;
  if (clean(test.flag)) line += `; flag ${clean(test.flag)}`;
  return line;
}

function labsSourceText(note) {
  const panels = Array.isArray(note.labs) ? note.labs : [];
  const lines = ["Labs"];
  for (const panel of panels) {
    const header = [clean(panel.panel), clean(panel.collected) ? `collected ${clean(panel.collected)}` : ""]
      .filter(Boolean)
      .join(", ");
    if (header) lines.push(`@ ${header}`);
    for (const test of panel.tests || []) {
      const line = labTestLine(test);
      if (line) lines.push(line);
    }
  }
  return lines.join("\n").trim();
}

function vitalsSourceText(note) {
  const rows = Array.isArray(note.vitals) ? note.vitals : [];
  const lines = ["Vitals"];
  for (const v of rows) {
    const measurements = [];
    if (clean(v.temp)) measurements.push(`Temp ${clean(v.temp)} \u00B0F`);
    if (clean(v.hr)) measurements.push(`HR ${clean(v.hr)}`);
    if (clean(v.bp)) measurements.push(`BP ${clean(v.bp)}`);
    if (clean(v.rr)) measurements.push(`RR ${clean(v.rr)}`);
    // Keep only the numeric saturation; context like "room air" lives in the note.
    const spo2 = clean(v.spo2).match(/(\d+(?:\.\d+)?)\s*%?/);
    if (spo2) measurements.push(`SpO2 ${spo2[1]}%`);
    if (clean(v.pain)) measurements.push(`Pain ${clean(v.pain)}`);
    if (!measurements.length) continue;
    const prefix = clean(v.time) ? `@ ${clean(v.time)}: ` : "";
    lines.push(`${prefix}${measurements.join("; ")}`);
  }
  return lines.join("\n").trim();
}

function medicationSourceText(note) {
  const meds = Array.isArray(note.medications) ? note.medications : [];
  const lines = ["Medications"];
  for (const m of meds) {
    const name = clean(m.name);
    if (!name) continue;
    const details = [
      clean(m.dose) && `Dose: ${clean(m.dose)}`,
      clean(m.route) && `Route: ${clean(m.route)}`,
      clean(m.frequency) && `Frequency: ${clean(m.frequency)}`
    ].filter(Boolean).join(" | ");
    const group = clean(m.status) ? `[${clean(m.status)}] ` : "";
    lines.push(details ? `${group}${name} \u2014 ${details}` : `${group}${name}`);
  }
  return lines.join("\n").trim();
}

function imagingSourceText(report) {
  const lines = [];
  const title = [clean(report.title), clean(report.modality) ? `(${clean(report.modality)})` : "", clean(report.date) ? `, ${clean(report.date)}` : ""]
    .filter(Boolean)
    .join(" ");
  if (title) lines.push(title);
  if (clean(report.body)) lines.push(clean(report.body));
  return lines.join("\n").trim();
}

// One import part per chart section present on the fixture. Every part is
// { sourceKind, label, role, resultCategory, resultDate, sourceText }.
export function buildImportPlan(note) {
  if (!note || typeof note !== "object") return [];
  const parts = [];
  const body = String(note.body || "").trim();
  if (body) {
    parts.push({
      sourceKind: "primary_note",
      label: "Admission note",
      role: SOURCE_ROLES.primary_note,
      resultCategory: "",
      resultDate: "",
      sourceText: body
    });
  }
  const vitals = vitalsSourceText(note);
  if (vitals.split("\n").length > 1) {
    parts.push({
      sourceKind: "vital_signs",
      label: "Vital signs",
      role: SOURCE_ROLES.vital_signs,
      resultCategory: "",
      resultDate: "",
      sourceText: vitals
    });
  }
  const labs = labsSourceText(note);
  if (labs.split("\n").length > 1) {
    parts.push({
      sourceKind: "laboratory_results",
      label: "Laboratory results",
      role: SOURCE_ROLES.laboratory_results,
      resultCategory: "",
      resultDate: "",
      sourceText: labs
    });
  }
  const meds = medicationSourceText(note);
  if (meds.split("\n").length > 1) {
    parts.push({
      sourceKind: "medication_activity",
      label: "Medication list",
      role: SOURCE_ROLES.medication_activity,
      resultCategory: "",
      resultDate: "",
      sourceText: meds
    });
  }
  for (const report of note.imaging || []) {
    const text = imagingSourceText(report || {});
    if (!text) continue;
    parts.push({
      sourceKind: "results",
      label: clean(report.title) || "Imaging report",
      role: SOURCE_ROLES.results,
      resultCategory: "imaging",
      resultDate: clean(report.date),
      sourceText: text
    });
  }
  return parts;
}

// Stable identity for duplicate detection: the same fixture must never
// create a second patient on a repeated "Add to vault".
export function sampleImportKey(note) {
  return String(note?.id ?? "").trim();
}
