const contextRoles = [
  ["admission_reason", "Admission reason and initial severity", "Why the patient required admission and the initial level of illness.", true],
  ["relevant_baseline", "Relevant baseline and active problem context", "Comorbidities, baseline function, and unresolved problems that still matter today.", true],
  ["procedures_devices", "Procedures, devices, and medication context", "Relevant procedures, devices, and high-risk medication indications.", true],
  ["admission_history", "Admission history details", "Chronological HPI and admission-only history.", false],
  ["admission_results", "Admission results and source details", "Initial laboratories, imaging, and other admission-only evidence.", false],
  ["disposition_baseline", "Social and disposition baseline", "Baseline function, support, and disposition context.", true],
  ["additional_admission_source", "Additional admission source", "De-identified source material not included in daily prompts until you choose a clinical purpose.", false]
];

const dailyRoles = [
  ["interval_events", "Interval events", "Overnight events and completed interventions."],
  ["patient_report", "Patient report", "Current symptoms, meaningful negatives, goals, and concerns."],
  ["current_support", "Current vitals and clinical support", "Current or time-qualified vital signs, oxygen, dialysis, and other support."],
  ["focused_exam", "Focused examination", "Selected-day abnormal, changed, or decision-relevant examination findings."],
  ["key_results", "Key results and trends", "New laboratory, imaging, microbiology, and diagnostic evidence."],
  ["medication_order_events", "Medication and order events", "Selected-day medications given, held, started, stopped, or changed, plus active orders."],
  ["consultant_decisions", "Consultant decisions and procedures", "Documented consultant recommendations and planned or completed procedures."],
  ["problem_plan_updates", "Problem updates and today’s plan", "The team’s documented interpretation, actions, and management-changing uncertainties."],
  ["disposition_questions", "Disposition and team questions", "Discharge readiness, barriers, and unresolved questions that are not yet plans."],
  ["additional_daily_source", "Additional daily source", "De-identified material excluded from the default progress note until you choose a clinical purpose."]
];

function definitions(entries, scope) {
  return entries.map(([id, label, description, carryForward = true]) => ({ id, label, description, scope, carryForward }));
}

export const CONTEXT_PACKET_ROLES = definitions(contextRoles, "context");
export const DAILY_PACKET_ROLES = definitions(dailyRoles, "daily");

const legacyRoleByScopeAndLabel = {
  context: new Map([
    ["admission context", "admission_reason"],
    ["medications", "procedures_devices"],
    ["labs", "admission_results"],
    ["other", "additional_admission_source"]
  ]),
  daily: new Map([
    ["interval events", "interval_events"],
    ["new labs/results", "key_results"],
    ["medication changes", "medication_order_events"],
    ["patient-reported symptoms", "patient_report"],
    ["other", "additional_daily_source"],
    ["physical exam findings", "focused_exam"]
  ])
};

export function packetRolesForScope(scope) {
  return scope === "daily" ? DAILY_PACKET_ROLES : CONTEXT_PACKET_ROLES;
}

export function packetRoleFor(scope, role) {
  return packetRolesForScope(scope).find((entry) => entry.id === role) || null;
}

export function defaultPacketRole(scope, index = 0) {
  return packetRolesForScope(scope)[index]?.id || (scope === "daily" ? "additional_daily_source" : "additional_admission_source");
}

// Older records have only user-visible labels. This one-time exact mapping is
// intentionally limited to the prior default labels; custom labels remain an
// explicit additional source rather than being guessed into a clinical role.
export function normalizePacketRole(scope, role, label = "", index = 0) {
  if (packetRoleFor(scope, role)) return role;
  const normalizedLabel = String(label || "").trim().toLowerCase();
  const legacy = legacyRoleByScopeAndLabel[scope]?.get(normalizedLabel);
  if (legacy) return legacy;
  if (normalizedLabel) return scope === "daily" ? "additional_daily_source" : "additional_admission_source";
  return defaultPacketRole(scope, index);
}

export function packetRoleOptions(scope) {
  return packetRolesForScope(scope).map(({ id, label, description }) => ({ id, label, description }));
}

export function packetRoleLabel(scope, role, fallback = "Saved information") {
  return packetRoleFor(scope, role)?.label || fallback;
}

export function isCarryForwardContextRole(role) {
  return Boolean(packetRoleFor("context", role)?.carryForward);
}
