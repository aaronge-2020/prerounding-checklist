import {
  hydratePhysicalExamItem,
  physicalExamCatalogHasId
} from "../vault/physical-exam-catalog.js";

export const WORKUP_CONTRIBUTION_SCHEMA = "workup_contribution_v1";
export const WORKUP_CHANGE_SET_SCHEMA = "workup_change_set_v1";
export const DEFAULT_CONTRIBUTION_REPOSITORY = "https://github.com/aaronge-2020/prerounding-checklist";

const sectionDefinitions = [
  ["history_questions", "history_question"],
  ["physical_exam_maneuvers", "physical_exam_maneuver"]
];

const allowedTopLevelFields = new Set([
  "schema",
  "schema_version",
  "title",
  "workup_id",
  "aliases",
  "triggers",
  "population",
  "applicability",
  "history_questions",
  "physical_exam_maneuvers",
  "sources",
  "references",
  "reviewer_notes",
  "review_status"
]);

const allowedCommonItemFields = new Set([
  "id",
  "item_id",
  "item_type",
  "label",
  "question",
  "prompt",
  "text",
  "action",
  "check",
  "finding",
  "disposition",
  "why_it_matters",
  "technique",
  "maneuver",
  "test_name",
  "test",
  "options",
  "answer_options",
  "when",
  "trigger",
  "when_to_ask",
  "ask_when",
  "when_to_perform",
  "include_when",
  "order_when",
  "diagnostic_purpose",
  "diagnostic_target",
  "interpretation",
  "result_changes_management",
  "management_implication",
  "management_change",
  "source_id",
  "source_ids",
  "sources",
  "tags",
  "review_status",
  "review_notes",
  "rationale",
  "exam_id",
  "examId",
  "linkedExamId",
  "custom_exam",
  "threshold_ids",
  "likelihood_ratio_note",
  "LR_note",
  "lr_note"
]);

const allowedSourceFields = new Set([
  "source_id",
  "citation",
  "preferred_citation",
  "url_or_doi",
  "url",
  "doi",
  "source_type",
  "date_accessed",
  "last_reviewed",
  "next_review_due",
  "review_owner",
  "currency_status"
]);

const itemTypeSet = new Set([
  "history_question",
  "physical_exam_maneuver"
]);

const unsafePropertyPattern = /^(?:raw[\s_-]*)?(?:(?:chart|patient|notes?|handoff|epic|mrn|dob|ssn|room|bed|address|phone|email|identifiers?)(?:[\s_-]*(?:text|context|info|name|id|number|date|of[\s_-]*birth|birthdate)s?)?|date[\s_-]*of[\s_-]*birth|birthdate)$/i;
const possiblePhiValuePattern = /\b(?:MRN|DOB|SSN|room|bed|address|phone|email)\b\s*[:#]|\b\d{3}[- ]?\d{2}[- ]?\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function cleanString(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

export function slugifyContributionId(value = "", fallback = "item") {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 96) || fallback;
}

export function stringArray(value) {
  return Array.from(new Set(asArray(value)
    .flatMap((entry) => typeof entry === "string" ? entry.split(/[;,]/) : [entry])
    .map((entry) => cleanString(entry))
    .filter(Boolean)));
}

function sourceIds(value) {
  if (Array.isArray(value)) return stringArray(value);
  if (typeof value === "string") return stringArray(value);
  if (value?.source_id) return [cleanString(value.source_id)];
  return [];
}

