import { sanitizeResidualWarningMetadata } from "./review.js";
import { naturalLanguagePrompt } from "../prompts/natural-language.js";

const sourceKinds = [
  ["primary_note", "Primary team note", "The latest primary-team note or interval update copied from Epic."],
  ["results", "Results", "Selected-day laboratory, imaging, microbiology, and diagnostic results."],
  ["medication_activity", "Medication activity", "Medication administrations, holds, starts, stops, and active orders."],
  ["consult_note", "Consult note", "A consultant note, recommendation, or procedure update."],
  ["physical_exam", "Physical exam findings", "A de-identified physical examination or SOAP-note examination section."],
  ["bedside_update", "Bedside update", "What the patient, nursing team, or clinician learned at the bedside."],
  ["other_chart_text", "Other chart text", "Other selected-day chart text that should remain in the packet." ]
];

export const DAILY_SOURCE_KINDS = sourceKinds.map(([id, label, description]) => ({ id, label, description }));
export const DEFAULT_DAILY_SOURCE_KIND = "primary_note";

const legacySourceKindByRole = new Map([
  ["interval_events", "primary_note"],
  ["patient_report", "bedside_update"],
  ["current_support", "results"],
  ["focused_exam", "bedside_update"],
  ["key_results", "results"],
  ["medication_order_events", "medication_activity"],
  ["consultant_decisions", "consult_note"],
  ["problem_plan_updates", "primary_note"],
  ["disposition_questions", "primary_note"],
  ["additional_daily_source", "other_chart_text"]
]);

