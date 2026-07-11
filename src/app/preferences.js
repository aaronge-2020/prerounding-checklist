export const MEDICAL_SERVICE_OPTIONS = [
  {
    value: "primary",
    label: "Primary team",
    prompt: "Prioritize the whole active inpatient picture, including cross-cutting issues that affect day-to-day management."
  },
  {
    value: "consult",
    label: "Consult service",
    prompt: "Center the workup and presentation on the consulted clinical question and its consequences. Do not turn it into a broad primary-team review unless the stated focus requires it."
  },
  {
    value: "critical-care",
    label: "Critical care / ICU",
    prompt: "Prioritize acuity, organ support, evolving physiology, and immediately actionable bedside findings."
  },
  {
    value: "specialty",
    label: "Specialty primary service",
    prompt: "Prioritize the service-specific disease process while retaining only the general inpatient context that changes its management."
  },
  {
    value: "other",
    label: "Other service",
    prompt: "Use the stated service focus to determine which problems and level of detail are relevant."
  }
];

export const PRESENTATION_DETAIL_OPTIONS = [
  {
    value: "concise",
    label: "Concise",
    prompt: "Use a tight, problem-oriented presentation. Include only details that change the assessment, plan, or bedside task."
  },
  {
    value: "standard",
    label: "Standard",
    prompt: "Use a balanced presentation with pertinent positives and negatives, without repeating background that does not change the clinical message."
  },
  {
    value: "detailed",
    label: "Detailed",
    prompt: "Include the supporting history, examination detail, and relevant negative findings needed to make the clinical reasoning easy to follow."
  }
];

// These models support the Responses API structured-output flow used for workup
// conversion. Keep this list intentionally curated: a saved free-form model ID
// can fail later with a confusing API error and makes the conversion path hard
// to support reliably.
export const OPENAI_WORKUP_MODEL_OPTIONS = [
  {
    value: "gpt-5.6",
    label: "GPT-5.6 Sol",
    description: "Highest-quality current option"
  },
  {
    value: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Balanced quality and cost"
  },
  {
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Lower-cost current option"
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    description: "Previous-generation full model"
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "Faster, lower-cost option"
  },
  {
    value: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    description: "Fastest, lowest-cost option"
  }
];

export const DEFAULT_OPENAI_WORKUP_MODEL = "gpt-5.6";

export const DEFAULT_USER_PREFERENCES = Object.freeze({
  openAiApiKey: "",
  openAiModel: DEFAULT_OPENAI_WORKUP_MODEL,
  medicalService: "primary",
  customServiceName: "",
  serviceFocus: "",
  presentationDetail: "standard",
  attendingPreferences: ""
});

function optionFor(options, value, fallback) {
  return options.find((option) => option.value === value) || options.find((option) => option.value === fallback) || options[0];
}

function trimmed(value, limit = 4000) {
  return String(value || "").trim().slice(0, limit);
}

export function normalizeUserPreferences(value = {}) {
  const medicalService = optionFor(MEDICAL_SERVICE_OPTIONS, value?.medicalService, DEFAULT_USER_PREFERENCES.medicalService).value;
  const presentationDetail = optionFor(PRESENTATION_DETAIL_OPTIONS, value?.presentationDetail, DEFAULT_USER_PREFERENCES.presentationDetail).value;
  return {
    openAiApiKey: trimmed(value?.openAiApiKey, 1000),
    openAiModel: openAiWorkupModelOption(value?.openAiModel).value,
    medicalService,
    customServiceName: trimmed(value?.customServiceName, 160),
    serviceFocus: trimmed(value?.serviceFocus),
    presentationDetail,
    attendingPreferences: trimmed(value?.attendingPreferences)
  };
}

export function medicalServiceOption(value) {
  return optionFor(MEDICAL_SERVICE_OPTIONS, value, DEFAULT_USER_PREFERENCES.medicalService);
}

export function presentationDetailOption(value) {
  return optionFor(PRESENTATION_DETAIL_OPTIONS, value, DEFAULT_USER_PREFERENCES.presentationDetail);
}

export function openAiWorkupModelOption(value) {
  return optionFor(OPENAI_WORKUP_MODEL_OPTIONS, value, DEFAULT_OPENAI_WORKUP_MODEL);
}

export function buildTeamPreferencesPromptBlock(preferences = {}) {
  const normalized = normalizeUserPreferences(preferences);
  const service = medicalServiceOption(normalized.medicalService);
  const detail = presentationDetailOption(normalized.presentationDetail);
  const serviceName = normalized.medicalService === "other" && normalized.customServiceName
    ? normalized.customServiceName
    : service.label;
  const focus = normalized.serviceFocus || "No additional service focus was saved.";
  const attending = normalized.attendingPreferences || "No additional attending-specific preferences were saved.";
  return `<team_presentation_preferences>
Medical service: ${serviceName}
Service approach: ${service.prompt}
Stated service focus: ${focus}
Presentation detail: ${detail.label}. ${detail.prompt}
Attending-specific preferences: ${attending}
Apply these preferences to relevance, organization, and level of detail. Do not invent requirements that are not stated here.
</team_presentation_preferences>`;
}
