export const CENSUS_SCHEMA_VERSION = 1;
export const CENSUS_EXPORT_TYPE = "prerounds-census-export";
export const CENSUS_STORAGE_TYPE = "prerounds-census-vault";
export const CENSUS_KDF_ITERATIONS = 250000;

export const patientStatusLabels = {
  needsChartInfo: "Needs chart info",
  promptCopied: "Prompt copied",
  checklistReady: "Checklist ready",
  bedsideDone: "Bedside done",
  updateReady: "Update ready"
};

const textFields = [
  "alias",
  "roomBed",
  "serviceProblem",
  "sourceMode",
  "scrubbedNote",
  "checklistRawText",
  "compiledText",
  "outputMode",
  "conversationCaseKey",
  "continuityCaseId",
  "lifecycleStatus",
  "createdAt",
  "updatedAt",
  "lastOpenedAt"
];

const booleanFields = [
  "highPriority",
  "seenToday",
  "promptCollapsed",
  "checklistFirstMode",
  "initialRoundsPromptCopied",
  "checklistPromptCopied",
  "bedsideFindingsReady",
  "conversationContextReady",
  "conversationChecklistReady",
  "conversationFinalReady"
];

function fallbackId(prefix = "patient") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

export const deidentifiedSourceSectionTypes = ["note", "labs", "handoff", "mar", "general"];

export function normalizeDeidentifiedSourceSections(value = {}) {
  return deidentifiedSourceSectionTypes.reduce((sections, key) => {
    sections[key] = String(value?.[key] || "").trim();
    return sections;
  }, {});
}

export function deidentifiedSourceText(patient = {}) {
  const sections = normalizeDeidentifiedSourceSections(patient.deidentifiedSourceSections || {});
  const labels = {
    note: "De-identified note",
    labs: "De-identified labs/results",
    handoff: "De-identified handoff/events",
    mar: "De-identified medication orders/MAR",
    general: "De-identified context"
  };
  return deidentifiedSourceSectionTypes
    .map((key) => sections[key] ? `${labels[key]}:\n${sections[key]}` : "")
    .filter(Boolean)
    .join("\n\n");
}

export function stripRawPatientFields(patient = {}) {
  const stripped = { ...patient };
  delete stripped.rawSoapNote;
  delete stripped.rawLabs;
  delete stripped.rawHandoff;
  delete stripped.rawMedicationText;
  return stripped;
}

export function createPatientCase(values = {}, now = new Date()) {
  const createdAt = values.createdAt || isoNow(now);
  return normalizePatientCase({
    id: values.id || fallbackId(),
    alias: values.alias || "Patient A",
    roomBed: values.roomBed || "",
    serviceProblem: values.serviceProblem || "",
    highPriority: Boolean(values.highPriority),
    seenToday: Boolean(values.seenToday),
    createdAt,
    updatedAt: values.updatedAt || createdAt,
    lastOpenedAt: values.lastOpenedAt || "",
    lifecycleStatus: values.lifecycleStatus || "active",
    continuityCaseId: values.continuityCaseId || "",
    sourceMode: values.sourceMode || "prior",
    scrubbedNote: values.scrubbedNote || "",
    deidentifiedSourceSections: values.deidentifiedSourceSections || {},
    scrubResult: values.scrubResult || null,
    admission: values.admission || {},
    importedContext: values.importedContext || null,
    promptCollapsed: Boolean(values.promptCollapsed),
    checklistFirstMode: Boolean(values.checklistFirstMode),
    checklistRawText: values.checklistRawText || "",
    checklistText: values.checklistText || "",
    sections: values.sections || [],
    answers: values.answers || {},
    notes: values.notes || {},
    activeChecklistView: values.activeChecklistView || "bedside",
    activeSection: values.activeSection || "all",
    collapsedSections: values.collapsedSections || {},
    auditResult: values.auditResult || null,
    outputMode: values.outputMode || "assessed",
    compiledText: values.compiledText || "",
    conversationCaseKey: values.conversationCaseKey || "",
    initialRoundsPromptCopied: Boolean(values.initialRoundsPromptCopied),
    checklistPromptCopied: Boolean(values.checklistPromptCopied),
    bedsideFindingsReady: Boolean(values.bedsideFindingsReady),
    conversationContextReady: Boolean(values.conversationContextReady),
    conversationChecklistReady: Boolean(values.conversationChecklistReady),
    conversationFinalReady: Boolean(values.conversationFinalReady),
    activePacketFlow: values.activePacketFlow || null,
    assignedSnippets: values.assignedSnippets || []
  });
}