function localCaptureId() {
  return `capture_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function planCaptureRedaction(priorText, currentText) {
  const prior = String(priorText || "");
  const current = String(currentText || "");
  if (current === prior) return { mode: "unchanged" };
  if (prior && current.startsWith(prior)) {
    const appended = current.slice(prior.length);
    const leadingWhitespace = appended.match(/^\s*/)[0];
    const withoutLeading = appended.slice(leadingWhitespace.length);
    const trailingWhitespace = withoutLeading.match(/\s*$/)[0];
    const suffix = trailingWhitespace ? withoutLeading.slice(0, -trailingWhitespace.length) : withoutLeading;
    return { mode: "append", suffix, leadingWhitespace, trailingWhitespace };
  }
  return { mode: "full" };
}

export function dailySourceKind(kind) {
  return DAILY_SOURCE_KINDS.find((entry) => entry.id === kind) || DAILY_SOURCE_KINDS.find((entry) => entry.id === "other_chart_text");
}

export function dailySourceKindLabel(kind) {
  return dailySourceKind(kind)?.label || "Other chart text";
}

export function dailySourceKindOptions() {
  return DAILY_SOURCE_KINDS.map(({ id, label, description }) => ({ id, label, description }));
}

export function normalizeSourceCapture(capture, { now = () => new Date().toISOString() } = {}) {
  const timestamp = now();
  const sourceKind = dailySourceKind(capture?.sourceKind)?.id || "other_chart_text";
  return {
    id: String(capture?.id || localCaptureId()),
    sourceKind,
    label: String(capture?.label || dailySourceKindLabel(sourceKind)).trim() || dailySourceKindLabel(sourceKind),
    deidentifiedText: String(capture?.deidentifiedText || ""),
    residualWarnings: sanitizeResidualWarningMetadata(Array.isArray(capture?.residualWarnings) ? capture.residualWarnings : []),
    capturedAt: String(capture?.capturedAt || capture?.createdAt || timestamp),
    createdAt: String(capture?.createdAt || capture?.capturedAt || timestamp),
    updatedAt: String(capture?.updatedAt || capture?.createdAt || capture?.capturedAt || timestamp)
  };
}

export function createSourceCapture({ sourceKind = DEFAULT_DAILY_SOURCE_KIND, label = "", text = "", residualWarnings = [], now = () => new Date().toISOString() } = {}) {
  return normalizeSourceCapture({ sourceKind, label, deidentifiedText: text, residualWarnings }, { now });
}

// This is a one-time exact migration from the previous controlled role IDs.
// It never classifies free text or guesses a clinical purpose from a label.
export function migrateLegacyDailySections(sections = [], { now = () => new Date().toISOString() } = {}) {
  return (sections || []).
    filter((section) => String(section?.deidentifiedText || "").trim() || (section?.residualWarnings || []).length).
    map((section) => {
      const sourceKind = legacySourceKindByRole.get(section?.role) || "other_chart_text";
      return normalizeSourceCapture({
        id: section?.id,
        sourceKind,
        label: section?.label || dailySourceKindLabel(sourceKind),
        deidentifiedText: section?.deidentifiedText,
        residualWarnings: section?.residualWarnings,
        createdAt: section?.createdAt,
        updatedAt: section?.updatedAt,
        capturedAt: section?.updatedAt || section?.createdAt
      }, { now });
    });
}

export async function replaceSourceCapturesFromFormAsync(rows, deidentify, { onResult, onProgress, priorCaptures = [], now = () => new Date().toISOString() } = {}) {
  const priorById = new Map((priorCaptures || []).map((capture) => [capture.id, capture]));
  const plans = rows.map((row) => {
    const prior = priorById.get(row.id) || null;
    return { row, prior, plan: planCaptureRedaction(prior?.deidentifiedText, row.text) };
  });
  let completed = 0;
  const total = rows.length;
  const results = await Promise.all(plans.map(async ({ row, prior, plan }, index) => {
    onProgress?.({ phase: "started", index, completed, total, row });
    let result;
    if (plan.mode === "unchanged") {
      result = { text: prior.deidentifiedText, residualWarnings: prior.residualWarnings || [] };
    } else if (plan.mode === "append") {
      if (!plan.suffix) {
        result = { text: prior.deidentifiedText + plan.leadingWhitespace + plan.trailingWhitespace, residualWarnings: prior.residualWarnings || [] };
      } else {
        const suffixResult = await deidentify(plan.suffix);
        result = {
          text: prior.deidentifiedText + plan.leadingWhitespace + (suffixResult.text || "") + plan.trailingWhitespace,
          residualWarnings: [...(prior.residualWarnings || []), ...(suffixResult.residualWarnings || suffixResult.flags || [])],
          suffixResult
        };
      }
    } else {
      result = await deidentify(String(row.text || ""));
    }
    completed += 1;
    onProgress?.({ phase: "completed", index, completed, total, row });
    return result;
  }));
  return rows.map((row, index) => {
    const { prior, plan } = plans[index];
    const result = results[index] || {};
    onResult?.({ row, result, prior, plan, index });
    return normalizeSourceCapture({
      id: row.id,
      sourceKind: row.sourceKind,
      label: row.label || dailySourceKindLabel(row.sourceKind),
      deidentifiedText: result.text || "",
      residualWarnings: result.residualWarnings || result.flags || [],
      capturedAt: row.capturedAt || prior?.capturedAt,
      createdAt: row.createdAt || prior?.createdAt,
      updatedAt: now()
    }, { now });
  });
}

export function sourceCapturesToPromptBlock(captures = [], title = "Selected-day sources") {
  const entries = (captures || [])
    .filter((capture) => String(capture?.deidentifiedText || "").trim())
    .map((capture) => `${dailySourceKindLabel(capture.sourceKind)}. ${capture.deidentifiedText.trim()}`);
  const body = entries.length ? entries.join("\n\n") : "No selected-day sources saved.";
  return naturalLanguagePrompt(`${title}.\n\n${body}`);
}

export function sourceCapturePacketCheck(captures = []) {
  const supplied = new Set((captures || []).filter((capture) => String(capture?.deidentifiedText || "").trim()).map((capture) => capture.sourceKind));
  const expected = ["primary_note", "results", "medication_activity", "bedside_update"];
  const included = DAILY_SOURCE_KINDS.filter((kind) => supplied.has(kind.id)).map((kind) => kind.label);
  const notSupplied = expected.filter((kind) => !supplied.has(kind)).map((kind) => dailySourceKindLabel(kind));
  const warningCount = (captures || []).reduce((count, capture) => count + (capture?.residualWarnings?.length || 0), 0);
  return {
    included,
    notSupplied,
    needsConfirmation: warningCount ? [`${warningCount} residual de-identification warning${warningCount === 1 ? "" : "s"}`] : []
  };
}
