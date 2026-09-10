import { addGuidelineSet, guidelineSetMatchesQuery, removeGuidelineSet, restoreLatestDefaultGuidelineSets, saveGuidelineSets, updateGuidelineSet } from "../../prompts/guideline-sets.js?v=20260910-pre-op-prep";
import { guidelinePageModel } from "./guideline-pagination.js?v=20260910-guideline-pagination";

// CRUD for user-managed documentation-guideline sets - kept out of app.js to
// respect the coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way the
// other controllers in src/ui/ already do.
export function createGuidelineSetsController({ state, setStatus, renderSettings, renderPrompts, byId }) {
  function renderGuidelineChanges() {
    renderSettings();
    // Keep the prompt builder's already-rendered smart-variable menu in sync
    // when a guideline is changed from Settings before the user returns to it.
    renderPrompts?.();
  }

  function normalizePage() {
    state.guidelinePage = guidelinePageModel(state.guidelineSets, {
      searchQuery: state.guidelineSearchQuery,
      page: state.guidelinePage
    }).currentPage;
  }

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
    state.guidelineSearchQuery = "";
    state.guidelinePage = guidelinePageModel(nextSets, { page: Number.MAX_SAFE_INTEGER }).currentPage;
    saveGuidelineSets(nextSets);
    setStatus(`Added "${label}" guidelines.`);
    renderGuidelineChanges();
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
    renderGuidelineChanges();
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
      normalizePage();
      byId("removeGuidelineSetConfirmDialog")?.close();
      setStatus(`Deleted ${ids.length} guideline${ids.length === 1 ? "" : "s"}.`);
      renderGuidelineChanges();
      return;
    }
    const id = state.pendingRemoveGuidelineSetId;
    if (!id) return;
    state.guidelineSets = removeGuidelineSet(state.guidelineSets, id);
    state.guidelineSelectedIds.delete(id);
    saveGuidelineSets(state.guidelineSets);
    state.pendingRemoveGuidelineSetId = "";
    state.pendingRemoveGuidelineSetIds = [];
    normalizePage();
    byId("removeGuidelineSetConfirmDialog")?.close();
    setStatus("Guideline set deleted.");
    renderGuidelineChanges();
  }

  function setSearchQuery(value) {
    state.guidelineSearchQuery = String(value || "");
    state.guidelinePage = 1;
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
    const { pageSets } = guidelinePageModel(state.guidelineSets, {
      searchQuery: state.guidelineSearchQuery,
      page: state.guidelinePage
    });
    for (const set of pageSets) state.guidelineSelectedIds.add(set.id);
    renderSettings();
  }

  function deselectVisible() {
    const { pageSets } = guidelinePageModel(state.guidelineSets, {
      searchQuery: state.guidelineSearchQuery,
      page: state.guidelinePage
    });
    for (const set of pageSets) state.guidelineSelectedIds.delete(set.id);
    renderSettings();
  }

  function showPage(value) {
    state.guidelinePage = guidelinePageModel(state.guidelineSets, {
      searchQuery: state.guidelineSearchQuery,
      page: value
    }).currentPage;
    state.guidelineOpenId = "";
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

  function requestRefreshDefaults() {
    byId("refreshDefaultGuidelinesConfirmDialog")?.showModal();
  }

  async function confirmRefreshDefaults() {
    const button = byId("confirmRefreshDefaultGuidelinesButton");
    if (button) button.disabled = true;
    setStatus("Downloading the latest built-in prompts…");
    try {
      state.guidelineSets = await restoreLatestDefaultGuidelineSets(state.guidelineSets);
      state.guidelineOpenId = "";
      state.guidelineSelectedIds.clear();
      state.guidelinePage = 1;
      byId("refreshDefaultGuidelinesConfirmDialog")?.close();
      setStatus("Built-in prompts updated from this site. Local built-in edits were replaced; custom guidelines were preserved.");
      renderGuidelineChanges();
    } catch (error) {
      setStatus(error instanceof Error ? `${error.message} No local prompts were changed.` : "Prompt update failed. No local prompts were changed.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function handleAction(action, target) {
    if (action === "create-guideline-set") openCreate();
    if (action === "save-new-guideline-set") saveCreate();
    if (action === "cancel-new-guideline") cancelCreate();
    if (action === "toggle-guideline-set") toggleOpen(target.dataset.guidelineSetId);
    if (action === "save-guideline-set") saveEdit(target.dataset.guidelineSetId);
    if (action === "request-remove-guideline-set") requestRemove(target.dataset.guidelineSetId);
    if (action === "confirm-remove-guideline-set") confirmRemovePending();
    if (action === "delete-selected-guidelines") deleteSelected();
    if (action === "clear-guideline-selection") clearSelection();
    if (action === "show-guideline-page") showPage(target.dataset.guidelinePage);
    if (action === "request-refresh-default-guidelines") requestRefreshDefaults();
    if (action === "confirm-refresh-default-guidelines") await confirmRefreshDefaults();
  }

  return Object.freeze({ handleAction, setSearchQuery, toggleSelection, selectAllVisible, deselectVisible });
}