export function normalizePatientCase(patient = {}) {
  const sourceSections = normalizeDeidentifiedSourceSections(patient.deidentifiedSourceSections || {});
  const normalized = {
    id: cleanText(patient.id) || fallbackId(),
    admission: {},
    importedContext: patient.importedContext || null,
    scrubResult: patient.scrubResult || null,
    deidentifiedSourceSections: sourceSections,
    sections: Array.isArray(patient.sections) ? patient.sections : [],
    answers: patient.answers && typeof patient.answers === "object" ? { ...patient.answers } : {},
    notes: patient.notes && typeof patient.notes === "object" ? { ...patient.notes } : {},
    activeChecklistView: patient.activeChecklistView || "bedside",
    activeSection: patient.activeSection || "all",
    collapsedSections: patient.collapsedSections && typeof patient.collapsedSections === "object" ? { ...patient.collapsedSections } : {},
    auditResult: patient.auditResult || null,
    activePacketFlow: patient.activePacketFlow || null,
    assignedSnippets: Array.isArray(patient.assignedSnippets) ? patient.assignedSnippets : []
  };

  textFields.forEach((field) => {
    normalized[field] = String(patient[field] || "");
  });
  booleanFields.forEach((field) => {
    normalized[field] = Boolean(patient[field]);
  });

  normalized.alias = cleanText(normalized.alias) || "Patient";
  normalized.lifecycleStatus = normalized.lifecycleStatus === "discharged" ? "discharged" : "active";
  normalized.sourceMode = ["admission", "continuity"].includes(normalized.sourceMode) ? normalized.sourceMode : "prior";
  normalized.outputMode = normalized.outputMode === "full" ? "full" : "assessed";
  normalized.checklistText = String(patient.checklistText || patient.checklistRawText || "");
  normalized.rawSoapNote = "";
  normalized.rawLabs = "";
  normalized.rawHandoff = "";
  normalized.rawMedicationText = "";
  normalized.updatedAt = normalized.updatedAt || normalized.createdAt || isoNow();
  normalized.createdAt = normalized.createdAt || normalized.updatedAt;
  return normalized;
}

export function normalizeCensusVault(vault = {}) {
  const patients = Array.isArray(vault.patients)
    ? vault.patients.map((patient) => normalizePatientCase(patient))
      .filter((patient) => patient.lifecycleStatus !== "discharged")
    : [];
  const continuityCases = Array.isArray(vault.continuityCases)
    ? vault.continuityCases.map((patientCase) => (
      patientCase && typeof patientCase === "object" ? { ...patientCase } : patientCase
    ))
    : [];
  const activePatientId = patients.some((patient) => patient.id === vault.activePatientId)
    ? vault.activePatientId
    : patients[0]?.id || "";
  const activeContinuityCaseId = continuityCases.some((patientCase) => patientCase?.id === vault.activeContinuityCaseId)
    ? vault.activeContinuityCaseId
    : continuityCases[0]?.id || "";

  return {
    schemaVersion: CENSUS_SCHEMA_VERSION,
    createdAt: vault.createdAt || isoNow(),
    updatedAt: vault.updatedAt || isoNow(),
    activePatientId,
    activeContinuityCaseId,
    continuityCases,
    patients
  };
}

