import { applyChecklistAnswerImport, buildChecklistAnswerImportPrompt } from "../../checklist/openevidence-import.js";

// Coordinates "paste an OpenEvidence note, de-identify it locally, then let
// ChatGPT fill in checklist answers" - kept out of app.js to respect the
// coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way
// phone-session.js and the workup-import handlers in app.js already do.
export function createOpenEvidenceImportController({
  state,
  active,
  selectedChecklistDay,
  persistVault,
  renderChecklist,
  byId,
  copyText,
  setStatus,
  currentPreferences,
  deidentify,
  ensureDeidReady,
  formatChecklistAnswersWithOpenAi,
  saveExamFindings,
  clearExamFindings
}) {
  function currentSnapshot() {
    return selectedChecklistDay(active())?.checklistSnapshot || null;
  }

  function currentInput() {
    return byId("openEvidenceImportInput")?.value ?? state.openEvidenceImport.input;
  }

  function resetPanel() {
    state.openEvidenceImport = { input: "", busy: false, deidBusy: false, error: "", deidConfirmed: false, deidStatus: "", deidResidualWarnings: [] };
  }

  async function runLocalDeid() {
    const text = currentInput();
    state.openEvidenceImport.input = text;
    if (!text.trim()) return;
    state.openEvidenceImport.error = "";
    state.openEvidenceImport.deidBusy = true;
    // Load/download/verify the selected model automatically instead of
    // requiring a separate trip to Settings first - a no-op once a model is
    // already loaded, so repeat de-identifications don't reload anything.
    state.openEvidenceImport.deidStatus = "Preparing local model...";
    renderChecklist();
    try {
      await ensureDeidReady?.();
    } catch (error) {
      state.openEvidenceImport.deidBusy = false;
      state.openEvidenceImport.deidStatus = "";
      state.openEvidenceImport.error = error instanceof Error ? error.message : "De-identification is not ready yet.";
      setStatus(state.openEvidenceImport.error);
      renderChecklist();
      return;
    }
    state.openEvidenceImport.deidStatus = "De-identifying locally...";
    renderChecklist();
    try {
      const result = await deidentify(text);
      state.openEvidenceImport.input = result.text || "";
      const residualWarnings = result.residualWarnings || result.flags || [];
      state.openEvidenceImport.deidResidualWarnings = residualWarnings;
      const warningCount = residualWarnings.length;
      state.openEvidenceImport.deidStatus = warningCount
        ? `De-identified locally - ${warningCount} residual flag${warningCount === 1 ? "" : "s"} to review before sending.`
        : "De-identified locally.";
      setStatus(state.openEvidenceImport.deidStatus);
    } catch (error) {
      state.openEvidenceImport.deidStatus = "";
      state.openEvidenceImport.error = error instanceof Error ? error.message : "Unable to de-identify this text locally.";
      setStatus(state.openEvidenceImport.error);
    }
    state.openEvidenceImport.deidBusy = false;
    renderChecklist();
  }

  async function applyResult(result) {
    const day = selectedChecklistDay(active());
    if (!day?.checklistSnapshot) throw new Error("Build a checklist before importing an OpenEvidence note.");
    const { answers, quickNotes, filledCount, quickNoteCount } = applyChecklistAnswerImport({
      snapshot: day.checklistSnapshot,
      answers: day.answers || {},
      quickNotes: day.quickNotes || [],
      result
    });
    const nextDay = { ...day, answers, quickNotes, updatedAt: new Date().toISOString() };
    state.vault = updateActivePatient(state.vault, (current) => ({ ...current, days: upsertDay(current.days, nextDay) }));
    const notePart = quickNoteCount ? ` and added ${quickNoteCount} quick note${quickNoteCount === 1 ? "" : "s"}` : "";
    await persistVault(`Filled ${filledCount} checklist item${filledCount === 1 ? "" : "s"}${notePart} from the OpenEvidence note.`);
    resetPanel();
    renderChecklist();
  }

  async function formatWithSavedKey() {
    const snapshot = currentSnapshot();
    const sourceText = currentInput();
    if (!snapshot) throw new Error("Build a checklist before importing an OpenEvidence note.");
    if (!state.openEvidenceImport.deidConfirmed) throw new Error("Confirm that the pasted note is de-identified before sending it to OpenAI.");
    state.openEvidenceImport.input = sourceText;
    state.openEvidenceImport.busy = true;
    state.openEvidenceImport.error = "";
    setStatus("Filling the checklist from the de-identified OpenEvidence note...");
    renderChecklist();
    try {
      const preferences = currentPreferences();
      const result = await formatChecklistAnswersWithOpenAi({
        apiKey: preferences.openAiApiKey,
        model: preferences.openAiModel,
        sourceText,
        snapshot
      });
      state.openEvidenceImport.busy = false;
      await applyResult(result);
    } catch (error) {
      state.openEvidenceImport.busy = false;
      state.openEvidenceImport.error = error instanceof Error ? error.message : "Unable to fill the checklist from OpenAI.";
      setStatus(state.openEvidenceImport.error);
      renderChecklist();
    }
  }

  async function parseAndApply(text) {
    state.openEvidenceImport.error = "";
    let parsed;
    try {
      parsed = JSON.parse(String(text ?? currentInput()));
    } catch {
      state.openEvidenceImport.error = "Paste ChatGPT's JSON reply into the box above before parsing it.";
      renderChecklist();
      return;
    }
    try {
      await applyResult(parsed);
    } catch (error) {
      state.openEvidenceImport.error = error instanceof Error ? error.message : "Unable to apply this JSON to the checklist.";
      renderChecklist();
    }
  }

  async function saveExamNote() {
    const text = currentInput();
    if (!text.trim()) throw new Error("De-identify the OpenEvidence note before saving it as the latest hospital-day note.");
    if (!state.openEvidenceImport.deidConfirmed) throw new Error("Confirm that the pasted note is de-identified before saving it.");
    await saveExamFindings({
      text,
      source: "OpenEvidence",
      residualWarnings: state.openEvidenceImport.deidResidualWarnings || []
    });
    resetPanel();
    renderChecklist();
  }

  async function clearExamNote() {
    await clearExamFindings();
    renderChecklist();
  }

  async function copyFormatterPrompt() {
    const snapshot = currentSnapshot();
    if (!snapshot) throw new Error("Build a checklist before copying this prompt.");
    const prompt = buildChecklistAnswerImportPrompt({ snapshot, sourceText: currentInput() });
    await copyText(prompt);
    if (currentPreferences().openAiApiKey) {
      setStatus("Copied ChatGPT prompt.");
      return;
    }
    setStatus("Copied prompt. Opening ChatGPT...", { icon: "externalLink" });
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  }

  return Object.freeze({ runLocalDeid, formatWithSavedKey, parseAndApply, copyFormatterPrompt, saveExamNote, clearExamNote });
}