function firstString(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function normalizeSource(source = {}, index = 0) {
  const citation = firstString(source.citation, source.preferred_citation);
  const urlOrDoi = firstString(source.url_or_doi, source.url, source.doi);
  return {
    source_id: firstString(source.source_id, slugifyContributionId(citation || urlOrDoi, `source_${index + 1}`)),
    citation,
    url_or_doi: urlOrDoi,
    source_type: firstString(source.source_type, "guideline"),
    ...(source.date_accessed ? { date_accessed: cleanString(source.date_accessed) } : {}),
    ...(source.last_reviewed ? { last_reviewed: cleanString(source.last_reviewed) } : {}),
    ...(source.next_review_due ? { next_review_due: cleanString(source.next_review_due) } : {}),
    ...(source.review_owner ? { review_owner: cleanString(source.review_owner) } : {}),
    ...(source.currency_status ? { currency_status: cleanString(source.currency_status) } : {})
  };
}

function normalizeContributionItem(item = {}, sectionKey = "", expectedType = "", index = 0, options = {}) {
  const rawType = cleanString(item.item_type || expectedType);
  const label = firstString(item.label, item.question, item.prompt, item.test_name, item.test, item.action, item.check, item.finding, item.disposition, item.technique, item.maneuver, item.text, `${expectedType}_${index + 1}`);
  const normalized = {
    id: firstString(item.id, item.item_id, slugifyContributionId(label, `${sectionKey}_${index + 1}`)),
    item_type: rawType,
    label,
    tags: stringArray(item.tags),
    source_ids: sourceIds(item.source_ids).concat(sourceIds(item.source_id), sourceIds(item.sources)),
    review_status: cleanString(item.review_status || "pending_review")
  };
  if (item.review_notes) normalized.review_notes = cleanString(item.review_notes);
  const rationaleAlias = firstString(item.rationale, item.why_it_matters);
  if (rationaleAlias) normalized.rationale = rationaleAlias;
  const actionAlias = firstString(item.action, item.check, item.finding, item.disposition);
  if (actionAlias) normalized.action = actionAlias;
  if (item.diagnostic_target) normalized.diagnostic_target = cleanString(item.diagnostic_target);
  if (item.result_changes_management || item.management_change || item.management_implication) {
    normalized.result_changes_management = firstString(item.result_changes_management, item.management_change, item.management_implication);
  }
  if (item.likelihood_ratio_note || item.LR_note || item.lr_note) {
    normalized.likelihood_ratio_note = firstString(item.likelihood_ratio_note, item.LR_note, item.lr_note);
  }

  if (rawType === "history_question") {
    normalized.question = firstString(item.question, item.prompt, item.text, label);
    normalized.answer_options = stringArray(item.answer_options || item.options || ["Yes", "No", "Unknown"]);
    normalized.ask_when = firstString(item.ask_when, item.when_to_ask, item.when, item.trigger, "When this workup is clinically relevant.");
    normalized.diagnostic_purpose = firstString(item.diagnostic_purpose, item.diagnostic_target);
    normalized.result_changes_management = firstString(normalized.result_changes_management, item.result_changes_management);
  }

  if (rawType === "physical_exam_maneuver") {
    const explicitExamLabel = firstString(item.label, item.action, item.technique, item.maneuver, item.text);
    normalized.exam_id = firstString(item.exam_id, item.examId, item.linkedExamId);
    normalized.custom_exam = Boolean(item.custom_exam);
    normalized.include_when = firstString(item.include_when, item.when_to_perform, item.when, item.trigger, "When this workup is clinically relevant.");
    normalized.diagnostic_target = firstString(item.diagnostic_target, item.diagnostic_purpose);
    normalized.result_changes_management = firstString(normalized.result_changes_management, item.management_change, item.management_implication);
    const hydrated = hydratePhysicalExamItem(explicitExamLabel ? normalized : { ...normalized, label: "" }, options.examCatalog || null);
    Object.assign(normalized, hydrated);
  }

  normalized.source_ids = Array.from(new Set(normalized.source_ids.filter(Boolean)));
  return normalized;
}

export function extractJsonCandidateFromText(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return "";
}

export function normalizeWorkupContributionDraft(input = {}, options = {}) {
  const draft = typeof input === "string"
    ? JSON.parse(extractJsonCandidateFromText(input) || input)
    : input;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("Contribution draft must be a JSON object.");
  }
  const normalized = {
    schema: WORKUP_CONTRIBUTION_SCHEMA,
    title: firstString(draft.title, draft.label, draft.workup_title),
    workup_id: firstString(draft.workup_id, draft.id, slugifyContributionId(draft.title || draft.label || "new_workup_v1")),
    aliases: stringArray(draft.aliases),
    triggers: stringArray(draft.triggers),
    population: firstString(draft.population, draft.applicability?.age_group),
    applicability: draft.applicability && typeof draft.applicability === "object" ? { ...draft.applicability } : {},
    sources: asArray(draft.sources || draft.references).map((source, index) => normalizeSource(source, index)),
    reviewer_notes: cleanString(draft.reviewer_notes),
    review_status: "pending_review"
  };
  for (const [sectionKey, expectedType] of sectionDefinitions) {
    normalized[sectionKey] = asArray(draft[sectionKey]).map((item, index) => normalizeContributionItem(item, sectionKey, expectedType, index, options));
  }
  return normalized;
}

function visitValues(value, visitor, path = []) {
  visitor(value, path);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitValues(entry, visitor, path.concat(String(index))));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    visitValues(entry, visitor, path.concat(key));
  }
}

