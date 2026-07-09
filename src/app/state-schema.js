// @ts-check

export const PERSISTED_VAULT_FIELDS = Object.freeze([
  "vaultName",
  "patients",
  "lastPatientSeq",
  "scrubbedText",
  "deidCounts",
  "residualPhiWarnings",
  "workup",
  "workupRows",
  "selectedWorkupRow",
  "selectedWorkupModuleId",
  "checklistText",
  "sections",
  "checklistWorkupModuleId",
  "checklistWorkupSignature",
  "checklistCatalogStale",
  "answers",
  "itemNotes",
  "reviewedChecklistKeys",
  "bedsideAuditLogByPatientId",
  "bedsideNote",
  "selectedTaskId",
  "openEvidenceSummaries",
  "lastChecklistRefinementCount",
  "lastChecklistRefinementAdditionCount",
  "lastChecklistRefinementRemovalCount",
  "transferCode",
  "phonePayload",
  "importedFindings",
  "importedPhoneAnswerSummary",
  "activePatientId",
  "patientSearch",
  "activePatientTab",
  "todayModeByPatientId",
  "patientDrafts",
  "patientContinuityCases",
  "patientWorkupSelections",
  "workupRefinementsByModuleId",
  "patientWorkupRefinements",
  "patientObjectiveData",
  "decisionTreeGraphsByModuleId",
  "promptTemplatesByTaskId",
  "currentView",
  "sourceMode",
  "concern",
  "modifiers",
  "clinicalModifierDetails",
  "setting",
  "population"
]);

/**
 * Copies only the persisted vault fields from an app state object.
 *
 * @param {Record<string, unknown>} state
 * @returns {Record<string, unknown>}
 */
export function persistedVaultPayload(state) {
  return Object.fromEntries(
    PERSISTED_VAULT_FIELDS.map((key) => [key, state[key]])
  );
}
