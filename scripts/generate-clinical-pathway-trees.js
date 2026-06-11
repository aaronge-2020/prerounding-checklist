import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const auditDate = "2026-06-11";
const moduleRoot = "medical-knowledge/complaint-modules";
const sourceRegistryPath = "medical-knowledge/source-registry.json";

const requiredPathwayDomains = [
  "initial assessment",
  "red flags/instability",
  "diagnostic confirmation",
  "mimics/exclusions",
  "severity/risk stratification",
  "first-line management",
  "escalation/emergency actions",
  "contraindications/special populations",
  "monitoring/reassessment",
  "de-escalation/stopping criteria",
  "disposition",
  "follow-up",
  "safety-netting"
];

const contextDomains = [
  "symptoms",
  "exam",
  "vitals",
  "labs",
  "imaging_results",
  "medications",
  "comorbidities",
  "demographics",
  "pregnancy_status",
  "workup_findings"
];

const coreContextData = [
  "presenting symptom or diagnosis trigger",
  "symptom onset, duration, trajectory, and current severity",
  "red-flag symptoms and instability screen",
  "focused exam findings relevant to the active workup",
  "current vital signs: BP, HR, RR, oxygen saturation, temperature, mental status, and weight when dosing or fluid decisions depend on it",
  "initial laboratory results and local reference ranges for this workup when ordered or clinically indicated",
  "imaging, ECG, microbiology, pathology, or procedure results when they are part of confirmation or exclusion",
  "current medications, recent changes, allergies, adherence, and treatment contraindications",
  "major comorbidities and risk modifiers, including renal/hepatic/cardiac disease, immunocompromise, diabetes, frailty, and prior relevant disease",
  "demographics and applicability context: age band, sex/reproductive context, pediatric versus adult pathway fit, and pregnancy/postpartum/lactation status when relevant",
  "workup findings: diagnostic confirmation status, mimics considered, severity/risk category, treatment response, and disposition constraints"
];

const genericSourceIds = ["AHRQ_CALIBRATE_DX"];
const allEvidenceGroups = [
  "redFlags",
  "initialTests",
  "differentialBuckets",
  "dispositionRules",
  "decisionTrees",
  "treatmentOptions",
  "safetyChecks",
  "requiredQuestions",
  "conditionalQuestions",
  "requiredExam",
  "conditionalExam"
];
const thresholdPattern = /(?:>=|<=|>|<|=)\s*-?\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:mg\/dL|mmol\/L|mEq\/L|mIU\/L|ng\/mL|pg\/mL|mm Hg|mL\/kg|hours?|weeks?|cm|mm|%|ULN)\b|\bA1c\b|\bpH\b|\bbicarbonate\b|\banion gap\b|\bosmolality\b|\blactate\b|\bMAP\b/gi;
const shallowGeneratedPrefixPattern = /^(?:use the high-risk or confirmed-pathway management option when criteria are met|use the lower-risk, outpatient, supportive, or safety-net pathway only when the source-backed criteria are satisfied|stabilize or escalate before routine treatment when danger criteria are present|screen for immediate danger or disposition-changing findings before routine workup|order focused first-line studies and interpret them in sequence|apply source-backed decision steps)\s*:\s*/i;
const shallowGeneratedItemPattern = /\b(?:use the high-risk or confirmed-pathway management option when criteria are met|use the lower-risk, outpatient, supportive, or safety-net pathway only when the source-backed criteria are satisfied|first-line management only|local policy and patient-specific clinician review flagged)\b/i;

function complaintModuleFiles(dir = moduleRoot) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return complaintModuleFiles(fullPath);
    return entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

