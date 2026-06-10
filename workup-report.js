import { complaintSourceRegistry } from "./medical-knowledge-db.js";

function reportList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function displayText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExportText(String(item || "").trim())).filter(Boolean).join("; ");
  }
  return sanitizeExportText(String(value || "").trim());
}

function sanitizeExportText(value) {
  return String(value || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b(?:MRN|FIN|CSN|SSN)\s*[:#]?\s*[\w-]+\b/gi, "[identifier]")
    .replace(/\b(?:DOB|date of birth|born)\s*[:#]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, "[date]")
    .replace(/\b(?:patient\s+name|name)\s*[:#]?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g, "[name]")
    .replace(/\b(?:room|bed|unit)\s*[:#]?\s*[A-Z]?\d+[A-Z]?\b/gi, "[location]")
    .replace(/\b(?:John|Jane)\s+(?:Doe|Smith)\b/g, "[name]")
    .trim();
}

function appendDetail(lines, label, value) {
  const text = displayText(value);
  if (text) {
    lines.push(`   ${label}: ${text}`);
  }
}

function candidateFromEntry(entry = {}) {
  return entry?.candidate || entry || {};
}

function stripSuppressedDisplayPrefix(value = "") {
  return String(value || "")
    .replace(/^(?:not\s+recommended|suppressed(?:\/not-recommended)?|suppressed\s+or\s+lower-fit|lower-fit)\s*[-:]\s*/i, "")
    .trim();
}

function suppressedDisplayLabel(entry = {}) {
  const candidate = candidateFromEntry(entry);
  const sourceLabel = stripSuppressedDisplayPrefix(
    entry.original_label
      || entry.sourceLabel
      || entry.label
      || candidate.examLabel
      || candidate.maneuver
      || candidate.exam_id
      || entry.exam_id
      || ""
  ) || "suppressed item";
  return `Not recommended - ${sourceLabel}`;
}

function formatEvidenceSource(candidate = {}) {
  return candidate.source?.source_id || candidate.evidence_source_primary || candidate.source || "source";
}

function formatEvidenceLikelihood(candidate = {}) {
  const parts = [
    candidate.LR_plus ? `LR+ ${candidate.LR_plus}` : "",
    candidate.LR_minus ? `LR- ${candidate.LR_minus}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "LR n/a";
}

function formatLikelihoodRatioNote(...sources) {
  for (const source of sources) {
    const note = source?.likelihood_ratio_note
      || source?.LR_note
      || source?.lr_note
      || source?.likelihoodRatioNote
      || source?.evidence?.likelihood_ratio_note
      || source?.evidence?.LR_note
      || source?.evidence?.lr_note;
    if (note) {
      return note;
    }
  }
  return "";
}

function intentTraceLabelForEntry(entry = {}) {
  const candidate = candidateFromEntry(entry);
  const traceability = entry.traceability || candidate.traceability || {};
  const ids = unique([
    ...reportList(traceability.intent_ids),
    ...reportList(entry.validatedIntentIds),
    ...reportList(candidate.validated_intent_ids)
  ]);
  const labels = unique([
    ...reportList(traceability.intent_labels),
    ...reportList(candidate.validated_intent_labels)
  ]);
  if (!ids.length) {
    return "n/a";
  }
  return ids
    .map((intentId, index) => labels[index] ? `${intentId} (${labels[index]})` : intentId)
    .join("; ");
}

function hasVettedBedsideQuestion(candidate = {}) {
  const routes = candidate.retrievalRoutes || [];
  return candidate.item_type === "history_question"
    || candidate.gap_type === "history_question"
    || candidate.catalogGap
    || routes.includes("validated_bundle_required")
    || routes.includes("validated_bundle_gap")
    || routes.includes("validated_intent_history_floor");
}

function bedsideQuestionForRecommendation(entry = {}) {
  const candidate = candidateFromEntry(entry);
  if (entry.displayBedsideQuestion) {
    return {
      label: entry.displayBedsideQuestion,
      options: entry.displayBedsideQuestionOptions || ""
    };
  }
  if (hasVettedBedsideQuestion(candidate) && candidate.bedside_question_label) {
    return {
      label: candidate.bedside_question_label,
      options: candidate.bedside_question_options || ""
    };
  }
  return { label: "", options: "" };
}

function candidateFeasibility(entry = {}, candidate = {}) {
  return [
    entry.feasibility?.difficulty || candidate.difficulty ? `difficulty ${entry.feasibility?.difficulty || candidate.difficulty}` : "",
    entry.feasibility?.time_burden_minutes || candidate.time_burden_minutes ? `${entry.feasibility?.time_burden_minutes || candidate.time_burden_minutes} min` : "",
    entry.feasibility?.equipment_needed || candidate.equipment_needed ? `equipment ${entry.feasibility?.equipment_needed || candidate.equipment_needed}` : "",
    entry.feasibility?.patient_cooperation_required || candidate.patient_cooperation_required ? `cooperation ${entry.feasibility?.patient_cooperation_required || candidate.patient_cooperation_required}` : ""
  ].filter(Boolean).join("; ");
}

function recommendationTags(entry = {}, candidate = {}) {
  return unique([
    ...reportList(entry.retrievalTags),
    ...reportList(entry.matchedTags),
    ...reportList(candidate.matchedTags),
    ...reportList(candidate.retrieval_tags),
    ...reportList(candidate.tags)
  ]).join("; ");
}

function appendEvidenceLine(lines, entry = {}, candidate = {}) {
  appendDetail(lines, "Evidence/LR", [
    formatEvidenceLikelihood(candidate),
    `tier ${candidate.evidence_tier || entry.evidence?.tier || "n/a"}`
  ].join("; "));
  appendDetail(lines, "LR interpretation", formatLikelihoodRatioNote(entry, candidate));
}

function appendRecommendationEntry(lines, entry = {}, index = 0, role = "item") {
  const candidate = candidateFromEntry(entry);
  const bedsideQuestion = bedsideQuestionForRecommendation(entry);
  lines.push(`${index + 1}. ${entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "Unlabeled item"}${role ? ` [${role}]` : ""}`);
  appendDetail(lines, "Options/findings", entry.options || entry.findings_options || candidate.examOptions || candidate.findings_options);
  appendDetail(lines, role === "suppressed" ? "Why not recommended" : "Why", entry.reason || entry.rationale || entry.suppressionReason);
  appendDetail(lines, "Diagnostic target", entry.displayDiagnosticTarget || candidate.diagnostic_target);
  appendDetail(lines, "Technique", entry.technique || candidate.technique || candidate.examiner_technique || candidate.base?.examiner_technique || candidate.maneuver);
  appendDetail(lines, "Use when", entry.whenToUse || entry.when_to_use || entry.when_to_use_structured || candidate.when_to_use_structured || candidate.whenToUse || candidate.base?.include_when);
  appendDetail(lines, "Reference thresholds", entry.reference_range_or_threshold || entry.referenceThresholds || entry.reference_thresholds || candidate.reference_range_or_threshold || candidate.reference_thresholds);
  appendDetail(lines, "Management change", entry.displayManagement || candidate.result_changes_management || candidate.management_link);
  appendEvidenceLine(lines, entry, candidate);
  appendDetail(lines, "Feasibility", candidateFeasibility(entry, candidate));
  appendDetail(lines, "Limitations", entry.limitations || entry.interpretationCautions || candidate.limitations || candidate.contraindications_or_limitations || candidate.base?.contraindications_or_limitations);
  if (bedsideQuestion.label) {
    appendDetail(lines, "Linked bedside question", `${bedsideQuestion.label}: ${bedsideQuestion.options || ""}`);
  }
  if (entry.traceability?.catalog_gap || candidate.traceability?.catalog_gap) {
    appendDetail(lines, "Gap status", entry.traceability?.gap_review_status || candidate.traceability?.gap_review_status || candidate.catalog_gap_review_status || "staged_gap");
    appendDetail(lines, "Evidence status", "staged catalog gap; not accepted evidence");
  }
}

function appendCompactRecommendationEntry(lines, entry = {}, index = 0, role = "item") {
  const candidate = candidateFromEntry(entry);
  lines.push(`${index + 1}. ${entry.label || candidate.examLabel || candidate.maneuver || candidate.exam_id || "Unlabeled item"}${role ? ` [${role}]` : ""}`);
  appendDetail(lines, "Why", entry.reason || entry.rationale || entry.suppressionReason);
  appendDetail(lines, "Reference thresholds", entry.reference_range_or_threshold || entry.referenceThresholds || entry.reference_thresholds || candidate.reference_range_or_threshold || candidate.reference_thresholds);
  appendDetail(lines, "Management change", entry.displayManagement || entry.managementChange || entry.management_change || entry.managementImplication || entry.management_implication || candidate.result_changes_management || candidate.management_link);
  appendDetail(lines, "Evidence/LR", [
    formatEvidenceLikelihood(candidate),
    `tier ${candidate.evidence_tier || entry.evidence?.tier || "n/a"}`
  ].join("; "));
}

function appendHistoryQuestion(lines, question = {}, index = 0) {
  const label = question.displayLabel || question.label || question.text || "Focused history question";
  lines.push(`${index + 1}. ${label}`);
  if (question.fullQuestion && question.fullQuestion !== label) {
    appendDetail(lines, "Full source question", question.fullQuestion);
  }
  appendDetail(lines, "Options", question.options);
  appendDetail(lines, "Recorded responses", question.recorded_responses || question.recordedResponses);
  appendDetail(lines, "Detail prompts", question.detail_prompts);
  appendDetail(lines, "Ask when", question.whenToAsk || question.when_to_ask);
  appendDetail(lines, "Diagnostic purpose", question.diagnosticPurpose || question.diagnostic_purpose);
  appendDetail(lines, "Management change", question.managementImplication || question.management_implication);
  appendDetail(lines, "Evidence/LR", `${question.evidence?.LR_plus ? `LR+ ${question.evidence.LR_plus}` : "LR n/a"}${question.evidence?.LR_minus ? ` / LR- ${question.evidence.LR_minus}` : ""}; tier ${question.evidence?.tier || "n/a"}`);
  appendDetail(lines, "LR interpretation", formatLikelihoodRatioNote(question));
}

function appendCompactHistoryQuestion(lines, question = {}, index = 0) {
  const label = question.displayLabel || question.label || question.text || "Focused history question";
  lines.push(`${index + 1}. ${label}`);
  appendDetail(lines, "Options", question.options);
  appendDetail(lines, "Management change", question.managementImplication || question.management_implication);
  appendDetail(lines, "Evidence/LR", `${question.evidence?.LR_plus ? `LR+ ${question.evidence.LR_plus}` : "LR n/a"}${question.evidence?.LR_minus ? ` / LR- ${question.evidence.LR_minus}` : ""}; tier ${question.evidence?.tier || "n/a"}`);
}

function appendStructuredFinding(lines, item = {}, index = 0, role = "item") {
  lines.push(`${index + 1}. ${item.label || item.id || "Unlabeled item"}${role ? ` [${role}]` : ""}`);
  appendDetail(lines, "Finding/result", item.finding || item.result);
  appendDetail(lines, "Question/action", item.text || item.action);
  appendDetail(lines, "Diagnostic target", item.diagnosticTarget || item.diagnostic_target);
  appendDetail(lines, "Management change", item.managementChange || item.management_change || item.managementImplication || item.management_implication);
  appendDetail(lines, "Caution/limitation", item.limitation || item.interpretationCaution || item.limitations);
  appendDetail(lines, "Evidence/LR", `${item.evidence?.LR_plus ? `LR+ ${item.evidence.LR_plus}` : "LR n/a"}${item.evidence?.LR_minus ? ` / LR- ${item.evidence.LR_minus}` : ""}; tier ${item.evidence?.tier || "n/a"}`);
  appendDetail(lines, "LR interpretation", formatLikelihoodRatioNote(item));
}

function appendCatalogGap(lines, gap = {}, index = 0) {
  lines.push(`${index + 1}. ${gap.label || gap.gapId || "Catalog gap"} [staged gap]`);
  appendDetail(lines, "Gap ID", gap.gapId);
  appendDetail(lines, "Gap type", gap.gapType);
  appendDetail(lines, "Evidence status", "staged catalog gap; not accepted evidence");
  appendDetail(lines, "Rationale", gap.rationale);
  appendDetail(lines, "Activation condition", gap.activationCondition);
  appendDetail(lines, "Resolution plan", gap.resolutionPlan);
}

function appendSuppressedSummary(lines, items = [], maxItems = 12) {
  lines.push("", "Suppressed/not-recommended items");
  if (!items.length) {
    lines.push("- None");
    return;
  }
  lines.push(`- ${items.length} lower-fit or suppressed candidates are excluded from the recommended checklist; full row-level details are in Copy review audit.`);
  items.slice(0, maxItems).forEach((entry, index) => {
    const candidate = candidateFromEntry(entry);
    lines.push(`${index + 1}. ${suppressedDisplayLabel(entry)} [suppressed]`);
    appendDetail(lines, "Why not recommended", entry.reason || entry.suppressionReason || "Lower fit for the selected validated intent/context.");
    appendDetail(lines, "Evidence/LR", `${formatEvidenceLikelihood(candidate)}; tier ${candidate.evidence_tier || entry.evidence?.tier || "n/a"}`);
  });
  if (items.length > maxItems) {
    lines.push(`- ${items.length - maxItems} additional suppressed candidates omitted from this concise copy; use Copy review audit for full detail.`);
  }
}

function appendStructuredSummary(lines, title, items = [], role = "item", maxItems = 12) {
  lines.push("", title);
  if (!items.length) {
    lines.push("- None");
    return;
  }
  const shouldSummarize = items.length > maxItems;
  if (shouldSummarize) {
    lines.push(`- ${items.length} rows available; showing the ${maxItems} highest-priority rows in this concise copy. Use Copy review audit for full detail.`);
  }
  items.slice(0, maxItems).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label || item.id || "Unlabeled item"}${role ? ` [${role}]` : ""}`);
    appendDetail(lines, "Finding/result", item.finding || item.result);
    appendDetail(lines, "Question/action", item.text || item.action);
    appendDetail(lines, "Diagnostic target", item.diagnosticTarget || item.diagnostic_target);
    appendDetail(lines, "Management change", item.managementChange || item.management_change || item.managementImplication || item.management_implication);
    appendDetail(lines, "Caution/limitation", item.limitation || item.interpretationCaution || item.limitations);
    appendDetail(lines, "Evidence/LR", `${item.evidence?.LR_plus ? `LR+ ${item.evidence.LR_plus}` : "LR n/a"}${item.evidence?.LR_minus ? ` / LR- ${item.evidence.LR_minus}` : ""}; tier ${item.evidence?.tier || "n/a"}`);
  });
  if (items.length > maxItems) {
    lines.push(`- ${items.length - maxItems} additional ${title.toLowerCase()} rows omitted from this concise copy; use Copy review audit for full row-level detail.`);
  }
}

function appendSection(lines, title, items = [], formatter, options = {}) {
  lines.push("", title);
  if (options.preface) {
    lines.push(`- ${options.preface}`);
  }
  if (!items.length) {
    lines.push("- None");
    return;
  }
  const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : items.length;
  const detailItems = Number.isFinite(options.detailItems) ? options.detailItems : maxItems;
  if (items.length > maxItems) {
    lines.push(`- ${items.length} rows available; showing the ${maxItems} highest-priority rows in this concise copy. Use Copy review audit for full row-level detail.`);
  }
  items.slice(0, maxItems).forEach((item, index) => formatter(lines, item, index, { compact: index >= detailItems }));
  if (items.length > maxItems) {
    lines.push(`- ${items.length - maxItems} additional ${title.toLowerCase()} rows omitted from this concise copy; use Copy review audit for full detail.`);
  }
}

function sourceIdsForEntry(entry = {}) {
  const candidate = candidateFromEntry(entry);
  const traceability = entry.traceability || candidate.traceability || {};
  return unique([
    ...reportList(traceability.source_ids),
    ...reportList(entry.sourceIds),
    ...reportList(entry.source_ids),
    ...reportList(candidate.sourceIds),
    ...reportList(candidate.source_ids),
    candidate.source?.source_id,
    candidate.evidence_source_primary,
    candidate.source_id,
    typeof candidate.source === "string" ? candidate.source : "",
    entry.source,
    entry.evidence?.source
  ].filter((value) => /^[A-Z0-9_:-]{3,}$/i.test(String(value || ""))));
}

const complaintSourceRegistryById = new Map(
  (complaintSourceRegistry || []).map((source) => [String(source.id || "").trim(), source])
);

function sourceCurrencySummaryForId(sourceId = "") {
  const source = complaintSourceRegistryById.get(String(sourceId || "").trim());
  if (!source) {
    return "";
  }
  return [
    source.id,
    source.date_accessed ? `accessed ${source.date_accessed}` : "",
    source.last_reviewed ? `reviewed ${source.last_reviewed}` : "",
    source.next_review_due ? `next review due ${source.next_review_due}` : "",
    source.currency_status ? `status ${source.currency_status}` : "",
    source.review_owner ? `owner ${source.review_owner}` : ""
  ].filter(Boolean).join(" | ");
}

function auditFooterValues(recommendation = {}) {
  const safetyChecks = recommendation.basicSafetyChecks || [];
  const historyQuestions = recommendation.focusedHistoryQuestions || [];
  const redFlags = recommendation.redFlagsAndEscalationCues || [];
  const testThresholds = recommendation.initialTestsAndReferenceThresholds || [];
  const managementFindings = recommendation.managementChangingFindings || [];
  const interpretationCautions = recommendation.limitationsAndInterpretationCautions || [];
  const evidenceMetadata = recommendation.evidenceAndLikelihoodMetadata || [];
  const catalogGapReviews = recommendation.catalogGapsNeedingReview || [];
  const coreItems = recommendation.corePhysicalExamManeuvers || recommendation.coreItems || [];
  const conditionalItems = recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || [];
  const suppressedItems = recommendation.suppressedItems || [];
  const recommendedEntries = [
    ...safetyChecks,
    ...historyQuestions,
    ...coreItems,
    ...conditionalItems,
    ...testThresholds,
    ...redFlags,
    ...managementFindings,
    ...interpretationCautions
  ];
  const sourceIds = unique([
    ...recommendedEntries.flatMap(sourceIdsForEntry),
    ...suppressedItems.flatMap(sourceIdsForEntry),
    ...catalogGapReviews.flatMap((gap) => reportList(gap.sourceIds)),
    ...evidenceMetadata.flatMap((metadata) => reportList(metadata.sourceIds)),
    ...evidenceMetadata.map((metadata) => metadata.source)
  ]).filter((value) => value !== "n/a").slice(0, 40);
  return {
    traceIds: unique([
      ...reportList(recommendation.validatedIntentTrace?.map?.((trace) => trace.intent_id) || []),
      ...recommendedEntries.flatMap((entry) => reportList(intentTraceLabelForEntry(entry)).map((trace) => trace.replace(/\s*\(.+\)\s*$/, ""))),
      ...suppressedItems.flatMap((entry) => reportList(intentTraceLabelForEntry(entry)).map((trace) => trace.replace(/\s*\(.+\)\s*$/, ""))),
      ...catalogGapReviews.flatMap((gap) => reportList(intentTraceLabelForEntry(gap)).map((trace) => trace.replace(/\s*\(.+\)\s*$/, "")))
    ]).filter((value) => value !== "n/a").slice(0, 30),
    sourceIds,
    sourceCurrency: sourceIds.map(sourceCurrencySummaryForId).filter(Boolean).slice(0, 8),
    recommendedCount: recommendedEntries.length,
    suppressedCount: suppressedItems.length,
    catalogGapCount: catalogGapReviews.length,
    evidenceMetadataCount: evidenceMetadata.length
  };
}

function appendCompactAuditFooter(lines, recommendation = {}) {
  const footer = auditFooterValues(recommendation);
  lines.push("", "Compact audit footer");
  lines.push(`- Trace IDs: ${footer.traceIds.join("; ") || "none"}`);
  lines.push(`- Source IDs: ${footer.sourceIds.join("; ") || "none"}`);
  lines.push(`- Source currency: ${footer.sourceCurrency.join("; ") || "no registry currency metadata matched the compact source list"}`);
  lines.push(`- Recommended item count: ${footer.recommendedCount}`);
  lines.push(`- Reviewer-only omitted: suppressed/lower-fit ${footer.suppressedCount}; staged catalog gaps ${footer.catalogGapCount}; evidence metadata rows ${footer.evidenceMetadataCount}.`);
  lines.push("- Full retrieval scores, tags, citations, raw guideline-module rows, suppressed candidates, and knowledge-pack review context are available only in Copy review audit.");
}

function reportEntryLabel(entry = {}) {
  const candidate = candidateFromEntry(entry);
  return entry.displayLabel
    || entry.label
    || entry.text
    || candidate.examLabel
    || candidate.maneuver
    || candidate.exam_id
    || "";
}

function startHereHighlights(recommendation = {}) {
  const history = recommendation.focusedHistoryQuestions || [];
  const coreExams = recommendation.corePhysicalExamManeuvers || recommendation.coreItems || [];
  const redFlags = recommendation.redFlagsAndEscalationCues || [];
  const tests = recommendation.initialTestsAndReferenceThresholds || [];
  const highlights = [];
  const add = (role, entry) => {
    const label = reportEntryLabel(entry);
    if (!label) return;
    const key = `${role}:${label.toLowerCase()}`;
    if (highlights.some((item) => item.key === key)) return;
    highlights.push({ key, role, entry, label });
  };

  const sourceHistory = history.find((entry) => /source|localiz|cough|dyspnea|dysuria|flank|wound|line|exposure|host/i.test(`${entry.displayLabel || ""} ${entry.text || ""} ${(entry.detail_prompts || []).join(" ")}`));
  const severityHistory = history.find((entry) => /severity|shock|perfusion|confusion|low urine|rapid worsening|timeline|fever/i.test(`${entry.displayLabel || ""} ${entry.text || ""}`));
  add("ask", sourceHistory || history[0]);
  if (severityHistory && severityHistory !== sourceHistory) add("ask", severityHistory);

  coreExams
    .filter((entry) => /work of breathing|lung|skin|wound|line|oropharynx|mouth|pulses|perfusion|mental|abdomen|thyroid|jvp|edema|heart|cva|neurologic|visual/i.test(reportEntryLabel(entry)))
    .slice(0, 5)
    .forEach((entry) => add("examine", entry));

  add("red flag", redFlags[0]);
  add("test/threshold", tests[0]);
  return highlights.slice(0, 8);
}

function appendStartHereHighlights(lines, recommendation = {}) {
  const highlights = startHereHighlights(recommendation);
  if (!highlights.length) {
    return;
  }
  lines.push("", "Start here / minimum bedside workup");
  highlights.forEach((highlight, index) => {
    const entry = highlight.entry || {};
    const candidate = candidateFromEntry(entry);
    lines.push(`${index + 1}. ${highlight.role}: ${highlight.label}`);
    appendDetail(lines, "Why", entry.reason || entry.rationale || entry.diagnosticPurpose || entry.displayDiagnosticTarget || candidate.diagnostic_target);
    appendDetail(lines, "Management change", entry.managementImplication || entry.displayManagement || candidate.result_changes_management || candidate.management_link);
    appendDetail(lines, "Evidence/LR", [
      formatEvidenceSource(candidate || entry),
      formatEvidenceLikelihood(candidate || entry),
      `tier ${candidate.evidence_tier || entry.evidence?.tier || "n/a"}`
    ].join("; "));
  });
}

export function formatConciseExamRecommendationReport(recommendation = {}) {
  const safetyChecks = recommendation.basicSafetyChecks || [];
  const historyQuestions = recommendation.focusedHistoryQuestions || [];
  const redFlags = recommendation.redFlagsAndEscalationCues || [];
  const testThresholds = recommendation.initialTestsAndReferenceThresholds || [];
  const managementFindings = recommendation.managementChangingFindings || [];
  const interpretationCautions = recommendation.limitationsAndInterpretationCautions || [];
  const evidenceMetadata = recommendation.evidenceAndLikelihoodMetadata || [];
  const catalogGapReviews = recommendation.catalogGapsNeedingReview || [];
  const coreItems = recommendation.corePhysicalExamManeuvers || recommendation.coreItems || [];
  const conditionalItems = recommendation.conditionalPhysicalExamManeuvers || recommendation.conditionalItems || [];
  const suppressedItems = recommendation.suppressedItems || [];
  const validatedIntentTrace = recommendation.validatedIntentTrace || [];
  const recommendationAuthorized = recommendation.finalRecommendationAuthorized !== false && validatedIntentTrace.length > 0;
  const lines = [
    "Validated Bedside Workup",
    `Validated intents: ${validatedIntentTrace.map((trace) => `${trace.intent_id} (${trace.label || "unlabeled"})`).join("; ") || "none"}`,
    `Final recommendation authorized: ${recommendationAuthorized ? "yes" : "no"}`,
    `Authorization reason: ${recommendation.authorizationReason || "Recommendations trace to selected validated clinical intent(s)."}`,
    `Warnings: ${(recommendation.warnings || []).join(" | ") || "none"}`,
    `Counts: safety ${safetyChecks.length}; history ${historyQuestions.length}; core exams ${coreItems.length}; conditional exams ${conditionalItems.length}; tests ${testThresholds.length}; red flags ${redFlags.length}; management findings ${managementFindings.length}; limitations ${interpretationCautions.length}; suppressed ${suppressedItems.length}; gaps ${catalogGapReviews.length}`,
    "Scope: This is the concise validated workup. Raw retrieval candidates, score/debug detail, and supporting module dumps are available only in Copy review audit.",
    "Evidence note: Item-level source, LR+/LR-, LR interpretation, feasibility, limitations, and traceability are included below when available."
  ];

  appendStartHereHighlights(lines, recommendation);
  appendSection(
    lines,
    "Baseline vitals / safety data",
    safetyChecks,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactRecommendationEntry : appendRecommendationEntry)(sectionLines, entry, index, "safety"),
    {
      maxItems: 3,
      detailItems: 1,
      preface: "Vitals and basic measurements are baseline clinical data; they are not physical exam maneuvers."
    }
  );
  appendSection(
    lines,
    "Focused history questions",
    historyQuestions,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactHistoryQuestion : appendHistoryQuestion)(sectionLines, entry, index),
    { maxItems: 6, detailItems: 2 }
  );
  appendSection(
    lines,
    "Core physical exam maneuvers",
    coreItems,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactRecommendationEntry : appendRecommendationEntry)(sectionLines, entry, index, "core exam"),
    { maxItems: 4, detailItems: 1 }
  );
  appendSection(
    lines,
    "Conditional exam add-ons",
    conditionalItems,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactRecommendationEntry : appendRecommendationEntry)(sectionLines, entry, index, "conditional exam"),
    { maxItems: 2, detailItems: 0 }
  );
  appendSection(
    lines,
    "Initial tests and reference thresholds",
    testThresholds,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactRecommendationEntry : appendRecommendationEntry)(sectionLines, entry, index, "test/threshold"),
    { maxItems: 4, detailItems: 1 }
  );
  appendSection(
    lines,
    "Red flags and escalation cues",
    redFlags,
    (sectionLines, entry, index, options) => (options.compact ? appendCompactRecommendationEntry : appendRecommendationEntry)(sectionLines, entry, index, "red flag"),
    { maxItems: 4, detailItems: 1 }
  );
  appendStructuredSummary(lines, "Management-changing findings", managementFindings, "management", 6);
  appendStructuredSummary(lines, "Limitations and interpretation cautions", interpretationCautions, "limitation", 4);

  appendCompactAuditFooter(lines, recommendation);
  return `${lines.join("\n")}\n`;
}

export function formatConciseClinicalWorkupReport({
  input = "Not specified",
  guidelineSetting = "n/a",
  examSetting = "n/a",
  builtAt = "",
  selectedIntents = [],
  recommendation = null,
  complaintMatched = false
} = {}) {
  const selected = Array.isArray(selectedIntents) ? selectedIntents : [];
  if (!selected.length) {
    return [
      "Unsupported Clinical Workup Gap",
      `Input: ${sanitizeExportText(input) || "unsupported concern not specified"}`,
      "Status: blocked - no validated clinical intent selected.",
      "Recommendations: none. Free text and retrieval/audit matches do not authorize bedside workup recommendations.",
      "Next step: log this as an unsupported concern or import a reviewed knowledge pack for expert validation."
    ].join("\n") + "\n";
  }

  const parts = [[
    "Unified Clinical Workup",
    `Input: ${sanitizeExportText(input) || "Not specified"}`,
    `Guideline setting: ${guidelineSetting || "n/a"}`,
    `Exam setting: ${examSetting || "n/a"}`,
    builtAt ? `Built: ${builtAt}` : "",
    `Selected validated intents: ${selected.map((intentRow) => `${intentRow.intent_id} (${intentRow.label})`).join("; ") || "none"}`,
    "Recommendation source: validated local clinical-intent registry, evidence catalog, guideline module rules, and active non-identifying modifiers.",
    "Reviewer audit: use Copy review audit for raw retrieval candidates, full guideline-module detail, suppressed scoring/debug traces, and knowledge-pack improvement context."
  ].filter(Boolean).join("\n")];

  if (recommendation) {
    parts.push(formatConciseExamRecommendationReport(recommendation).trim());
  } else if (complaintMatched) {
    parts.push([
      "Validated Bedside Workup",
      "No evidence-backed bedside recommendation object is currently built.",
      "Build clinical workup again to generate traceable safety checks, history questions, physical exam maneuvers, evidence/LR metadata, suppressed items, and gaps."
    ].join("\n"));
  }
  return `${parts.filter(Boolean).join("\n\n---\n\n")}\n`;
}
