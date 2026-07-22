import { addGuidelineSet, guidelineSetMatchesQuery, removeGuidelineSet, saveGuidelineSets, updateGuidelineSet } from "../../prompts/guideline-sets.js";

// CRUD for user-managed documentation-guideline sets - kept out of app.js to
// respect the coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way the
// other controllers in src/ui/ already do.
export function createGuidelineSetsController({ state, setStatus, renderSettings, byId }) {
  function openCreate() {
    state.guidelineCreateDraft = { id: "new-guideline", label: "", token: "", text: "" };
    state.guidelineOpenId = "";
    renderSettings();
    byId("guidelineCreateLabel")?.focus();
  }

  function saveCreate() {
    const label = String(byId("guidelineCreateLabel")?.value || "").trim();
    const text = byId("guidelineCreateText")?.value ?? "";
    if (!label) {
      setStatus("Name the guideline in the editor before saving.");
      byId("guidelineCreateLabel")?.focus();
      return;
    }
    const nextSets = addGuidelineSet(state.guidelineSets, label, text);
    const created = nextSets.at(-1);
    state.guidelineSets = nextSets;
    state.guidelineCreateDraft = null;
    state.guidelineOpenId = created.id;
    saveGuidelineSets(nextSets);
    setStatus(`Added "${label}" guidelines.`);
    renderSettings();
  }

  function cancelCreate() {
    state.guidelineCreateDraft = null;
    renderSettings();
  }

  function saveEdit(id) {
    const label = byId(`guidelineSetLabel-${id}`)?.value;
    const text = byId(`guidelineSetText-${id}`)?.value ?? "";
    state.guidelineSets = updateGuidelineSet(state.guidelineSets, id, { label, text });
    state.guidelineOpenId = id;
    saveGuidelineSets(state.guidelineSets);
    setStatus("Guidelines saved.");
    renderSettings();
  }

  function toggleOpen(id) {
    state.guidelineOpenId = state.guidelineOpenId === id ? "" : id;
    renderSettings();
  }

  function requestRemove(id) {
    state.pendingRemoveGuidelineSetId = id;
    state.pendingRemoveGuidelineSetIds = [];
    const text = byId("removeGuidelineSetConfirmText");
    if (text) text.textContent = "This permanently removes the saved guidelines and its variable token. Any template referencing that token will show it unresolved.";
    byId("removeGuidelineSetConfirmDialog")?.showModal();
  }

  function confirmRemovePending() {
    const ids = state.pendingRemoveGuidelineSetIds || [];
    if (ids.length) {
      state.guidelineSets = state.guidelineSets.filter((set) => !ids.includes(set.id));
      saveGuidelineSets(state.guidelineSets);
      state.pendingRemoveGuidelineSetIds = [];
      state.guidelineSelectedIds.clear();
      byId("removeGuidelineSetConfirmDialog")?.close();
      setStatus(`Deleted ${ids.length} guideline${ids.length === 1 ? "" : "s"}.`);
      renderSettings();
      return;
    }
    const id = state.pendingRemoveGuidelineSetId;
    if (!id) return;
    state.guidelineSets = removeGuidelineSet(state.guidelineSets, id);
    state.guidelineSelectedIds.delete(id);
    saveGuidelineSets(state.guidelineSets);
    state.pendingRemoveGuidelineSetId = "";
    state.pendingRemoveGuidelineSetIds = [];
    byId("removeGuidelineSetConfirmDialog")?.close();
    setStatus("Guideline set deleted.");
    renderSettings();
  }

  function setSearchQuery(value) {
    state.guidelineSearchQuery = String(value || "");
    const query = state.guidelineSearchQuery.trim().toLowerCase();
    const visibleIds = new Set(state.guidelineSets.filter((set) => guidelineSetMatchesQuery(set, query)).map((set) => set.id));
    for (const id of state.guidelineSelectedIds) {
      if (!visibleIds.has(id)) state.guidelineSelectedIds.delete(id);
    }
    renderSettings();
    const input = byId("guidelineSearchInput");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function toggleSelection(id, selected) {
    if (selected) state.guidelineSelectedIds.add(id);
    else state.guidelineSelectedIds.delete(id);
    renderSettings();
  }

  function selectAllVisible() {
    const query = state.guidelineSearchQuery.trim().toLowerCase();
    for (const set of state.guidelineSets) {
      if (guidelineSetMatchesQuery(set, query)) state.guidelineSelectedIds.add(set.id);
    }
    renderSettings();
  }

  function clearSelection() {
    state.guidelineSelectedIds.clear();
    renderSettings();
  }

  function deleteSelected() {
    const ids = state.guidelineSelectedIds;
    if (!ids.size) return;
    state.pendingRemoveGuidelineSetIds = [...ids];
    const text = byId("removeGuidelineSetConfirmText");
    if (text) text.textContent = `This permanently removes ${ids.size} selected guideline${ids.size === 1 ? "" : "s"} and its variable token${ids.size === 1 ? "" : "s"}. Any template referencing those tokens will show them unresolved.`;
    byId("removeGuidelineSetConfirmDialog")?.showModal();
  }

  return Object.freeze({ openCreate, saveCreate, cancelCreate, saveEdit, toggleOpen, requestRemove, confirmRemovePending, setSearchQuery, toggleSelection, selectAllVisible, clearSelection, deleteSelected });
}
