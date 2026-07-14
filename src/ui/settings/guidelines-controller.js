import { addGuidelineSet, removeGuidelineSet, saveGuidelineSets, updateGuidelineSet } from "../../prompts/guideline-sets.js";

// CRUD for user-managed documentation-guideline sets - kept out of app.js to
// respect the coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way the
// other controllers in src/ui/ already do.
export function createGuidelineSetsController({ state, setStatus, renderSettings, byId }) {
  function createFromInput() {
    const input = byId("newGuidelineSetNameInput");
    const label = String(input?.value || "").trim();
    if (!label) throw new Error("Name the new guideline set before adding it.");
    const nextSets = addGuidelineSet(state.guidelineSets, label);
    state.guidelineSets = nextSets;
    saveGuidelineSets(nextSets);
    if (input) input.value = "";
    setStatus(`Added "${label}" guidelines - insert ${nextSets.at(-1).token} into any prompt template to use it.`);
    renderSettings();
  }

  function saveEdit(id) {
    const label = byId(`guidelineSetLabel-${id}`)?.value;
    const text = byId(`guidelineSetText-${id}`)?.value ?? "";
    state.guidelineSets = updateGuidelineSet(state.guidelineSets, id, { label, text });
    saveGuidelineSets(state.guidelineSets);
    setStatus("Guidelines saved.");
    renderSettings();
  }

  function requestRemove(id) {
    state.pendingRemoveGuidelineSetId = id;
    byId("removeGuidelineSetConfirmDialog")?.showModal();
  }

  function confirmRemovePending() {
    const id = state.pendingRemoveGuidelineSetId;
    if (!id) return;
    state.guidelineSets = removeGuidelineSet(state.guidelineSets, id);
    saveGuidelineSets(state.guidelineSets);
    state.pendingRemoveGuidelineSetId = "";
    byId("removeGuidelineSetConfirmDialog")?.close();
    setStatus("Guideline set deleted.");
    renderSettings();
  }

  return Object.freeze({ createFromInput, saveEdit, requestRemove, confirmRemovePending });
}
