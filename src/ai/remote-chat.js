// Pure builders for the remote (ChatGPT) side of AI Chat.
// No DOM, no storage, no network: service tailoring, the rigorous
// citation system prompt, and Responses-API message assembly only.

// Clinical services the chat can be tailored to. `servicePrompt` is spliced
// into the system prompt; keep each one focused on what changes at the
// bedside on that service.
export const CHAT_SERVICE_OPTIONS = [
  {
    value: "",
    label: "General",
    servicePrompt: "Give balanced, service-agnostic answers appropriate to any inpatient or outpatient setting."
  },
  {
    value: "ob-ld",
    label: "OB/GYN — Labor & Delivery",
    servicePrompt: "The student is on Labor & Delivery. Prioritize intrapartum management, fetal heart rate interpretation, obstetric emergencies, and ACOG guidance. Drug doses must be obstetric-specific (e.g. oxytocin, magnesium sulfate regimens)."
  },
  {
    value: "ob-gyn",
    label: "OB/GYN — Gynecology",
    servicePrompt: "The student is on the gynecology service. Prioritize benign and malignant gynecologic disease, perioperative care, contraception, and abnormal uterine bleeding, grounded in ACOG guidance."
  },
  {
    value: "medicine",
    label: "Internal Medicine",
    servicePrompt: "The student is on the internal medicine wards. Prioritize differential diagnosis, evidence-based inpatient management, and ACP/ACC/AHA/IDSA guidance."
  },
  {
    value: "surgery",
    label: "Surgery",
    servicePrompt: "The student is on the general surgery service. Prioritize perioperative management, surgical decision-making, complications, and ACS guidance."
  },
  {
    value: "peds",
    label: "Pediatrics",
    servicePrompt: "The student is on pediatrics. Always give weight-based pediatric dosing, account for developmental stage, and ground answers in AAP guidance."
  },
  {
    value: "em",
    label: "Emergency Medicine",
    servicePrompt: "The student is in the emergency department. Prioritize the undifferentiated patient, can't-miss diagnoses, stabilization, and ACEP guidance."
  },
  {
    value: "neuro",
    label: "Neurology",
    servicePrompt: "The student is on neurology. Prioritize neuroanatomic localization, stroke and seizure protocols, and AAN guidance."
  },
  {
    value: "psych",
    label: "Psychiatry",
    servicePrompt: "The student is on psychiatry. Cite DSM-5-TR criteria explicitly when discussing diagnoses, and ground management in APA guidance."
  },
  {
    value: "fm",
    label: "Family Medicine",
    servicePrompt: "The student is in family medicine clinic. Prioritize outpatient management, preventive care, chronic disease, and USPSTF/AAFP guidance."
  },
  {
    value: "icu",
    label: "ICU / Critical Care",
    servicePrompt: "The student is in the ICU. Prioritize physiology, organ support, ventilator and vasopressor management, and SCCM guidance."
  },
  {
    value: "cards",
    label: "Cardiology",
    servicePrompt: "The student is on cardiology. Prioritize ACS/heart failure/arrhythmia management with precise dosing, grounded in ACC/AHA guidance."
  }
];

export function chatServiceOption(value) {
  return CHAT_SERVICE_OPTIONS.find((option) => option.value === String(value || "")) || CHAT_SERVICE_OPTIONS[0];
}

// The rigorous system prompt: every medical fact cited, service-tailored,
// PHI-safe, and honest about uncertainty. This is the prompt the student
// never has to write — it is fixed so the rigor guarantee holds.
export function buildRemoteChatSystemPrompt({ serviceValue } = {}) {
  const service = chatServiceOption(serviceValue);
  return [
    "You are a rigorous clinical teaching assistant helping a medical student" +
      (service.value ? ` on the ${service.label} service.` : "."),
    "",
    "CITATION RULE — the most important rule. Every medical fact you state MUST be accompanied by a citation: each diagnostic criterion, drug name and dose, guideline recommendation, pathophysiologic claim, risk estimate, and statistic. Cite the issuing body and document (for example: [ACOG Practice Bulletin No. 233], [2023 AHA/ACC Heart Failure Guideline], [Williams Obstetrics, 26th ed., Chapter 12]). When web search results are available, cite the specific source for each fact. If you cannot cite a source for a claim, say so explicitly and mark it as clinical reasoning rather than established fact. Never present an uncited claim as established.",
    "",
    `SERVICE FOCUS: ${service.servicePrompt}`,
    "",
    "OTHER RULES:",
    "- The patient context you receive is de-identified. Never attempt to re-identify the patient, and never include identifiers in your reply.",
    "- Teach, don't just answer: explain your reasoning at a medical-student level, prioritizing what matters at the bedside on this service.",
    "- Keep answers focused and structured; lead with the direct answer, then the reasoning and citations.",
    "- This is educational support, not medical advice. Close consequential recommendations with a reminder to verify against primary sources and the primary team."
  ].join("\n");
}

// Assemble the Responses-API input array: fixed system prompt, the kept
// conversation history, then the new user message with any de-identified
// patient context appended. History entries are plain { role, text }.
export function buildRemoteChatInput({ systemPrompt, history = [], userMessage, contextText = "" } = {}) {
  const message = String(userMessage || "").trim();
  const context = String(contextText || "").trim();
  const finalContent = context
    ? `${message}\n\n[De-identified patient context — verified by the student before sending]\n${context}`
    : message;
  return [
    { role: "system", content: String(systemPrompt || "") },
    ...history
      .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
      .map((entry) => ({ role: entry.role, content: String(entry.text || "") })),
    { role: "user", content: finalContent }
  ];
}