function collectUnsupportedFields(draft = {}, issues = []) {
  for (const key of Object.keys(draft || {})) {
    if (!allowedTopLevelFields.has(key)) issues.push(`unsupported field: ${key}`);
  }
  for (const [sectionKey] of sectionDefinitions) {
    asArray(draft[sectionKey]).forEach((item, index) => {
      for (const key of Object.keys(item || {})) {
        if (!allowedCommonItemFields.has(key)) issues.push(`unsupported field: ${sectionKey}[${index}].${key}`);
      }
    });
  }
  asArray(draft.sources || draft.references).forEach((source, index) => {
    for (const key of Object.keys(source || {})) {
      if (!allowedSourceFields.has(key)) issues.push(`unsupported field: sources[${index}].${key}`);
    }
  });
}

function collectPhiIssues(draft = {}, issues = []) {
  visitValues(draft, (value, path) => {
    const key = path[path.length - 1] || "";
    if (unsafePropertyPattern.test(key)) issues.push(`possible PHI/raw chart text detected at ${path.join(".")}`);
    if (typeof value === "string" && possiblePhiValuePattern.test(value)) {
      issues.push(`possible PHI/raw chart text detected at ${path.join(".") || "draft"}`);
    }
  });
}

export function validateWorkupContributionDraft(input = {}, options = {}) {
  const issues = [];
  let rawDraft = input;
  if (typeof input === "string") {
    const jsonCandidate = extractJsonCandidateFromText(input);
    if (!jsonCandidate) {
      return {
        ok: false,
        issues: ["OpenEvidence-style prose pasted where JSON is expected. Paste a workup_contribution_v1 JSON object."],
        draft: null
      };
    }
    try {
      rawDraft = JSON.parse(jsonCandidate);
    } catch (error) {
      return {
        ok: false,
        issues: [`invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`],
        draft: null
      };
    }
  }
  if (!rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) {
    return { ok: false, issues: ["Contribution draft must be a JSON object."], draft: null };
  }
  collectUnsupportedFields(rawDraft, issues);
  collectPhiIssues(rawDraft, issues);
  if (!rawDraft.schema) {
    issues.push("missing required field: schema");
  } else if (rawDraft.schema !== WORKUP_CONTRIBUTION_SCHEMA) {
    issues.push(`schema must be ${WORKUP_CONTRIBUTION_SCHEMA}`);
  }

  let draft = null;
  try {
    draft = normalizeWorkupContributionDraft(rawDraft, options);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Contribution draft could not be normalized.");
  }
  if (!draft) return { ok: false, issues, draft: null };

  if (!draft.title) issues.push("missing required field: title");
  if (!draft.sources.length) issues.push("missing required field: sources");
  for (const [index, source] of draft.sources.entries()) {
    if (!source.citation) issues.push(`source missing citation: sources[${index}]`);
    if (!source.url_or_doi) issues.push(`source missing URL or DOI: sources[${index}]`);
  }

  const sourceIdSet = new Set(draft.sources.map((source) => source.source_id));
  let itemCount = 0;
  for (const [sectionKey, expectedType] of sectionDefinitions) {
    const seen = new Set();
    for (const [index, item] of draft[sectionKey].entries()) {
      itemCount += 1;
      if (seen.has(item.id)) issues.push(`duplicate item ID within section: ${sectionKey}.${item.id}`);
      seen.add(item.id);
      if (!itemTypeSet.has(item.item_type)) issues.push(`invalid item type: ${sectionKey}[${index}].${item.item_type || "missing"}`);
      if (item.item_type !== expectedType) {
        issues.push(`invalid item type: ${sectionKey}[${index}] must be ${expectedType}`);
      }
      for (const sourceId of item.source_ids || []) {
        if (!sourceIdSet.has(sourceId)) issues.push(`${sectionKey}.${item.id} references unknown source_id: ${sourceId}`);
      }
      if (item.item_type === "history_question" && !/\?$/.test(cleanString(item.question))) {
        issues.push(`${sectionKey}.${item.id} history question must end in ?`);
      }
      if (item.item_type === "physical_exam_maneuver") {
        if (!item.custom_exam && !item.exam_id) issues.push(`${sectionKey}.${item.id} physical exam item missing exam_id`);
        if (!item.custom_exam && item.exam_id && options.examCatalog && !physicalExamCatalogHasId(options.examCatalog, item.exam_id)) {
          issues.push(`${sectionKey}.${item.id} unknown exam_id: ${item.exam_id}`);
        }
        if (item.custom_exam && item.exam_id) issues.push(`${sectionKey}.${item.id} custom_exam should not also claim a catalog exam_id`);
      }
    }
  }
  if (!itemCount) issues.push("missing workup items: add at least one history or exam item");
  return {
    ok: issues.length === 0,
    issues,
    draft
  };
}

