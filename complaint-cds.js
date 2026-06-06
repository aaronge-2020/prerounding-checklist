import { complaintModules, complaintSourceRegistry } from "./medical-knowledge-db.js";

export const complaintCdsSchemaVersion = "complaint-cds-artifact-v1";
export { complaintModules, complaintSourceRegistry };

const plannedComplaintModules = [
  { id: "shortness_of_breath_v1", label: "Shortness of breath", status: "planned" },
  { id: "abdominal_pain_v1", label: "Abdominal pain", status: "planned" },
  { id: "headache_neuro_v1", label: "Headache / acute neurologic complaint", status: "planned" }
];

export function normalizeComplaintText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9+%/.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contextContainsTerm(context, term) {
  const normalized = normalizeComplaintText(term);
  if (!normalized) {
    return false;
  }
  if (!/\s/.test(normalized)) {
    return new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(context);
  }
  return context.includes(normalized);
}

function answerMatches(answerValue, expected = "yes") {
  const answer = String(answerValue || "unknown").toLowerCase();
  if (Array.isArray(expected)) {
    return expected.map((item) => String(item).toLowerCase()).includes(answer);
  }
  return answer === String(expected || "yes").toLowerCase();
}

function answerConditionMatches(answers, condition) {
  if (typeof condition === "string") {
    return answerMatches(answers[condition], "yes");
  }
  return answerMatches(answers[condition.id], condition.value || "yes");
}

export function evaluateComplaintCondition(when, contextText = "", answers = {}) {
  if (!when) {
    return true;
  }
  const context = normalizeComplaintText(contextText);
  let matched = false;

  if (when.termsAny?.length) {
    const ok = when.termsAny.some((term) => contextContainsTerm(context, term));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.termsAll?.length) {
    const ok = when.termsAll.every((term) => contextContainsTerm(context, term));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.answersAny?.length) {
    const ok = when.answersAny.some((condition) => answerConditionMatches(answers, condition));
    if (!ok && !matched) {
      return false;
    }
    matched = matched || ok;
  }
  if (when.answersAll?.length) {
    const ok = when.answersAll.every((condition) => answerConditionMatches(answers, condition));
    if (!ok) {
      return false;
    }
    matched = true;
  }
  if (when.not && evaluateComplaintCondition(when.not, context, answers)) {
    return false;
  }
  return matched || Boolean(when.not);
}

function moduleScore(module, context) {
  const triggerScore = module.triggers.reduce((score, trigger) => {
    if (!contextContainsTerm(context, trigger)) {
      return score;
    }
    const normalizedTrigger = normalizeComplaintText(trigger);
    const baseScore = trigger.includes(" ") ? 18 : (String(trigger).trim().length <= 5 ? 40 : 24);
    const leadingDiagnosisBonus = context.startsWith(normalizedTrigger) ? 20 : 0;
    return score + baseScore + leadingDiagnosisBonus;
  }, 0);
  const labelScore = contextContainsTerm(context, module.label) ? 12 : 0;
  return triggerScore + labelScore;
}

