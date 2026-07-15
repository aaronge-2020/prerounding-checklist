import { effectiveWorkupCatalog, isBundledWorkupId } from "../../workups/schema.js";
import { hideWorkupId, removeWorkupOverride, setSelectedWorkups, unhideWorkupId } from "../../app/state/vault.js";

// Workup delete/restore CRUD, kept out of app.js to respect the
// coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way the
// other controllers in src/ui/ already do. A bundled (built-in) workup can't
// really be deleted - its definition ships with the app - so deleting one
// hides it from the catalog instead, restorable later; a purely local
// workup (no bundled definition backing it) is gone for good once deleted.
export function createWorkupDeleteController({ state, renderWorkups, persistWorkupChanges, byId }) {
  function requestDelete(workupId) {
    const catalog = effectiveWorkupCatalog(state.vault.workupOverrides, state.vault.hiddenWorkupIds);
    const workup = catalog.find((entry) => entry.id === workupId);
    if (!workup) return;
    const bundled = isBundledWorkupId(workupId);
    state.pendingDeleteWorkupId = workupId;
    const text = byId("deleteWorkupConfirmText");
    if (text) {
      text.textContent = bundled
        ? `This removes "${workup.title}" from your workup catalog. You can restore this built-in workup anytime from the catalog menu.`
        : `This permanently deletes "${workup.title}" and its saved items. This can't be undone.`;
    }
    const confirmButton = byId("confirmDeleteWorkupButton");
    if (confirmButton) confirmButton.textContent = bundled ? "Remove workup" : "Delete workup";
    byId("deleteWorkupConfirmDialog")?.showModal();
  }

  async function confirmDeletePending() {
    const workupId = state.pendingDeleteWorkupId;
    if (!workupId) return;
    const bundled = isBundledWorkupId(workupId);
    state.vault = removeWorkupOverride(state.vault, workupId);
    if (bundled) state.vault = hideWorkupId(state.vault, workupId);
    state.vault = setSelectedWorkups(state.vault, state.vault.selectedWorkupIds.filter((id) => id !== workupId));
    if (state.selectedWorkupEditorId === workupId) state.selectedWorkupEditorId = "";
    state.draftWorkup = null;
    state.pendingDeleteWorkupId = "";
    byId("deleteWorkupConfirmDialog")?.close();
    await persistWorkupChanges(bundled ? "Workup removed from catalog. Restore it anytime from the catalog menu." : "Workup deleted.");
    renderWorkups();
  }

  async function restoreHidden(workupId) {
    state.vault = unhideWorkupId(state.vault, workupId);
    await persistWorkupChanges("Workup restored to catalog.");
    renderWorkups();
  }

  return Object.freeze({ requestDelete, confirmDeletePending, restoreHidden });
}
