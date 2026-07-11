export const WORKUP_SYSTEMS = Object.freeze([
  Object.freeze({ id: "general", label: "General" }),
  Object.freeze({ id: "constitutional", label: "Constitutional" }),
  Object.freeze({ id: "eyes", label: "Eyes" }),
  Object.freeze({ id: "ent", label: "Ears, nose, mouth, and throat" }),
  Object.freeze({ id: "cardiovascular", label: "Cardiovascular" }),
  Object.freeze({ id: "respiratory", label: "Respiratory" }),
  Object.freeze({ id: "gastrointestinal", label: "Gastrointestinal" }),
  Object.freeze({ id: "genitourinary", label: "Genitourinary" }),
  Object.freeze({ id: "musculoskeletal", label: "Musculoskeletal" }),
  Object.freeze({ id: "skin", label: "Skin and soft tissue" }),
  Object.freeze({ id: "neurologic", label: "Neurologic" }),
  Object.freeze({ id: "psychiatric", label: "Psychiatric" }),
  Object.freeze({ id: "endocrine", label: "Endocrine and metabolic" }),
  Object.freeze({ id: "hematologic", label: "Hematologic / lymphatic / immunologic" }),
  Object.freeze({ id: "infectious", label: "Infectious disease and exposures" }),
  Object.freeze({ id: "medication", label: "Medication and substance use" }),
  Object.freeze({ id: "functional", label: "Functional and social" }),
  Object.freeze({ id: "reproductive", label: "Reproductive" })
]);

export const WORKUP_SYSTEM_IDS = Object.freeze(WORKUP_SYSTEMS.map((system) => system.id));

const LABEL_BY_ID = new Map(WORKUP_SYSTEMS.map((system) => [system.id, system.label]));

export const isWorkupSystem = (value) => LABEL_BY_ID.has(String(value || "").trim());

export const workupSystemLabel = (value) => LABEL_BY_ID.get(String(value || "").trim()) || "";

export const workupSystemPromptList = () => WORKUP_SYSTEMS.map(({ id, label }) => `- ${id}: ${label}`).join("\n");
