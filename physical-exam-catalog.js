export const PHYSICAL_EXAM_REFERENCE_PATH = "data/physical-exam/physical_exam_reference.csv";
export const PHYSICAL_EXAM_EVIDENCE_OVERLAY_PATH = "data/physical-exam/physical_exam_evidence_overlay.csv";

let cachedPhysicalExamCatalog = null;

export function parseCsvRow(line = "") {
  const fields = [];
  let value = "";
  let quoted = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(value);
      value = "";
      continue;
    }
    value += char;
  }
  fields.push(value);
  return fields.map((field) => field.trim());
}

export function parsePhysicalExamCatalogCsv(csvText = "") {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = parseCsvRow(line);
    return headers.reduce((row, header, index) => {
      row[header] = fields[index] || "";
      return row;
    }, {});
  }).filter((row) => row.exam_id);
}

export function createPhysicalExamCatalog(referenceRows = [], overlayRows = []) {
  const overlayById = new Map((overlayRows || []).map((row) => [row.exam_id, row]));
  const rows = (referenceRows || []).map((row) => ({
    ...row,
    ...(overlayById.get(row.exam_id) || {})
  }));
  const byId = new Map(rows.filter((row) => row.exam_id).map((row) => [row.exam_id, row]));
  return {
    rows,
    byId,
    ids: new Set(byId.keys())
  };
}

export function physicalExamCatalogFromCsv(referenceCsv = "", overlayCsv = "") {
  return createPhysicalExamCatalog(
    parsePhysicalExamCatalogCsv(referenceCsv),
    parsePhysicalExamCatalogCsv(overlayCsv)
  );
}

export async function loadPhysicalExamCatalog(fetcher = globalThis.fetch) {
  if (cachedPhysicalExamCatalog) return cachedPhysicalExamCatalog;
  if (typeof fetcher !== "function") {
    throw new Error("Physical exam catalog fetch is not available.");
  }
  const [referenceResponse, overlayResponse] = await Promise.all([
    fetcher(PHYSICAL_EXAM_REFERENCE_PATH),
    fetcher(PHYSICAL_EXAM_EVIDENCE_OVERLAY_PATH)
  ]);
  if (!referenceResponse?.ok) throw new Error("Physical exam reference catalog could not be loaded.");
  if (!overlayResponse?.ok) throw new Error("Physical exam evidence overlay could not be loaded.");
  cachedPhysicalExamCatalog = physicalExamCatalogFromCsv(
    await referenceResponse.text(),
    await overlayResponse.text()
  );
  return cachedPhysicalExamCatalog;
}

export function physicalExamCatalogHasId(catalog, examId = "") {
  if (!examId) return false;
  if (catalog instanceof Set) return catalog.has(examId);
  if (catalog instanceof Map) return catalog.has(examId);
  if (catalog?.ids instanceof Set) return catalog.ids.has(examId);
  if (catalog?.byId instanceof Map) return catalog.byId.has(examId);
  return false;
}

export function physicalExamCatalogRow(catalog, examId = "") {
  if (!examId) return null;
  if (catalog instanceof Map) return catalog.get(examId) || null;
  if (catalog?.byId instanceof Map) return catalog.byId.get(examId) || null;
  return null;
}

export function hydratePhysicalExamItem(item = {}, catalog = null) {
  const examId = item.exam_id || item.examId || item.linkedExamId || "";
  if (!examId) return { ...item };
  const row = physicalExamCatalogRow(catalog, examId);
  if (!row) return { ...item, exam_id: examId };
  const options = row.suggested_options
    ? row.suggested_options.split(/\s*\/\s*/).map((entry) => entry.trim()).filter(Boolean)
    : item.findings_options || item.answer_options || item.options;
  const technique = item.technique
    || item.how_to_perform
    || row.how_to_perform
    || row.examiner_technique
    || row.maneuver_or_finding
    || "";
  return {
    ...item,
    exam_id: examId,
    label: item.label || row.suggested_checklist_label || row.maneuver_or_finding || examId,
    technique,
    how_to_perform: item.how_to_perform || row.how_to_perform || technique,
    include_when: item.include_when || item.when_to_perform || row.include_when || "",
    diagnostic_target: item.diagnostic_target || row.function_or_clinical_use || "",
    findings_options: item.findings_options || item.answer_options || item.options || options,
    custom_exam: Boolean(item.custom_exam)
  };
}