export function hasSourceContext(patient) {
  const normalized = normalizePatientCase(patient);
  return Boolean(
    normalized.scrubbedNote.trim() ||
    deidentifiedSourceText(normalized).trim() ||
    normalized.importedContext?.text
  );
}

export function derivePatientStatus(patient) {
  const normalized = normalizePatientCase(patient);
  if (normalized.conversationFinalReady) {
    return patientStatusLabels.updateReady;
  }
  if (normalized.compiledText.trim() || normalized.bedsideFindingsReady) {
    return patientStatusLabels.bedsideDone;
  }
  if (normalized.sections.length || normalized.checklistRawText.trim() || normalized.checklistText.trim()) {
    return patientStatusLabels.checklistReady;
  }
  if (
    normalized.initialRoundsPromptCopied ||
    normalized.checklistPromptCopied ||
    normalized.conversationContextReady ||
    normalized.conversationChecklistReady ||
    normalized.activePacketFlow
  ) {
    return patientStatusLabels.promptCopied;
  }
  return patientStatusLabels.needsChartInfo;
}

export function nextPromptForPatient(patient) {
  const normalized = normalizePatientCase(patient);
  if (normalized.conversationFinalReady) {
    return null;
  }
  if (normalized.activePacketFlow?.prompts?.length) {
    const index = Math.min(
      Number(normalized.activePacketFlow.index) || 0,
      normalized.activePacketFlow.prompts.length - 1
    );
    const prompt = normalized.activePacketFlow.prompts[index];
    return {
      kind: "packet",
      label: prompt?.label || `Message ${index + 1}`,
      patientId: normalized.id,
      patientAlias: normalized.alias,
      queueLabel: `${normalized.alias}: ${prompt?.label || `Message ${index + 1}`}`
    };
  }
  if (normalized.compiledText.trim() && !normalized.conversationFinalReady) {
    return {
      kind: "update",
      label: "Update prompt",
      patientId: normalized.id,
      patientAlias: normalized.alias,
      queueLabel: `${normalized.alias}: update`
    };
  }
  if (hasSourceContext(normalized) && !(normalized.initialRoundsPromptCopied || normalized.conversationContextReady)) {
    return {
      kind: "initial",
      label: "Initial report prompt",
      patientId: normalized.id,
      patientAlias: normalized.alias,
      queueLabel: `${normalized.alias}: initial report`
    };
  }
  if (
    hasSourceContext(normalized) &&
    (normalized.initialRoundsPromptCopied || normalized.conversationContextReady) &&
    !(normalized.checklistPromptCopied || normalized.conversationChecklistReady)
  ) {
    return {
      kind: "checklist",
      label: "Checklist prompt",
      patientId: normalized.id,
      patientAlias: normalized.alias,
      queueLabel: `${normalized.alias}: checklist`
    };
  }
  return null;
}

function patientSortKey(patient) {
  const room = cleanText(patient.roomBed).toLowerCase();
  const alias = cleanText(patient.alias).toLowerCase();
  return `${patient.highPriority ? "0" : "1"}|${room || "zzzz"}|${alias}`;
}

export function filterPatients(patients, filters = {}) {
  return patients.filter((patient) => {
    if (patient.lifecycleStatus === "discharged") {
      return false;
    }
    const status = derivePatientStatus(patient);
    if (filters.needsBedside && !(status === patientStatusLabels.checklistReady || status === patientStatusLabels.promptCopied)) {
      return false;
    }
    if (filters.needsUpdate && status !== patientStatusLabels.bedsideDone) {
      return false;
    }
    if (filters.highPriority && !patient.highPriority) {
      return false;
    }
    if (filters.seenToday && !patient.seenToday) {
      return false;
    }
    return true;
  });
}

export function buildPromptQueue(patients, filters = {}) {
  return filterPatients(patients.map((patient) => normalizePatientCase(patient)), filters)
    .sort((a, b) => patientSortKey(a).localeCompare(patientSortKey(b), undefined, { numeric: true }))
    .map((patient) => nextPromptForPatient(patient))
    .filter(Boolean);
}