function unique(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function shortText(value = "", max = 180) {
  const clean = cleanText(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/[;:,.\s]+$/g, "")}...`;
}

function itemLabel(item = {}) {
  return cleanText(String(item.label || item.text || item.action || item.management_change || item.diagnostic_target || item.id || "").replace(shallowGeneratedPrefixPattern, ""));
}

function itemAction(item = {}, fallback = "") {
  return cleanText(item.action || item.management_change || item.rationale || itemLabel(item) || fallback);
}

function itemSourceIds(item = {}) {
  return unique([
    item.source_id,
    item.source?.source_id,
    ...(Array.isArray(item.source_ids) ? item.source_ids : []),
    ...(Array.isArray(item.sourceIds) ? item.sourceIds : [])
  ]);
}

function sourceIdsForItems(items = [], fallback = []) {
  return unique([...items.flatMap((item) => itemSourceIds(item)), ...fallback, ...genericSourceIds]);
}

function sourceRowsForTree(sourceIds = [], sourceById = new Map()) {
  return unique(sourceIds).map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) {
      return {
        source_id: sourceId,
        title: sourceId,
        url: "",
        url_or_doi: "",
        year: "",
        access_date: auditDate,
        date_accessed: auditDate,
        citation_text: sourceId,
        review_status: "needs_source_resolution"
      };
    }
    return {
      source_id: source.id,
      title: source.title || source.citation || source.id,
      url: source.url || source.url_or_doi || "",
      url_or_doi: source.url_or_doi || source.url || "",
      year: source.year || source.version || "",
      access_date: source.date_accessed || auditDate,
      date_accessed: source.date_accessed || auditDate,
      citation_text: source.citation_text || source.citation || source.title || source.id,
      review_status: source.review_status || source.currency_status || "reviewed_current_for_scope"
    };
  });
}

function firstItems(module, group, count, fallbackGroups = []) {
  const direct = Array.isArray(module[group]) ? module[group] : [];
  const fallback = fallbackGroups.flatMap((name) => Array.isArray(module[name]) ? module[name] : []);
  const items = uniqueById([...direct, ...fallback]);
  const clinicalItems = items.filter((item) => !shallowGeneratedItemPattern.test(`${item.label || ""} ${item.action || ""} ${item.management_change || ""}`));
  return (clinicalItems.length >= Math.min(count, items.length) ? clinicalItems : items).slice(0, count);
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item, index) => {
    const key = item?.id || `${itemLabel(item)}:${index}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listLabels(items = [], maxItems = 4) {
  return items.slice(0, maxItems).map((item) => itemLabel(item)).filter(Boolean);
}

function criteria(ruleId, description, evaluableFrom, sourceIds, extra = {}) {
  return {
    rule_id: ruleId,
    source: "criteria",
    description: cleanText(description),
    evaluable_from: unique(evaluableFrom),
    source_ids: unique(sourceIds),
    ...extra
  };
}

function node({
  id,
  type = "action",
  label,
  edgeLabel = "",
  sourceIds = [],
  criteria: rule,
  action = "",
  endpointType = "",
  missingDataNeeded = [],
  reviewNeededReason = "",
  fallbackState = "",
  children = []
}) {
  const entry = {
    id,
    type,
    label: shortText(label || id, 220),
    edgeLabel: cleanText(edgeLabel),
    source_ids: unique(sourceIds),
    criteria: rule || criteria(`${id}_rule`, `Traverse ${id} when its edge criteria are met.`, coreContextData, sourceIds),
    action: cleanText(action || label || id),
    children
  };
  if (endpointType) entry.endpoint_type = endpointType;
  if (missingDataNeeded.length) entry.missing_data_needed = unique(missingDataNeeded);
  if (reviewNeededReason) entry.review_needed_reason = cleanText(reviewNeededReason);
  if (fallbackState) entry.fallbackState = fallbackState;
  return entry;
}

function endpoint(args) {
  return node({ ...args, type: "endpoint", children: [] });
}

function decision(args) {
  return node({ ...args, type: "decision" });
}

function actionNode(args) {
  return node({ ...args, type: "action" });
}

function chainEvidenceSteps(prefix, groupLabel, items, sourceIds, nextNode, edgeLabel = "Next step after this cited result is addressed") {
  let child = nextNode;
  items.slice().reverse().forEach((item, reverseIndex) => {
    const index = items.length - reverseIndex;
    const itemSources = sourceIdsForItems([item], sourceIds);
    child = actionNode({
      id: `${prefix}_${index}`,
      label: `${groupLabel} ${index}: ${shortText(itemLabel(item), 160)}`,
      edgeLabel,
      sourceIds: itemSources,
      criteria: criteria(
        `${prefix}_${index}_criteria`,
        `Complete or interpret this ${groupLabel.toLowerCase()} step before moving further down the pathway.`,
        ["labs", "imaging_results", "workup_findings", "medications", "comorbidities"],
        itemSources,
        { structured_rules: [{ source: "workup_findings", operator: "documented", field: item.id || itemLabel(item) }] }
      ),
      action: itemAction(item, itemLabel(item)),
      children: [child]
    });
  });
  return child;
}

function buildMonitoringBranch(prefix, module, sourceIds, options = {}) {
  const label = module.label || module.id;
  const monitoringSources = unique([...sourceIds, ...genericSourceIds]);
  const safetyEndpoint = endpoint({
    id: `${prefix}_safety_net_endpoint`,
    label: "Safety-net: return urgently for deterioration or red flags",
    edgeLabel: "After follow-up plan is set",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_safety_net_criteria`,
      "Terminal safety-net endpoint after outpatient or lower-acuity disposition is selected.",
      ["symptoms", "vitals", "workup_findings", "patient_preferences", "access_to_care"],
      monitoringSources
    ),
    action: `Give ${label}-specific safety-net instructions: seek urgent care for worsening symptoms, new instability, inability to complete treatment or monitoring, or any red flag listed in this pathway.`,
    endpointType: "safety_net_instruction"
  });

  const outpatientFollowup = actionNode({
    id: `${prefix}_outpatient_followup`,
    label: "Arrange follow-up and result ownership",
    edgeLabel: "Outpatient follow-up is safe and feasible",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_outpatient_followup_criteria`,
      "Use this branch only when the patient is stable, diagnostic uncertainty is bounded, treatment can be completed safely, and result follow-up is assigned.",
      ["vitals", "workup_findings", "medications", "comorbidities", "follow_up_access"],
      monitoringSources
    ),
    action: `Assign follow-up for pending tests, treatment response, medication safety, and recurrence precautions for ${label}.`,
    children: [safetyEndpoint]
  });

  const dispositionDecision = decision({
    id: `${prefix}_disposition_decision`,
    label: "Choose disposition based on stability and monitoring need",
    edgeLabel: "Response and stopping criteria reviewed",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_disposition_decision_criteria`,
      "Route disposition after reassessment documents stability, diagnostic certainty, treatment response, monitoring capacity, and patient-specific constraints.",
      ["vitals", "workup_findings", "comorbidities", "medications", "access_to_care"],
      monitoringSources
    ),
    action: "Choose monitored, urgent specialty, or outpatient disposition using the active pathway branch.",
    children: [
      endpoint({
        id: `${prefix}_monitored_disposition_endpoint`,
        label: "Disposition: monitored setting or urgent specialist handoff",
        edgeLabel: "Instability, high-acuity monitoring, procedure, or serial labs needed",
        sourceIds: monitoringSources,
        criteria: criteria(
          `${prefix}_monitored_disposition_criteria`,
          "Terminal disposition when physiology, treatment intensity, procedure need, or serial reassessment cannot be handled safely outpatient.",
          ["vitals", "labs", "imaging_results", "medications", "comorbidities", "workup_findings"],
          monitoringSources
        ),
        action: `Use monitored care, ED transfer, admission, or urgent specialty handoff for ${label} when high-acuity criteria remain present or safe outpatient monitoring is not available.`,
        endpointType: "escalation_disposition"
      }),
      outpatientFollowup
    ]
  });

  const ongoingCare = actionNode({
    id: `${prefix}_ongoing_care_plan`,
    label: "Continue care when stopping criteria are not met",
    edgeLabel: "Improving but treatment or diagnostic follow-up remains active",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_ongoing_care_criteria`,
      "Use when the patient is improving but needs a defined treatment duration, repeat test, or specialty follow-up before stopping or de-escalating.",
      ["workup_findings", "labs", "imaging_results", "medications", "follow_up_access"],
      monitoringSources
    ),
    action: `Continue the ${label} plan with a named reassessment interval, owner for pending data, and criteria for escalation if the course changes.`,
    children: [dispositionDecision]
  });

  const deescalationDecision = decision({
    id: `${prefix}_deescalation_stopping_decision`,
    label: "Can treatment be de-escalated or stopped?",
    edgeLabel: "Clinical course improving",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_deescalation_decision_criteria`,
      "Evaluate whether objective response, diagnostic certainty, adverse-effect risk, and guideline stopping criteria allow de-escalation or stopping.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"],
      monitoringSources
    ),
    action: "Use objective response and the cited pathway to stop, narrow, taper, or continue treatment.",
    children: [
      endpoint({
        id: `${prefix}_stop_or_deescalate_endpoint`,
        label: "Stop, narrow, taper, or de-escalate when criteria are met",
        edgeLabel: "Stopping/de-escalation criteria met and no unresolved danger features",
        sourceIds: monitoringSources,
        criteria: criteria(
          `${prefix}_stop_or_deescalate_criteria`,
          "Terminal endpoint when response and cited stopping criteria support de-escalation, tapering, narrowing, or stopping.",
          ["workup_findings", "labs", "imaging_results", "medications", "adverse_effects"],
          monitoringSources
        ),
        action: `De-escalate ${label} management only when the diagnosis, response, treatment duration, adverse effects, and follow-up owner are documented.`,
        endpointType: "deescalation_stopping"
      }),
      ongoingCare
    ]
  });

  const improvingAction = actionNode({
    id: `${prefix}_improving_response`,
    label: "Document improving response and residual risk",
    edgeLabel: "Symptoms, vitals, and objective data are improving",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_improving_response_criteria`,
      "Continue only when the recorded course shows improvement and no new instability or contradiction.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"],
      monitoringSources
    ),
    action: "Record what improved, what remains abnormal, and what data are still pending before choosing de-escalation or disposition.",
    children: [deescalationDecision]
  });

  const responseDecision = decision({
    id: `${prefix}_response_decision`,
    label: "Reassess response, adverse effects, and diagnostic certainty",
    edgeLabel: "Treatment started or diagnostic plan active",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_response_decision_criteria`,
      "Select the branch matching reassessment data: missing, worsening, or improving/stable.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"],
      monitoringSources
    ),
    action: "Compare current symptoms, exam, vitals, objective results, adverse effects, and diagnostic certainty against the expected pathway response.",
    children: [
      endpoint({
        id: `${prefix}_missing_reassessment_endpoint`,
        label: "Missing data needed: reassessment before disposition",
        edgeLabel: "Reassessment data unavailable",
        sourceIds: genericSourceIds,
        criteria: criteria(
          `${prefix}_missing_reassessment_criteria`,
          "Route here when response, safety, or disposition cannot be determined from available reassessment data.",
          ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"],
          genericSourceIds,
          { missing_any: ["repeat vital signs", "treatment response", "adverse effects", "pending diagnostic results", "disposition constraints"] }
        ),
        action: "Obtain repeat vital signs, symptom trajectory, focused exam, key labs/results, adverse-effect screen, and disposition constraints before closing the pathway.",
        endpointType: "missing_data_needed",
        missingDataNeeded: ["repeat vital signs", "treatment response", "adverse effects", "pending diagnostic results", "disposition constraints"]
      }),
      endpoint({
        id: `${prefix}_worsening_escalation_endpoint`,
        label: "Escalate: worsening or discordant course",
        edgeLabel: "Worsening symptoms, unstable vitals, dangerous labs/results, or diagnosis no longer fits",
        sourceIds: monitoringSources,
        criteria: criteria(
          `${prefix}_worsening_escalation_criteria`,
          "Terminal escalation endpoint when reassessment shows deterioration, unsafe treatment, or discordant data.",
          ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"],
          monitoringSources
        ),
        action: `Escalate ${label} management: reassess ABCs, repeat critical objective data, broaden mimics/complications, and move to ED/admission/specialty review as clinically indicated.`,
        endpointType: "escalation_disposition"
      }),
      improvingAction
    ]
  });

  return actionNode({
    id: `${prefix}_monitoring_reassessment`,
    label: "Monitor and reassess on a defined interval",
    edgeLabel: options.edgeLabel || "Treatment plan selected",
    sourceIds: monitoringSources,
    criteria: criteria(
      `${prefix}_monitoring_reassessment_criteria`,
      "Activate monitoring after treatment or diagnostic plan is selected and before disposition or stopping decisions.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "workup_findings"],
      monitoringSources
    ),
    action: `Set a reassessment interval for ${label}; trend symptoms, exam, vitals, objective results, medication response, adverse effects, and diagnostic certainty.`,
    children: [responseDecision]
  });
}

function buildManagementBranch(prefix, module, branchLabel, edgeLabel, riskRows, treatmentRows, sourceIds) {
  const label = module.label || module.id;
  const branchSources = sourceIdsForItems([...riskRows, ...treatmentRows], sourceIds);
  const monitoring = buildMonitoringBranch(prefix, module, branchSources);
  const specialDecision = decision({
    id: `${prefix}_contraindications_special_populations_decision`,
    label: "Any contraindication, pregnancy issue, organ dysfunction, or local-policy dependency?",
    edgeLabel: "Before treatment is finalized",
    sourceIds: branchSources,
    criteria: criteria(
      `${prefix}_contraindication_decision_criteria`,
      "Route by pregnancy/postpartum/lactation, age-band mismatch, renal/hepatic/cardiac disease, allergies, drug interactions, procedure risk, or unresolved local policy.",
      ["pregnancy_status", "demographics", "medications", "comorbidities", "allergies", "renal_function", "hepatic_function", "local_policy"],
      branchSources
    ),
    action: "Check safety modifiers before committing to the treatment or disposition endpoint.",
    children: [
      endpoint({
        id: `${prefix}_clinician_review_endpoint`,
        label: "Clinician review: contraindication, special population, or local policy",
        edgeLabel: "Yes or uncertain",
        sourceIds: branchSources,
        criteria: criteria(
          `${prefix}_clinician_review_criteria`,
          "Terminal handoff when a patient-specific modifier or local policy changes the usual pathway.",
          ["pregnancy_status", "demographics", "medications", "comorbidities", "allergies", "local_policy"],
          branchSources
        ),
        action: `Hold irreversible or high-risk ${label} decisions until clinician review resolves the modifier and documents the safe local pathway.`,
        endpointType: "clinician_review_handoff",
        reviewNeededReason: "Patient-specific contraindication, pregnancy/postpartum/lactation context, organ dysfunction, drug interaction, procedural risk, guideline conflict, or local policy must be resolved before this branch can be safely applied."
      }),
      monitoring
    ]
  });

  const treatmentChain = chainEvidenceSteps(
    `${prefix}_treatment_step`,
    branchLabel.includes("lower") ? "First-line management step" : "High-risk treatment step",
    treatmentRows.length ? treatmentRows : riskRows,
    branchSources,
    specialDecision,
    "Proceed after the prior treatment/safety step is addressed"
  );

  const treatmentDecision = decision({
    id: `${prefix}_first_line_management_decision`,
    label: "Is first-line management safe to start now?",
    edgeLabel: "Risk category selected",
    sourceIds: branchSources,
    criteria: criteria(
      `${prefix}_first_line_management_decision_criteria`,
      "Select treatment or review branch based on confirmation, severity, contraindications, and required monitoring data.",
      ["workup_findings", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status"],
      branchSources
    ),
    action: `Choose a cited ${label} treatment path only after emergency features and missing safety data have been addressed.`,
    children: [
      endpoint({
        id: `${prefix}_treatment_data_review_endpoint`,
        label: "Missing data or unsafe treatment choice needs clinician review",
        edgeLabel: "Required treatment-safety data missing or risk exceeds pathway scope",
        sourceIds: branchSources,
        criteria: criteria(
          `${prefix}_treatment_review_criteria`,
          "Route here when treatment cannot be selected because required safety, dosing, monitoring, pregnancy, allergy, or local policy data are absent.",
          ["medications", "allergies", "renal_function", "hepatic_function", "pregnancy_status", "comorbidities", "local_policy"],
          branchSources,
          { missing_any: ["medication/allergy context", "renal/hepatic dosing context", "pregnancy or reproductive status when relevant", "monitoring capacity", "local protocol requirement"] }
        ),
        action: "Document exact missing treatment-safety data and obtain clinician review before applying this management branch.",
        endpointType: "missing_data_needed",
        missingDataNeeded: ["medication/allergy context", "renal/hepatic dosing context", "pregnancy or reproductive status when relevant", "monitoring capacity", "local protocol requirement"],
        reviewNeededReason: "Treatment selection depends on patient-specific safety data or local policy."
      }),
      treatmentChain
    ]
  });

  return actionNode({
    id: `${prefix}_management_bundle`,
    label: branchLabel,
    edgeLabel,
    sourceIds: branchSources,
    criteria: criteria(
      `${prefix}_management_bundle_criteria`,
      `Use this branch when ${edgeLabel.toLowerCase()} and the cited risk or disposition criteria apply.`,
      ["red_flags", "vitals", "labs", "imaging_results", "workup_findings", "comorbidities"],
      branchSources
    ),
    action: riskRows.map((item) => itemAction(item, itemLabel(item))).filter(Boolean).join(" ") || `Apply the ${branchLabel.toLowerCase()} for ${label}.`,
    children: [treatmentDecision]
  });
}

function thresholdRulesFromText(text = "") {
  const rules = [];
  const clean = cleanText(text);
  const pattern = /([A-Za-z][A-Za-z0-9 ()/-]{1,45}?)\s*(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)/g;
  let match;
  while ((match = pattern.exec(clean)) && rules.length < 4) {
    rules.push({
      source: "objective_data",
      fieldId: shortText(match[1], 40),
      operator: match[2],
      value: match[3],
      note: `Threshold extracted from cited pathway text: ${shortText(clean, 140)}`
    });
  }
  return rules;
}

function sourceThresholdsFromModule(module = {}) {
  const rows = allEvidenceGroups.flatMap((group) => Array.isArray(module[group]) ? module[group].map((item) => ({ group, item })) : []);
  const thresholds = [];
  rows.forEach(({ group, item }) => {
    const text = cleanText(`${item.label || ""} ${item.action || ""} ${item.management_change || ""} ${item.diagnostic_target || ""} ${item.rationale || ""}`);
    const matches = unique(text.match(thresholdPattern) || []);
    matches.forEach((threshold) => {
      thresholds.push({
        threshold,
        group,
        evidence_item_id: item.id || "",
        source_ids: itemSourceIds(item)
      });
    });
  });
  const seen = new Set();
  return thresholds.filter((row) => {
    const key = `${row.threshold}:${row.group}:${row.evidence_item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTraversableContext(module, sourceIds) {
  const questions = firstItems(module, "requiredQuestions", 4, ["conditionalQuestions"]);
  const exam = firstItems(module, "requiredExam", 4, ["conditionalExam", "safetyChecks"]);
  const tests = firstItems(module, "initialTests", 5);
  const redFlags = firstItems(module, "redFlags", 4, ["safetyChecks"]);
  const differential = firstItems(module, "differentialBuckets", 4);
  const treatments = firstItems(module, "treatmentOptions", 4, ["dispositionRules"]);
  const questionSources = sourceIdsForItems(questions, sourceIds);
  const examSources = sourceIdsForItems(exam, sourceIds);
  const testSources = sourceIdsForItems(tests, sourceIds);
  const redFlagSources = sourceIdsForItems(redFlags, sourceIds);
  const treatmentSources = sourceIdsForItems(treatments, sourceIds);

  return {
    input_modes: ["structured_patient_context", "extractable_note_context", "clinician_selected_workup"],
    active_branch_output: ["active_node_id", "active_branch_label", "missing_data_needed", "terminal_endpoint_id", "review_needed_reason"],
    required_domains: [
      {
        domain: "symptoms",
        exact_data_needed: unique(["presenting symptom/diagnosis trigger", "onset/duration", "trajectory/worsening", ...listLabels(questions, 5)]),
        source_ids: questionSources
      },
      {
        domain: "exam",
        exact_data_needed: unique(["focused exam findings", "red-flag exam findings", ...listLabels(exam, 5)]),
        source_ids: examSources
      },
      {
        domain: "vitals",
        exact_data_needed: ["blood pressure", "heart rate", "respiratory rate", "oxygen saturation", "temperature", "mental status", "weight when dosing or fluid decisions depend on it"],
        source_ids: redFlagSources
      },
      {
        domain: "labs",
        exact_data_needed: unique(["module-specific laboratory results and local reference ranges when indicated", ...listLabels(tests, 5)]),
        source_ids: testSources
      },
      {
        domain: "imaging_results",
        exact_data_needed: unique(["source-directed imaging, ECG, microbiology, pathology, or procedure results when indicated", ...listLabels(tests.filter((item) => /imaging|ultrasound|ct|mri|x-ray|ecg|culture|pathology|fna|scan/i.test(itemLabel(item))), 5)]),
        source_ids: testSources
      },
      {
        domain: "medications",
        exact_data_needed: ["current medication list", "recent medication changes or missed doses", "allergies", "contraindications", "drug interactions", "adherence/access barriers"],
        source_ids: treatmentSources
      },
      {
        domain: "comorbidities",
        exact_data_needed: ["major comorbidities", "renal/hepatic/cardiac disease", "immunocompromise or high-risk host factors", "frailty or functional risk", "prior relevant disease or procedure"],
        source_ids: sourceIds
      },
      {
        domain: "demographics",
        exact_data_needed: ["age band", "pediatric versus adult pathway fit", "sex/reproductive context when relevant", "frailty or functional context", "pathway applicability fit"],
        source_ids: sourceIds
      },
      {
        domain: "pregnancy_status",
        exact_data_needed: ["pregnant/not pregnant/unknown when pregnancy potential exists", "postpartum or lactation status when relevant", "fertility intent when treatment choice depends on it"],
        source_ids: sourceIds
      },
      {
        domain: "workup_findings",
        exact_data_needed: unique(["diagnosis confirmation status", "mimics/exclusions reviewed", "severity/risk stratum", "treatment response", "disposition and follow-up constraints", ...listLabels(differential, 4)]),
        source_ids: sourceIds
      }
    ],
    missing_data_endpoint_id: "endpoint_missing_core_context"
  };
}

function buildClinicalPathwayTree(module, sourceById) {
  const label = module.label || module.id;
  const redFlags = firstItems(module, "redFlags", 4, ["safetyChecks"]);
  const tests = firstItems(module, "initialTests", 5);
  const differentials = firstItems(module, "differentialBuckets", 4);
  const dispositionRules = firstItems(module, "dispositionRules", 4, ["decisionTrees"]);
  const decisionRows = firstItems(module, "decisionTrees", 4, ["dispositionRules"]);
  const treatmentRows = firstItems(module, "treatmentOptions", 4, ["dispositionRules"]);
  const contextEvidenceItems = allEvidenceGroups.flatMap((group) => Array.isArray(module[group]) ? module[group] : []);
  const allEvidenceItems = uniqueById([...redFlags, ...tests, ...differentials, ...dispositionRules, ...decisionRows, ...treatmentRows, ...contextEvidenceItems]);
  const moduleSourceIds = sourceIdsForItems(allEvidenceItems, genericSourceIds);
  const redFlagSources = sourceIdsForItems(redFlags, moduleSourceIds);
  const testSources = sourceIdsForItems(tests, moduleSourceIds);
  const differentialSources = sourceIdsForItems(differentials, moduleSourceIds);
  const managementSources = sourceIdsForItems([...decisionRows, ...dispositionRules, ...treatmentRows], moduleSourceIds);

  const highRiskBranch = buildManagementBranch(
    "high_risk",
    module,
    `High-risk or confirmed ${shortText(label, 80)} management`,
    "High-risk criteria, severe result, dangerous trajectory, or monitored disposition need",
    dispositionRules.length ? dispositionRules.slice(0, 3) : decisionRows.slice(0, 3),
    treatmentRows.slice(0, 4),
    managementSources
  );

  const lowerRiskBranch = buildManagementBranch(
    "lower_risk",
    module,
    `Lower-risk ${shortText(label, 80)} management and follow-up`,
    "No emergency or high-risk criteria after diagnostic confirmation and mimic review",
    decisionRows.slice(0, 3),
    treatmentRows.slice(1, 4).length ? treatmentRows.slice(1, 4) : treatmentRows.slice(0, 3),
    managementSources
  );

  const riskDecision = decision({
    id: "severity_risk_decision",
    label: "Severity or disposition-changing risk present?",
    edgeLabel: "Severity/risk criteria interpreted",
    sourceIds: managementSources,
    criteria: criteria(
      "severity_risk_decision_criteria",
      "Route by cited severity, complication, diagnostic certainty, and disposition-changing criteria.",
      ["red_flags", "vitals", "labs", "imaging_results", "comorbidities", "workup_findings"],
      managementSources,
      { structured_rules: [{ source: "workup_findings", operator: "any_present", fields: listLabels(dispositionRules, 4) }] }
    ),
    action: "Select high-risk/confirmed or lower-risk management branch.",
    children: [highRiskBranch, lowerRiskBranch]
  });

  const severityChain = chainEvidenceSteps(
    "severity_rule",
    "Severity/risk rule",
    dispositionRules.length ? dispositionRules.slice(0, 4) : decisionRows.slice(0, 4),
    managementSources,
    riskDecision,
    "Next severity or disposition rule"
  );

  const confirmedWorkup = actionNode({
    id: "confirmed_or_high_suspicion",
    label: `${shortText(label, 100)} remains active after confirmation and exclusions`,
    edgeLabel: "Guideline criteria met, high suspicion persists, or treatment cannot safely wait",
    sourceIds: managementSources,
    criteria: criteria(
      "confirmed_or_high_suspicion_criteria",
      "Continue when the diagnosis is confirmed or remains the safest working diagnosis after cited mimic review.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"],
      managementSources
    ),
    action: `Proceed with severity/risk stratification and management for ${label}.`,
    children: [severityChain]
  });

  const mimicHandoff = endpoint({
    id: "endpoint_mimic_or_alternate_pathway",
    label: "Use alternate diagnosis pathway or clinician review",
    edgeLabel: "Mimic, exclusion, or alternate diagnosis more likely",
    sourceIds: differentialSources,
    criteria: criteria(
      "mimic_or_alternate_pathway_criteria",
      "Terminal handoff when a competing cited diagnosis or exclusion explains the presentation better than this pathway.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"],
      differentialSources
    ),
    action: `Switch from ${label} to the competing pathway, document why, and name what evidence would reopen this workup.`,
    endpointType: "clinician_review_handoff",
    reviewNeededReason: "Competing diagnosis or exclusion changes the active management pathway."
  });

  const continueAfterMimics = actionNode({
    id: "continue_after_mimics_reviewed",
    label: "Mimics reviewed; this pathway remains best active frame",
    edgeLabel: "Mimics/exclusions considered and not dominant",
    sourceIds: differentialSources,
    criteria: criteria(
      "continue_after_mimics_criteria",
      "Continue when cited mimics and exclusions have been considered and do not explain the presentation better.",
      ["symptoms", "exam", "labs", "imaging_results", "workup_findings"],
      differentialSources
    ),
    action: `Document the mimic review for ${label}, including discordant data and why this pathway remains active.`,
    children: [confirmedWorkup]
  });

  const mimicDecision = decision({
    id: "mimics_exclusions_decision",
    label: "Mimic, exclusion, or alternate pathway more likely?",
    edgeLabel: "Initial diagnostic confirmation interpreted",
    sourceIds: differentialSources,
    criteria: criteria(
      "mimics_exclusions_decision_criteria",
      `Compare ${label} against cited mimics/exclusions: ${shortText(listLabels(differentials, 4).join("; "), 260)}`,
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"],
      differentialSources
    ),
    action: "Avoid premature closure before management escalation or treatment.",
    children: [mimicHandoff, continueAfterMimics]
  });

  const diagnosticDecision = decision({
    id: "diagnostic_confirmation_decision",
    label: "Diagnostic criteria met or treatment cannot wait?",
    edgeLabel: "Confirmatory data interpreted",
    sourceIds: testSources,
    criteria: criteria(
      "diagnostic_confirmation_decision_criteria",
      "Route by confirmatory results, dangerous trajectory, and whether treatment can safely wait for more data.",
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "workup_findings"],
      testSources,
      { structured_rules: [{ source: "workup_findings", operator: "any_present", fields: listLabels(tests, 5) }] }
    ),
    action: "Use objective results and cited criteria to decide whether to continue, gather more data, or route to alternate pathway.",
    children: [
      endpoint({
        id: "endpoint_diagnostic_step_needed",
        label: "Diagnostic step needed before treatment/disposition",
        edgeLabel: "Results missing, borderline, discordant, or assay/timing context unsafe",
        sourceIds: testSources,
        criteria: criteria(
          "diagnostic_step_needed_criteria",
          "Terminal diagnostic endpoint when the next safest action is to obtain, repeat, or correctly interpret a cited confirmatory test.",
          ["labs", "imaging_results", "workup_findings", "medications", "pregnancy_status"],
          testSources,
          { missing_any: listLabels(tests, 5) }
        ),
        action: `Obtain or repeat the exact ${label} confirmation data: ${shortText(listLabels(tests, 5).join("; "), 320)}.`,
        endpointType: "diagnostic_step",
        missingDataNeeded: listLabels(tests, 5)
      }),
      mimicDecision
    ]
  });

  const diagnosticChain = chainEvidenceSteps(
    "diagnostic_confirmation_step",
    "Diagnostic confirmation step",
    tests.slice(0, 5),
    testSources,
    diagnosticDecision,
    "Next diagnostic confirmation step"
  );

  const diagnosticDataDecision = decision({
    id: "diagnostic_data_complete_decision",
    label: "Required diagnostic data available?",
    edgeLabel: "Emergency features absent or stabilized",
    sourceIds: testSources,
    criteria: criteria(
      "diagnostic_data_complete_criteria",
      "Route to missing-data endpoint if the exact confirmatory tests, vital context, or result interpretation data are unavailable.",
      ["labs", "imaging_results", "vitals", "workup_findings"],
      testSources
    ),
    action: "Decide whether this workup has enough objective data to traverse the management pathway.",
    children: [
      endpoint({
        id: "endpoint_missing_confirmation_data",
        label: "Missing data needed: diagnostic confirmation",
        edgeLabel: "Required confirmation data unavailable",
        sourceIds: testSources,
        criteria: criteria(
          "missing_confirmation_data_criteria",
          "Route here when confirmation requires exact tests/results that are not available or interpretable.",
          ["labs", "imaging_results", "workup_findings", "local_reference_ranges"],
          testSources,
          { missing_any: listLabels(tests, 5) }
        ),
        action: `Obtain or document missing ${label} confirmation data before selecting a non-emergency treatment branch.`,
        endpointType: "missing_data_needed",
        missingDataNeeded: listLabels(tests, 5)
      }),
      diagnosticChain
    ]
  });

  const diagnosticIntake = actionNode({
    id: "diagnostic_intake",
    label: "Collect source-directed confirmation and baseline safety data",
    edgeLabel: "No current instability after initial assessment",
    sourceIds: testSources,
    criteria: criteria(
      "diagnostic_intake_criteria",
      `Order and interpret the focused cited workup for ${label}.`,
      ["symptoms", "exam", "vitals", "labs", "imaging_results", "medications", "comorbidities", "pregnancy_status"],
      testSources
    ),
    action: `Use source-directed tests for ${label}: ${shortText(listLabels(tests, 5).join("; "), 340)}.`,
    children: [diagnosticDataDecision]
  });

  const redFlagDecision = decision({
    id: "red_flags_instability_decision",
    label: "Any red flag, unstable vital sign, or emergency feature?",
    edgeLabel: "Core context available",
    sourceIds: redFlagSources,
    criteria: criteria(
      "red_flags_instability_decision_criteria",
      `Screen for ${label} red flags: ${shortText(listLabels(redFlags, 4).join("; "), 280)}`,
      ["symptoms", "exam", "vitals", "mental_status", "red_flags", "workup_findings"],
      redFlagSources,
      { structured_rules: [{ source: "checklist", fieldId: listLabels(redFlags, 4).join(" | "), operator: "present" }] }
    ),
    action: "Escalate before routine diagnostic workup if emergency criteria are present.",
    children: [
      endpoint({
        id: "endpoint_emergency_escalation",
        label: "Emergency escalation or monitored-care handoff",
        edgeLabel: "Yes: instability, red flag, or high-acuity disposition need",
        sourceIds: redFlagSources,
        criteria: criteria(
          "emergency_escalation_criteria",
          "Terminal emergency endpoint when instability, red flags, or dangerous trajectory are present.",
          ["symptoms", "exam", "vitals", "mental_status", "red_flags", "workup_findings"],
          redFlagSources
        ),
        action: redFlags.map((item) => itemAction(item, itemLabel(item))).filter(Boolean).join(" ") || `Escalate ${label} immediately for emergency evaluation and monitored care.`,
        endpointType: "escalation_disposition"
      }),
      diagnosticIntake
    ]
  });

  const initialAssessment = actionNode({
    id: "initial_assessment",
    label: "Initial assessment: stabilize, localize, and document traversal data",
    edgeLabel: "Core context available and this pathway applies",
    sourceIds: moduleSourceIds,
    criteria: criteria(
      "initial_assessment_criteria",
      "Proceed when enough structured or extractable patient context exists to evaluate instability, confirmation, mimics, severity, and treatment safety.",
      coreContextData,
      moduleSourceIds,
      { required_any_documented: coreContextData }
    ),
    action: `Document ${label} onset/trajectory, focused symptoms and exam, vitals, objective results, medication/allergy context, comorbidities, demographics, pregnancy/applicability status, and current workup findings.`,
    fallbackState: "active",
    children: [redFlagDecision]
  });

  const root = decision({
    id: "root",
    label: `${label}: evidence-cited clinical management pathway`,
    sourceIds: moduleSourceIds,
    criteria: criteria(
      "activate_workup",
      `Activate this pathway when structured or extractable context matches ${label} triggers or the clinician selects workup ${module.id}.`,
      ["selected_workup_id", "presenting_symptoms", "problem_list_or_diagnosis", "clinician_selected_module"],
      moduleSourceIds
    ),
    action: `Route ${label} by missing data, instability, diagnostic confirmation, mimics, severity, first-line treatment, escalation, contraindications, monitoring, de-escalation, disposition, follow-up, and safety-netting.`,
    fallbackState: "active",
    children: [
      endpoint({
        id: "endpoint_missing_core_context",
        label: "Missing data needed before safe pathway traversal",
        edgeLabel: "Missing data: core context unavailable",
        sourceIds: genericSourceIds,
        criteria: criteria(
          "missing_core_context",
          "Route here when any exact core context field required for safe branch selection is absent or cannot be extracted.",
          coreContextData,
          genericSourceIds,
          { missing_any: coreContextData }
        ),
        action: `Obtain or document the exact missing data before choosing a ${label} management branch. If the patient is unstable, bypass missing-data collection and use emergency escalation.`,
        endpointType: "missing_data_needed",
        missingDataNeeded: coreContextData,
        fallbackState: "warning"
      }),
      initialAssessment
    ]
  });

  const activationRules = {};
  const allNodeSourceIds = [];
  const collect = (entry) => {
    allNodeSourceIds.push(...(entry.source_ids || []), ...(entry.criteria?.source_ids || []));
    if (entry.criteria) activationRules[entry.id] = entry.criteria;
    for (const child of entry.children || []) collect(child);
  };
  collect(root);

  const thresholdRules = thresholdRulesFromText(JSON.stringify({ tests, differentials, dispositionRules, decisionRows, treatmentRows }));
  thresholdRules.forEach((rule, index) => {
    activationRules[`threshold_${index + 1}`] = rule;
  });

  const sourceThresholds = sourceThresholdsFromModule(module);
  const finalSourceIds = unique([...moduleSourceIds, ...allNodeSourceIds, ...sourceThresholds.flatMap((row) => row.source_ids || [])]);

  return {
    schema: "clinical_pathway_tree_v1",
    workupId: module.id,
    workup_id: module.id,
    title: label,
    version: "2.0.0",
    status: "generated_from_source_module_needs_clinician_review",
    source_ids: finalSourceIds,
    source_metadata: sourceRowsForTree(finalSourceIds, sourceById),
    provenance: {
      generated_by: "scripts/generate-clinical-pathway-trees.js",
      generated_at: `${auditDate}T00:00:00.000Z`,
      update_scope: "clinical_pathway_tree_v1 only",
      source_material: "Local medical-knowledge complaint module rows and source registry metadata",
      review_note: "Generated pathway is evidence-cited and traversable but still requires clinician review for local policy, patient-specific contraindications, and source conflicts."
    },
    source_thresholds: sourceThresholds,
    traversable_context: buildTraversableContext(module, finalSourceIds),
    activationRules,
    root,
    synthetic_patient_scenarios: buildSyntheticScenarios(module),
    audit_requirements: {
      required_domains: requiredPathwayDomains,
      branch_requirements: [
        "valid root",
        "interpretable criteria for every decision branch",
        "all branches reachable or intentionally conditional",
        "all paths terminate in actionable endpoints",
        "endpoints cite evidence or state review-needed reason",
        "missing-data endpoints name exact data needed",
        "synthetic patients traverse major pathways",
        "all source_ids resolve through source registry",
        "clinical specificity from module evidence rows is present in the tree"
      ]
    }
  };
}