// Clinical-preferences variant of the system prompt: the same fixed
// rigorous CITATION RULE and PHI-safety/teaching rules as
// buildRemoteChatSystemPrompt, but the service tailoring is built from the
// student's Settings > Clinical preferences (medical service role, optional
// custom service name, service focus, presentation detail, attending
// preferences, team instructions) instead of the old chatService dropdown.
// The caller appends the student's reviewed custom guidelines under
// "STUDENT'S CUSTOM INSTRUCTIONS:". Pure: no DOM, no storage, no network.
export function buildRemoteChatSystemPromptFromClinicalPreferences({
  medicalService,
  customServiceName,
  serviceFocus,
  presentationDetail,
  attendingPreferences,
  teamInstructions
} = {}) {
  const role = String(medicalService || "").trim().toLowerCase();
  const roleLines = {
    "primary": "You are helping the primary team care for this patient — prioritize the differential diagnosis, workup planning, day-to-day management, and clear sign-out reasoning.",
    "consult": "You are helping the student answer a focused consult question — prioritize the consult ask, targeted recommendations for the primary team, and consult-note-style reasoning.",
    "critical-care": "You are helping the student in critical care — prioritize physiology, organ support, ventilator and vasopressor management, and time-sensitive decisions.",
    "specialty": "You are helping the student on a specialty service — prioritize specialty-specific diagnosis and management with precise, guideline-grounded recommendations."
  };
  const serviceOpt = CHAT_SERVICE_OPTIONS.find((o) => o.value === role);
  const serviceContext = [
    "SERVICE CONTEXT:",
    roleLines[role] ||
      (serviceOpt ? serviceOpt.servicePrompt : null) ||
      "Give balanced, service-agnostic answers appropriate to any inpatient or outpatient setting."
  ];
  const customName = String(customServiceName || "").trim();
  if (customName) {
    serviceContext.push(`The student is on the ${customName} service.`);
  }
  const optionalLines = [
    ["SERVICE FOCUS", serviceFocus],
    ["PRESENTATION DETAIL", presentationDetail],
    ["ATTENDING PREFERENCES", attendingPreferences],
    ["TEAM INSTRUCTIONS", teamInstructions]
  ];
  for (const [label, value] of optionalLines) {
    const text = String(value || "").trim();
    if (text) serviceContext.push(`${label}: ${text}`);
  }
  return [
    "You are a rigorous clinical teaching assistant helping a medical student.",
    "",
    "CITATION RULE — the most important rule. Every medical fact you state MUST be accompanied by a citation: each diagnostic criterion, drug name and dose, guideline recommendation, pathophysiologic claim, risk estimate, and statistic. Cite the issuing body and document (for example: [ACOG Practice Bulletin No. 233], [2023 AHA/ACC Heart Failure Guideline], [Williams Obstetrics, 26th ed., Chapter 12]). When web search results are available, cite the specific source for each fact. If you cannot cite a source for a claim, say so explicitly and mark it as clinical reasoning rather than established fact. Never present an uncited claim as established.",
    "",
    serviceContext.join("\n"),
    "",
    "OTHER RULES:",
    "- The patient context you receive is de-identified. Never attempt to re-identify the patient, and never include identifiers in your reply.",
    "- Teach, don't just answer: explain your reasoning at a medical-student level, prioritizing what matters at the bedside on this service.",
    "- Keep answers focused and structured; lead with the direct answer, then the reasoning and citations.",
    "- This is educational support, not medical advice. Close consequential recommendations with a reminder to verify against primary sources and the primary team."
  ].join("\n");
}

// Conversation compression: shrink a long chat history into one dense summary
// so future requests fit the model's context window and cost fewer tokens.
// The caller passes the CURRENT messages (already de-identified — the remote
// history stores only the reviewed/transformed text, never raw PHI), keeps
// the newest `keepTail` messages verbatim for continuity, and replaces the
// older ones with the returned summary. Pure: no DOM, no storage, no network.
export const COMPRESSION_SYSTEM_PROMPT = [
  "You are compressing a clinical tutoring conversation into a dense summary.",
  "The transcript is already de-identified: never attempt to re-identify anyone,",
  "never invent names, dates, or identifiers, and never add identifiers to the summary.",
  "Write a compact structured summary for a clinician continuing the conversation:",
  "- the student's clinical questions and the key facts established in each exchange,",
  "- any differential diagnoses, workup plans, or management decisions discussed,",
  "- open questions and what the student asked to do next.",
  "Keep it under 400 words. Plain paragraphs and short bullet lists only — no",
  "citations needed, no preamble, no meta-commentary about the summarization task."
].join("\n");

export function buildCompressionInput({ history = [], keepTail = 2 } = {}) {
  const entries = (Array.isArray(history) ? history : [])
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
    .map((entry) => ({ role: entry.role, text: String(entry.text || ""), summary: !!entry.summary }))
    .filter((entry) => entry.text.trim().length > 0);
  const tail = Math.max(0, Math.floor(Number(keepTail) || 0));
  const compressible = tail > 0 ? entries.slice(0, Math.max(0, entries.length - tail)) : entries;
  const keptTail = tail > 0 ? entries.slice(Math.max(0, entries.length - tail)) : [];
  // A prior summary is labeled as such so the model folds it in rather than
  // treating it as a fresh exchange; recompressing never drops history.
  const transcript = compressible
    .map((entry) => `${entry.summary ? "Summary of the earlier conversation" : (entry.role === "user" ? "Student" : "Assistant")}: ${entry.text}`)
    .join("\n\n");
  return {
    input: [
      { role: "system", content: COMPRESSION_SYSTEM_PROMPT },
      { role: "user", content: `Summarize this de-identified tutoring conversation so it can continue from the summary:\n\n${transcript}` }
    ],
    compressibleCount: compressible.length,
    keptTail
  };
}
