import assert from "node:assert/strict";
import {
  createCustomPromptTask,
  loadCustomPromptTasks,
  saveCustomPromptTasks,
  addCustomPromptTask,
  removeCustomPromptTask,
  allPromptTasks,
  CUSTOM_PROMPT_TASK_STORAGE_KEY
} from "../src/prompts/custom-tasks.js";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
}

// createCustomPromptTask shape.
{
  const task = createCustomPromptTask("  My teaching note  ", { id: "prompt_task_fixed", now: () => "2026-07-13T00:00:00.000Z" });
  assert.deepEqual(task, {
    id: "prompt_task_fixed",
    label: "My teaching note",
    custom: true,
    requiresGuidelines: false,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z"
  });
  assert.equal(createCustomPromptTask("   ").label, "Custom prompt", "a blank label falls back to a generic name");
}

// load/save round trip against a fake localStorage, with a safe fallback on malformed data.
{
  const storage = fakeStorage();
  assert.deepEqual(loadCustomPromptTasks(storage), [], "no saved tasks yet");
  const tasks = addCustomPromptTask([], "Discharge summary", { id: "prompt_task_1", now: () => "2026-07-13T00:00:00.000Z" });
  saveCustomPromptTasks(tasks, storage);
  assert.deepEqual(loadCustomPromptTasks(storage), tasks);

  storage.setItem(CUSTOM_PROMPT_TASK_STORAGE_KEY, "not json");
  assert.deepEqual(loadCustomPromptTasks(storage), [], "malformed storage falls back to an empty list rather than throwing");

  storage.setItem(CUSTOM_PROMPT_TASK_STORAGE_KEY, JSON.stringify({ not: "an array" }));
  assert.deepEqual(loadCustomPromptTasks(storage), [], "a non-array value also falls back to an empty list");
}

// add/remove.
{
  let tasks = addCustomPromptTask([], "Task A", { id: "a" });
  tasks = addCustomPromptTask(tasks, "Task B", { id: "b" });
  assert.equal(tasks.length, 2);
  tasks = removeCustomPromptTask(tasks, "a");
  assert.deepEqual(tasks.map((t) => t.id), ["b"]);
  assert.deepEqual(removeCustomPromptTask(tasks, "does-not-exist"), tasks, "removing an unknown id is a no-op");
}

// allPromptTasks merges built-ins with custom tasks, built-ins first.
{
  const builtIns = [{ id: "initial_admission_rounds", label: "Initial admission rounds" }];
  const customTasks = addCustomPromptTask([], "My custom prompt", { id: "prompt_task_custom" });
  const merged = allPromptTasks(builtIns, customTasks);
  assert.deepEqual(merged.map((t) => t.id), ["initial_admission_rounds", "prompt_task_custom"]);
}

console.log("Custom prompt task tests passed");