function buildSyntheticScenarios(module) {
  const base = { selected_workup_id: module.id };
  return [
    {
      scenario_id: "missing_core_context",
      description: "Selected workup but no vitals, focused findings, diagnostic results, medication/comorbidity context, or pregnancy/applicability context are available.",
      context: { ...base, symptoms: ["workup trigger only"], missing: coreContextData },
      expected_active_branch: "Missing data: core context unavailable",
      expected_endpoint_id: "endpoint_missing_core_context",
      major_pathway: "missing_data_needed"
    },
    {
      scenario_id: "unstable_red_flag",
      description: "Synthetic unstable patient with cited red flags or dangerous vital-sign pattern.",
      context: { ...base, red_flags_present: true, vitals: { unstable: true }, mental_status: "changed or concerning" },
      expected_active_branch: "Yes: instability, red flag, or high-acuity disposition need",
      expected_endpoint_id: "endpoint_emergency_escalation",
      major_pathway: "escalation_emergency_actions"
    },
    {
      scenario_id: "missing_confirmation_data",
      description: "Stable patient has enough context for triage but required confirmatory result is unavailable.",
      context: { ...base, vitals: { unstable: false }, missing: ["confirmatory tests/results"] },
      expected_active_branch: "Required confirmation data unavailable",
      expected_endpoint_id: "endpoint_missing_confirmation_data",
      major_pathway: "diagnostic_confirmation_missing_data"
    },
    {
      scenario_id: "diagnostic_step_needed",
      description: "Results are borderline, discordant, or timing/assay context prevents safe final classification.",
      context: { ...base, workup_findings: ["borderline or discordant result"], vitals: { unstable: false } },
      expected_active_branch: "Results missing, borderline, discordant, or assay/timing context unsafe",
      expected_endpoint_id: "endpoint_diagnostic_step_needed",
      major_pathway: "diagnostic_step"
    },
    {
      scenario_id: "mimic_or_exclusion",
      description: "An alternate diagnosis or exclusion is more likely after cited mimic review.",
      context: { ...base, workup_findings: ["alternate diagnosis more likely"] },
      expected_active_branch: "Mimic, exclusion, or alternate diagnosis more likely",
      expected_endpoint_id: "endpoint_mimic_or_alternate_pathway",
      major_pathway: "mimics_exclusions"
    },
    {
      scenario_id: "high_risk_management",
      description: "Confirmed or high-suspicion workup with high-risk criteria requiring monitored management.",
      context: { ...base, workup_findings: ["confirmed", "high risk"], vitals: { concerning: true } },
      expected_active_branch: "High-risk criteria, severe result, dangerous trajectory, or monitored disposition need",
      expected_endpoint_id: "high_risk_monitored_disposition_endpoint",
      major_pathway: "severity_risk_stratification_and_treatment_escalation"
    },
    {
      scenario_id: "special_population_or_contraindication",
      description: "Pregnancy, organ dysfunction, allergy, medication interaction, procedure risk, or local policy alters usual treatment.",
      context: { ...base, pregnancy_status: "unknown or clinically relevant", medications: ["interaction or allergy"], comorbidities: ["renal/hepatic/cardiac risk"] },
      expected_active_branch: "Yes or uncertain",
      expected_endpoint_id: "high_risk_clinician_review_endpoint",
      major_pathway: "contraindications_special_populations"
    },
    {
      scenario_id: "missing_reassessment_data",
      description: "Treatment started but reassessment data needed for disposition and stopping decisions are missing.",
      context: { ...base, treatment_started: true, missing: ["repeat vital signs", "response", "adverse effects"] },
      expected_active_branch: "Reassessment data unavailable",
      expected_endpoint_id: "high_risk_missing_reassessment_endpoint",
      major_pathway: "monitoring_reassessment_missing_data"
    },
    {
      scenario_id: "worsening_reassessment",
      description: "Patient worsens or new data conflict with the selected pathway.",
      context: { ...base, treatment_started: true, reassessment: "worse", vitals: { unstable: true } },
      expected_active_branch: "Worsening symptoms, unstable vitals, dangerous labs/results, or diagnosis no longer fits",
      expected_endpoint_id: "high_risk_worsening_escalation_endpoint",
      major_pathway: "monitoring_reassessment_escalation"
    },
    {
      scenario_id: "improving_deescalation",
      description: "Patient improves and objective criteria allow de-escalation, stopping, or narrowed therapy.",
      context: { ...base, reassessment: "improving", workup_findings: ["stopping criteria met"] },
      expected_active_branch: "Stopping/de-escalation criteria met and no unresolved danger features",
      expected_endpoint_id: "high_risk_stop_or_deescalate_endpoint",
      major_pathway: "deescalation_stopping_criteria"
    },
    {
      scenario_id: "lower_risk_followup_safety_net",
      description: "Stable lower-risk patient has safe outpatient follow-up and receives safety-net instructions.",
      context: { ...base, vitals: { unstable: false }, workup_findings: ["lower risk", "follow-up available"] },
      expected_active_branch: "Outpatient follow-up is safe and feasible",
      expected_endpoint_id: "lower_risk_safety_net_endpoint",
      major_pathway: "disposition_followup_safety_netting"
    }
  ];
}

function main() {
  const check = process.argv.includes("--check");
  const sourceRegistry = JSON.parse(readFileSync(sourceRegistryPath, "utf8"));
  const sources = Array.isArray(sourceRegistry) ? sourceRegistry : sourceRegistry.sources || [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const changed = [];

  for (const file of complaintModuleFiles()) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const module = raw.module || raw;
    const nextTree = buildClinicalPathwayTree(module, sourceById);
    const nextRaw = raw.module
      ? { ...raw, module: { ...raw.module, clinical_pathway_tree_v1: nextTree } }
      : { ...raw, clinical_pathway_tree_v1: nextTree };
    const nextText = `${JSON.stringify(nextRaw, null, 2)}\n`;
    const currentText = readFileSync(file, "utf8");
    if (currentText !== nextText) {
      changed.push(file);
      if (!check) writeFileSync(file, nextText, "utf8");
    }
  }

  if (check && changed.length) {
    throw new Error(`Clinical pathway trees are out of date:\n${changed.join("\n")}`);
  }

  const action = check ? "Verified" : "Generated";
  console.log(`${action} clinical_pathway_tree_v1 for ${complaintModuleFiles().length} complaint modules.`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