export function selectComplaintModule(inputText, modules = complaintModules) {
  const context = normalizeComplaintText(inputText);
  if (!context) {
    return null;
  }
  const scored = modules
    .map((module) => ({ module, score: moduleScore(module, context) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.module.label.localeCompare(b.module.label));
  return scored[0]?.module || null;
}

function withEvaluation(item, contextText, answers, extra = {}) {
  return {
    ...item,
    triggered: item.when ? evaluateComplaintCondition(item.when, contextText, answers) : Boolean(extra.defaultTriggered),
    included: item.when ? evaluateComplaintCondition(item.when, contextText, answers) : true
  };
}

function includeItems(items = [], contextText, answers) {
  return items
    .map((item) => withEvaluation(item, contextText, answers))
    .filter((item) => item.included);
}

function evaluateRedFlags(items = [], contextText, answers) {
  return items.map((item) => withEvaluation(item, contextText, answers));
}

function uniqueSourceIds(items = []) {
  return Array.from(new Set(items.map((item) => item.source?.source_id).filter(Boolean)));
}

export function evaluateComplaintCds(inputText = "", answers = {}, options = {}) {
  const module = options.module || selectComplaintModule(inputText, options.modules || complaintModules);
  const sources = options.sources || complaintSourceRegistry;
  if (!module) {
    return {
      matched: false,
      inputText,
      modules: options.modules || complaintModules,
      plannedModules: plannedComplaintModules,
      message: "No complaint module matched in the installed medical knowledge database."
    };
  }

  const requiredQuestions = includeItems(module.requiredQuestions, inputText, answers);
  const conditionalQuestions = includeItems(module.conditionalQuestions, inputText, answers);
  const requiredExam = includeItems(module.requiredExam, inputText, answers);
  const conditionalExam = includeItems(module.conditionalExam, inputText, answers);
  const initialTests = includeItems(module.initialTests, inputText, answers);
  const dispositionRules = includeItems(module.dispositionRules, inputText, answers);
  const redFlags = evaluateRedFlags(module.redFlags, inputText, answers);
  const triggeredRedFlags = redFlags.filter((item) => item.triggered);
  const allIncluded = [
    ...requiredQuestions,
    ...conditionalQuestions,
    ...requiredExam,
    ...conditionalExam,
    ...initialTests,
    ...dispositionRules,
    ...redFlags,
    ...(module.differentialBuckets || [])
  ];
  const sourceIds = uniqueSourceIds(allIncluded);

  return {
    matched: true,
    inputText,
    module,
    answers,
    redFlags,
    triggeredRedFlags,
    requiredQuestions,
    conditionalQuestions,
    requiredExam,
    conditionalExam,
    focusedExam: [...requiredExam, ...conditionalExam],
    initialTests,
    dispositionRules,
    differentialBuckets: module.differentialBuckets || [],
    sourceIds,
    sources: sourceIds.map((id) => sources.find((sourceRow) => sourceRow.id === id)).filter(Boolean),
    plannedModules: plannedComplaintModules
  };
}

export function validateComplaintModules(modules = complaintModules, sources = complaintSourceRegistry) {
  const issues = [];
  const moduleIds = new Set();
  const sourceIds = new Set(sources.map((row) => row.id));
  const itemGroups = ["redFlags", "requiredQuestions", "conditionalQuestions", "requiredExam", "conditionalExam", "initialTests", "dispositionRules", "differentialBuckets"];

  modules.forEach((module) => {
    if (!module.id || moduleIds.has(module.id)) {
      issues.push(`Duplicate or missing module id: ${module.id || "missing"}`);
    }
    moduleIds.add(module.id);
    for (const field of ["schema_version", "label", "version", "status", "triggers"]) {
      if (!module[field] || (Array.isArray(module[field]) && !module[field].length)) {
        issues.push(`${module.id} missing ${field}`);
      }
    }
    itemGroups.forEach((group) => {
      (module[group] || []).forEach((item) => {
        if (!item.id || !item.label) {
          issues.push(`${module.id}.${group} has item missing id or label`);
        }
        if (!item.source?.source_id || !sourceIds.has(item.source.source_id)) {
          issues.push(`${module.id}.${group}.${item.id} has invalid source`);
        }
        for (const field of ["source_section", "version_date", "last_reviewed", "clinical_owner"]) {
          if (!item.source?.[field]) {
            issues.push(`${module.id}.${group}.${item.id} missing source.${field}`);
          }
        }
      });
    });
  });

  return { ok: issues.length === 0, issues };
}

function reportItems(title, items, lines, formatter = (item) => item.label) {
  lines.push("", title);
  if (!items.length) {
    lines.push("- None");
    return;
  }
  items.forEach((item) => {
    lines.push(`- ${formatter(item)} [${item.source?.source_id || "source"}]`);
  });
}

export function formatComplaintCdsReport(result) {
  if (!result?.matched) {
    return `Guideline Complaint CDS\n${result?.message || "No module matched."}\n`;
  }
  const lines = [
    "Guideline Complaint CDS",
    `Input: ${result.inputText || "Not specified"}`,
    `Module: ${result.module.label} (${result.module.id}, v${result.module.version})`,
    `Triggered red flags: ${result.triggeredRedFlags.length}`
  ];
  reportItems("Red flags and escalation cues", result.redFlags, lines, (item) => `${item.triggered ? "TRIGGERED: " : "Screen: "}${item.label}${item.action ? ` - ${item.action}` : ""}`);
  reportItems("Required history", result.requiredQuestions, lines);
  reportItems("Conditional history", result.conditionalQuestions, lines);
  reportItems("Focused physical exam", result.focusedExam, lines);
  reportItems("Immediate tests / next steps", result.initialTests, lines);
  reportItems("Disposition cues", result.dispositionRules, lines);
  reportItems("Differential buckets", result.differentialBuckets, lines);
  lines.push("", "Sources");
  result.sources.forEach((sourceRow) => {
    lines.push(`- ${sourceRow.id}: ${sourceRow.citation}; ${sourceRow.url}`);
  });
  return `${lines.join("\n")}\n`;
}
