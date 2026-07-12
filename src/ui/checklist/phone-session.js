import { emptyChecklistAnswers, addQuickNote, removeQuickNote } from "../../checklist/state.js?v=20260711-functional-remediation-19";
import { updateActivePatient } from "../../app/state/vault.js?v=20260711-functional-remediation-15";
import { upsertDay } from "../../daily-updates/days.js?v=20260711-functional-remediation-15";

// Coordinates the phone-mode checklist session - entering phone-mode,
// autosave/resume, and quick notes (shared between phone and desktop) - kept
// out of app.js to respect the coordinator-file size boundary
// (scripts/check-ui-module-boundaries.js). `state` is the shared app state
// object, mutated directly the same way the rest of app.js's coordinators do.
export function createPhoneSessionController({ phoneAutosave, state, active, selectedChecklistDay, persistVault, renderPhoneChecklist, renderChecklist }) {
  function enterPhoneMode(bundle) {
    state.phoneBundle = bundle;
    state.phoneAnswers = bundle.answers || emptyChecklistAnswers(bundle.checklist);
    state.phoneQuickNotes = bundle.quickNotes || [];
    state.phoneReturnReady = false;
    state.phoneResumeOffer = phoneAutosave.load(bundle.checklist?.id);
  }

  function saveAutosave() {
    phoneAutosave.save(state.phoneBundle?.checklist?.id, { answers: state.phoneAnswers, quickNotes: state.phoneQuickNotes });
  }

  function resumeAutosave() {
    if (!state.phoneResumeOffer) return;
    state.phoneAnswers = state.phoneResumeOffer.answers || state.phoneAnswers;
    state.phoneQuickNotes = state.phoneResumeOffer.quickNotes || state.phoneQuickNotes;
    state.phoneResumeOffer = null;
    renderPhoneChecklist();
  }

  function discardAutosave() {
    phoneAutosave.discard(state.phoneBundle?.checklist?.id);
    state.phoneResumeOffer = null;
    renderPhoneChecklist();
  }

  async function mutateQuickNotes(mutate, statusMessage) {
    if (state.phoneBundle) {
      state.phoneQuickNotes = mutate(state.phoneQuickNotes);
      saveAutosave();
      renderPhoneChecklist();
      return;
    }
    const day = selectedChecklistDay(active());
    if (!day) return;
    const nextDay = { ...day, quickNotes: mutate(day.quickNotes || []), updatedAt: new Date().toISOString() };
    state.vault = updateActivePatient(state.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
    await persistVault(statusMessage);
    renderChecklist();
  }

  async function addQuickNoteText(text) {
    if (!String(text || "").trim()) return;
    await mutateQuickNotes((notes) => addQuickNote(notes, text), "Quick note saved.");
  }

  async function deleteQuickNoteById(noteId) {
    if (!noteId) return;
    await mutateQuickNotes((notes) => removeQuickNote(notes, noteId), "Quick note removed.");
  }

  return Object.freeze({ enterPhoneMode, saveAutosave, resumeAutosave, discardAutosave, addQuickNoteText, deleteQuickNoteById });
}