function contributionItemSourceIds(item = {}) {
  return Array.isArray(item.source_ids) ? item.source_ids.filter(Boolean) : [];
}

function historyQuestionModuleItem(item = {}) {
  return {
    id: item.id,
    item_type: "history_question",
    label: item.label,
    text: item.question || item.label,
    options: item.answer_options?.length ? item.answer_options : ["Yes", "No", "Unknown"],
    when_to_ask: item.ask_when || "",
    diagnostic_purpose: item.diagnostic_purpose || "",
    management_implication: item.result_changes_management || "",
    tags: item.tags || [],
    source_ids: contributionItemSourceIds(item)
  };
}

function physicalExamModuleItem(item = {}) {
  return {
    id: item.id,
    item_type: "physical_exam_maneuver",
    label: item.label,
    technique: item.technique || item.label,
    action: item.action || item.label,
    when_to_perform: item.include_when || "",
    diagnostic_target: item.diagnostic_target || "",
    management_change: item.result_changes_management || "",
    exam_id: item.exam_id || "",
    custom_exam: Boolean(item.custom_exam),
    tags: item.tags || [],
    source_ids: contributionItemSourceIds(item)
  };
}

/**
 * Converts a validated workup_contribution_v1 draft into the app's internal
 * complaint-module shape so it can be used immediately in the running app
 * (local catalog injection) and/or written to the Supabase workup tables.
 */
export function moduleFromWorkupContributionDraft(draft = {}, { status = "draft" } = {}) {
  return {
    id: draft.workup_id,
    schema_version: "medical_knowledge_database_v1",
    label: draft.title,
    title: draft.title,
    complaint_group: "",
    version: "v1_local_draft",
    status,
    population: draft.applicability || {},
    triggers: draft.triggers || [],
    aliases: draft.aliases || [],
    requiredQuestions: (draft.history_questions || []).map(historyQuestionModuleItem),
    conditionalQuestions: [],
    requiredExam: (draft.physical_exam_maneuvers || []).map(physicalExamModuleItem),
    conditionalExam: [],
    source_ids: (draft.sources || []).map((source) => source.source_id).filter(Boolean)
  };
}

export function sourceRowsFromWorkupContributionDraft(draft = {}) {
  return (draft.sources || []).map((source) => ({
    id: source.source_id,
    source_id: source.source_id,
    title: source.citation || source.source_id,
    source_type: source.source_type || "guideline",
    url: source.url_or_doi || "",
    citation: source.citation || "",
    payload: source
  }));
}

export function prepareGithubIssueBody(draft, validation = { ok: true, issues: [] }) {
  const normalized = validation?.draft || normalizeWorkupContributionDraft(draft);
  return [
    "## Workup Contribution Draft",
    "",
    `Title: ${normalized.title}`,
    `Schema: ${WORKUP_CONTRIBUTION_SCHEMA}`,
    "Review status: pending_review",
    "",
    "## Local Validation",
    validation.ok ? "- Passed local browser validation." : validation.issues.map((issue) => `- ${issue}`).join("\n"),
    "",
    "## Privacy Attestation",
    "- I did not include raw chart text, patient identifiers, MRNs, exact dates, room numbers, addresses, contact information, or proprietary guideline text.",
    "- This is a draft contribution for clinical review, not reviewed clinical guidance.",
    "",
    "## JSON",
    "",
    "```json",
    JSON.stringify(normalized, null, 2),
    "```"
  ].join("\n");
}

export function buildGithubIssueUrl({
  draft,
  validation = { ok: true, issues: [] },
  repository = DEFAULT_CONTRIBUTION_REPOSITORY
} = {}) {
  const base = `${String(repository || DEFAULT_CONTRIBUTION_REPOSITORY).replace(/\.git$/, "").replace(/\/$/, "")}/issues/new`;
  const title = `Workup contribution: ${validation?.draft?.title || draft?.title || "draft workup"}`;
  const params = new URLSearchParams({
    title,
    labels: "workup-contribution,pending-review",
    body: prepareGithubIssueBody(draft, validation)
  });
  return `${base}?${params.toString()}`;
}