export function parseBatchSnippetBlocks(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*(?:---+|={3,}|Patient\s+\d+\s*:?)\s*\n|\n{3,}/i)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((textValue, index) => ({
      id: `snippet-${index + 1}`,
      label: `Snippet ${index + 1}`,
      type: "general",
      patientId: "",
      text: textValue
    }));
}

export function appendSnippetToPatient(patient, snippet, scrubbedText, now = new Date()) {
  const normalized = normalizePatientCase(patient);
  const type = snippet.type || "general";
  const targetField = type === "note"
    ? "note"
    : type === "labs"
      ? "labs"
      : type === "handoff"
        ? "handoff"
        : type === "mar"
          ? "mar"
          : "general";
  const heading = type === "general" ? "Batch snippet" : `Batch ${type}`;
  const rawText = String(snippet.text || "").trim();
  const redactedText = String(scrubbedText || "").trim();
  if (redactedText) {
    normalized.deidentifiedSourceSections[targetField] = [
      normalized.deidentifiedSourceSections[targetField],
      redactedText
    ].filter(Boolean).join("\n\n");
    normalized.scrubbedNote = [normalized.scrubbedNote, `${heading}:\n${redactedText}`].filter(Boolean).join("\n\n");
  }
  normalized.assignedSnippets = [
    ...normalized.assignedSnippets,
    {
      id: snippet.id || fallbackId("snippet"),
      type,
      assignedAt: isoNow(now),
      rawCharacterCount: rawText.length,
      scrubbedCharacterCount: redactedText.length
    }
  ];
  normalized.updatedAt = isoNow(now);
  return normalized;
}

export function removePatientAndSelectNext(patients = [], patientId = "", activePatientId = "") {
  const normalizedPatients = patients.map((patient) => normalizePatientCase(patient));
  const removedIndex = normalizedPatients.findIndex((patient) => patient.id === patientId);
  const remaining = normalizedPatients.filter((patient) => patient.id !== patientId);
  let nextActivePatientId = activePatientId === patientId ? "" : activePatientId;
  if (!nextActivePatientId || !remaining.some((patient) => patient.id === nextActivePatientId)) {
    const nextIndex = Math.min(Math.max(removedIndex, 0), remaining.length - 1);
    nextActivePatientId = remaining[nextIndex]?.id || "";
  }
  return {
    patients: remaining,
    activePatientId: nextActivePatientId,
    removedPatient: removedIndex >= 0 ? normalizedPatients[removedIndex] : null
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveVaultKey(secret, salt, usage, iterations) {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

export async function encryptJsonPayload(payload, secret, options = {}) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is required for encrypted census storage.");
  }
  const type = options.type || CENSUS_STORAGE_TYPE;
  const schemaVersion = options.schemaVersion || CENSUS_SCHEMA_VERSION;
  const iterations = options.iterations || CENSUS_KDF_ITERATIONS;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveVaultKey(secret, salt, ["encrypt"], iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    type,
    schemaVersion,
    createdAt: isoNow(),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: bytesToBase64(salt)
    },
    encryption: {
      name: "AES-GCM",
      iv: bytesToBase64(iv)
    },
    payload: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptJsonPayload(envelope, secret, options = {}) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is required for encrypted census storage.");
  }
  const expectedType = options.type || envelope?.type;
  const expectedSchemaVersion = options.schemaVersion || CENSUS_SCHEMA_VERSION;
  if (!envelope || envelope.type !== expectedType || envelope.schemaVersion !== expectedSchemaVersion) {
    throw new Error("This is not a compatible encrypted census file.");
  }
  const salt = base64ToBytes(envelope.kdf?.salt);
  const iv = base64ToBytes(envelope.encryption?.iv);
  const ciphertext = base64ToBytes(envelope.payload);
  const key = await deriveVaultKey(secret, salt, ["decrypt"], Number(envelope.kdf?.iterations) || CENSUS_KDF_ITERATIONS);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
