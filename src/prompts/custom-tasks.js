import { createLocalId, timestampNow } from "../app/state/vault.js";
import { createGuidelineSet, isCustomGuidelineSet } from "./guideline-sets.js?v=20260819-one-to-one-task-guidelines";

// Legacy prompt-only records. New user-created prompts live directly in the
// guideline-set store so Settings and the OpenEvidence dropdown cannot drift.
export const CUSTOM_PROMPT_TASK_STORAGE_KEY = "prerounding_custom_prompt_tasks_v1";

// These helpers remain only for deterministic migration and regression tests.
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

// User-created prompts and Settings guidelines are the same record. The
// dropdown derives its custom entries from guideline sets instead of keeping
// a second independently editable task list.
export function guidelinePromptTasks(guidelineSets = []) {
  return (guidelineSets || []).filter(isCustomGuidelineSet).map((set) => ({
    id: set.id,
    label: set.label,
    custom: true,
    guidelineSetId: set.id,
    requiresGuidelines: true
  }));
}

// Deterministically fold records created by the former prompt-only UI into
// guideline sets. Callers persist the returned records, then clear the legacy
// task store so guidelineSets remains the sole source of truth.
export function migrateCustomPromptTasksToGuidelineSets(guidelineSets = [], customTasks = [], promptTemplates = {}) {
  const next = [...(guidelineSets || [])];
  const existingIds = new Set(next.map((set) => set.id));
  for (const task of customTasks || []) {
    if (!task?.id || existingIds.has(task.id)) continue;
    next.push(createGuidelineSet(task.label, promptTemplates?.[task.id] || "", {
      id: task.id,
      existingTokens: next.map((set) => set.token)
    }));
    existingIds.add(task.id);
  }
  return next;
}
