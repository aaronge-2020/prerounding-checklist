import { createLocalId, timestampNow } from "../app/state/vault.js";

// User-created prompt templates that go beyond the six fixed OPEN_EVIDENCE_TASKS.
// Stored in plain localStorage - same tier as the per-task template overrides in
// custom-templates.js, not the encrypted vault (these are prompt tooling, not
// patient data).
export const CUSTOM_PROMPT_TASK_STORAGE_KEY = "prerounding_custom_prompt_tasks_v1";

// A custom task's template is not stored here - it lives in the same
// `promptTemplates` override store (custom-templates.js) as built-in task
// overrides, keyed by this task's id, so save/reset plumbing needs no
// custom-vs-built-in branching.
export function createCustomPromptTask(label, { id = createLocalId("prompt_task"), now = timestampNow } = {}) {
  const timestamp = now();
  return {
    id,
    label: String(label || "").trim() || "Custom prompt",
    custom: true,
    requiresGuidelines: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function loadCustomPromptTasks(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOM_PROMPT_TASK_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPromptTasks(tasks, storage = localStorage) {
  storage.setItem(CUSTOM_PROMPT_TASK_STORAGE_KEY, JSON.stringify(tasks || []));
}

export function addCustomPromptTask(tasks, label, options) {
  return [...(tasks || []), createCustomPromptTask(label, options)];
}

export function removeCustomPromptTask(tasks, taskId) {
  return (tasks || []).filter((task) => task.id !== taskId);
}

export function allPromptTasks(builtInTasks = [], customTasks = []) {
  return [...builtInTasks, ...customTasks];
}
