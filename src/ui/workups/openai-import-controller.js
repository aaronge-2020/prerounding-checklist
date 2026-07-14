import { buildJsonFormatterPrompt, buildOpenEvidenceWorkupDraftPrompt } from "../../workups/editor.js";
import { sectionsToPromptBlock } from "../../patient-context/sections.js";
import { buildTrajectoryBlock, latestDay } from "../../daily-updates/days.js";
import { formatWorkupDraftWithOpenAi } from "../openai-workup-api.js";

// The "paste an OpenEvidence draft, then format it into workup JSON with
// ChatGPT" handlers, kept out of app.js to respect the coordinator-file size
// boundary (scripts/check-ui-module-boundaries.js). `state` is the shared app
// state object, mutated directly the same way the rest of app.js's
// coordinators do.
export function createWorkupOpenAiImportController({ state, active, byId, copyText, setStatus, currentPreferences, renderWorkups, parseAndSaveWorkupJson }) {
  async function copyOpenEvidenceWorkupPrompt() {
    const patient = active();
    const guidelinesText = (state.guidelineSets || [])
      .find((set) => set.label.trim().toLowerCase() === "pre-round checklist")
      ?.text?.trim() || "";
    const prompt = buildOpenEvidenceWorkupDraftPrompt({
      patientContext: sectionsToPromptBlock(patient?.contextSections || [], "Saved patient context"),
      dailyTrajectory: buildTrajectoryBlock(patient, { selectedDayId: latestDay(patient?.days || [])?.id, includeAllDays: false }),
      workupTitle: byId("workupTitleInput")?.value || "",
      thoroughness: state.workupThoroughness,
      teamPreferences: state.vault.preferences,
      guidelinesText
    });
    await copyText(prompt);
    setStatus("Copied prompt. Opening OpenEvidence...", { icon: "externalLink" });
    window.open("https://www.openevidence.com/", "_blank", "noopener,noreferrer");
  }

  async function copyJsonFormatterPrompt() {
    const prompt = buildJsonFormatterPrompt({
      sourceText: byId("workupJsonImport")?.value || "",
      workupTitle: byId("workupTitleInput")?.value || ""
    });
    await copyText(prompt);
    if (currentPreferences().openAiApiKey) {
      setStatus("Copied ChatGPT formatter prompt.");
      return;
    }
    setStatus("Copied prompt. Opening ChatGPT...", { icon: "externalLink" });
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  }

  async function formatWorkupJsonWithSavedKey() {
    const preferences = currentPreferences();
    const sourceText = byId("workupJsonImport")?.value || state.workupImportDraft;
    const workupTitle = byId("workupTitleInput")?.value || "";
    if (!state.workupApiDeidConfirmed) throw new Error("Confirm that the pasted workup draft is de-identified before sending it to OpenAI.");
    state.workupImportDraft = sourceText;
    state.workupApiBusy = true;
    state.workupImportError = "";
    setStatus("Formatting the de-identified workup draft with the saved API key...");
    renderWorkups();
    try {
      const result = await formatWorkupDraftWithOpenAi({
        apiKey: preferences.openAiApiKey,
        model: preferences.openAiModel,
        sourceText,
        workupTitle
      });
      state.workupApiBusy = false;
      await parseAndSaveWorkupJson(JSON.stringify(result));
      setStatus("OpenAI formatted and loaded the workup JSON.");
    } catch (error) {
      state.workupApiBusy = false;
      state.workupImportError = error instanceof Error ? error.message : "Unable to format the workup draft with OpenAI.";
      setStatus(state.workupImportError);
      renderWorkups();
    }
  }

  return Object.freeze({ copyOpenEvidenceWorkupPrompt, copyJsonFormatterPrompt, formatWorkupJsonWithSavedKey });
}
