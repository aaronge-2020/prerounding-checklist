// Controller for the Sample Notes test data tab: a library of fictional
// full patient charts for end to end testing with zero real patient data.
// Owns the expanded chart id, the active section per chart, and the
// "Add to vault" import workflow. All markup lives in ./presentation.js
// (pure); fixture-to-source planning lives in ./import-plan.js (pure). The
// fixture data is bundled as a generated JS module (built from
// src/data/sample-notes.json by `npm run build:sample-notes-data`) so the
// tab works offline with no network calls.
//
// "Add to vault" imports one chart as a real vault patient: every chart
// section becomes its own admission source, each source is de-identified
// through the same local pipeline as a pasted source, and the patient is
// created only after every source de-identifies cleanly, so a failed
// import never leaves a partial patient behind. Raw fixture text lives
// only in memory during the import; the vault keeps de-identified text
// plus residual-warning metadata.
import { SAMPLE_NOTES_DATA } from "../../data/sample-notes.data.js?v=20261001-sample-notes-v2";
import { createPatientRecord, createTextSection, upsertPatient } from "../../app/state/vault.js?v=20261001-sample-notes-v2";
import { createEphemeralRedactionReview, reviewKey } from "../../patient-context/review.js?v=20261001-sample-notes-v2";
import {
  createSampleNotesPresentation,
  resolveSection,
  buildChartText,
  buildSectionText
} from "./presentation.js?v=20261001-sample-notes-v2";
import { buildImportPlan, sampleImportKey } from "./import-plan.js?v=20261001-sample-notes-v2";

export function createSampleNotesController({
  app,
  byId,
  escapeHtml,
  icon,
  replaceViewContent,
  render,
  setStatus,
  copyText,
  vaultIsUnlocked,
  ensureSelectedDeidReady,
  deidentify,
  updateDeidOperation,
  persistVault,
  setSectionDraftText,
  beginSectionReview
}) {
  const presentation = createSampleNotesPresentation({ escapeHtml, icon });
  const state = { expandedId: null, sections: {}, importing: null, addAllRunning: false };

  // Defensive read of the bundled data: anything that is not a well-formed
  // note list degrades to the empty state instead of throwing. A note needs
  // an id, a title, and a non-empty body.
  function getNotes() {
    const data = Array.isArray(SAMPLE_NOTES_DATA) ? SAMPLE_NOTES_DATA : null;
    if (!data) return [];
    return data.filter(
      (note) =>
        note &&
        typeof note === "object" &&
        note.id !== undefined &&
        note.id !== null &&
        String(note.title ?? "").trim() !== "" &&
        String(note.body ?? "").trim() !== ""
    );
  }

  function getNoteById(id) {
    return getNotes().find((note) => String(note.id) === String(id)) || null;
  }

  function container() {
    return byId("sampleNotesContent");
  }

  function render() {
    const el = container();
    if (!el) return;
    const notes = getNotes();
    if (!notes.length) {
      replaceViewContent(el, presentation.renderEmpty());
      return;
    }
    if (state.expandedId && !getNoteById(state.expandedId)) {
      state.expandedId = null;
    }
    replaceViewContent(el, presentation.renderSampleNotes({
      notes,
      expandedId: state.expandedId,
      sections: state.sections,
      importingId: state.importing,
      addAllRunning: state.addAllRunning
    }));
  }

  function useInQuickDeid(note) {
    // Start a fresh Quick De-ID session with the full chart text: note plus
    // labs, medications, vitals, and imaging, each under its own header.
    // Keep the admission date and verifier preference; drop any prior review
    // state so the new text starts clean.
    app.quickDeid = {
      input: buildChartText(note),
      output: "",
      warnings: [],
      status: "",
      review: null,
      admissionDate: app.quickDeid?.admissionDate || "",
      verifyWithLlm: Boolean(app.quickDeid?.verifyWithLlm)
    };
    app.view = "quickDeid";
    render();
    setStatus(`Loaded the full chart for "${note.title}" into Quick De-ID. Review and run de-identification when ready.`);
  }

  // A patient previously imported from this fixture, if it still exists and
  // is not archived. The stable sampleNoteId metadata keeps a repeated
  // "Add to vault" from creating a confusing silent duplicate.
  function existingImport(note) {
    const key = sampleImportKey(note);
    if (!key || !app.vault || !Array.isArray(app.vault.patients)) return null;
    return app.vault.patients.find(
      (patient) =>
        patient &&
        !patient.archivedAt &&
        patient.metadata &&
        typeof patient.metadata === "object" &&
        String(patient.metadata.sampleNoteId || "") === key
    ) || null;
  }

  function openPatientInHospitalStay(patient, message) {
    app.vault = upsertPatient(app.vault, patient, { activate: true });
    beginSectionReview("context");
    app.view = "daily";
    render();
    setStatus(message);
  }

  function deidentifiedLabel(note) {
    const title = String(note.title || "Sample chart").trim();
    return `Sample: ${title}`;
  }

  async function importNote(note) {
    if (!vaultIsUnlocked()) {
      setStatus("Unlock your vault first, then add this sample chart. Your vault holds the imported patient.");
      return;
    }
    const already = existingImport(note);
    if (already) {
      openPatientInHospitalStay(already, `"${note.title}" is already in your vault. Opened it in Hospital Stay.`);
      return;
    }
    const plan = buildImportPlan(note);
    if (!plan.length) {
      setStatus(`"${note.title}" has no chart sections to import.`);
      return;
    }
    state.importing = String(note.id);
    render();
    updateDeidOperation({ active: true, message: "Preparing the sample chart for local de-identification…", value: 0, total: plan.length });
    try {
      // The selected de-identification model must be downloaded, imported,
      // self-tested, and visibly ready before any source text is processed.
      await ensureSelectedDeidReady();
      // De-identify every source before anything is persisted. The patient
      // record is assembled only after all parts succeed, so a failure here
      // cannot leave a partial patient behind.
      const deidentified = [];
      for (let index = 0; index < plan.length; index += 1) {
        const part = plan[index];
        updateDeidOperation({
          active: true,
          message: plan.length > 1
            ? `De-identifying source ${index + 1} of ${plan.length}: ${part.label}…`
            : `De-identifying ${part.label || "this source"} locally…`,
          value: index,
          total: plan.length
        });
        const result = await deidentify(part.sourceText, {});
        deidentified.push({ part, result });
      }
      const sections = deidentified.map(({ part, result }) =>
        createTextSection(part.label || "Sample source", {
          scope: "context",
          role: part.role || "additional_admission_source",
          sourceKind: part.sourceKind,
          resultCategory: part.resultCategory || "",
          resultDate: part.resultDate || "",
          text: result.text || ""
        })
      );
      const patient = createPatientRecord(deidentifiedLabel(note), {
        contextSections: sections,
        metadata: {
          sampleNoteId: sampleImportKey(note),
          sampleImport: true,
          importedAt: new Date().toISOString()
        }
      });
      // Ephemeral review state per imported source: raw fixture text stays
      // in memory only, exactly like a freshly de-identified paste.
      sections.forEach((section, index) => {
        const { part, result } = deidentified[index];
        app.phiReviews.set(reviewKey("context", section.id), createEphemeralRedactionReview(part.sourceText, result));
        setSectionDraftText("context", section.id, section.deidentifiedText);
      });
      app.vault = upsertPatient(app.vault, patient, { activate: true });
      await persistVault(`"${note.title}" de-identified and added to your vault as ${sections.length} admission sources.`);
      updateDeidOperation({ active: false, message: `${sections.length} sources de-identified and saved locally.` });
      state.importing = null;
      beginSectionReview("context");
      app.view = "daily";
      render();
      setStatus(`"${note.title}" is now a patient in your vault with ${sections.length} de-identified admission sources. Review each source, then continue to Review Data.`);
    } catch (error) {
      state.importing = null;
      const message = error instanceof Error && error.message
        ? error.message
        : "De-identification did not complete.";
      updateDeidOperation({ active: false, message });
      render();
      setStatus(`Could not add "${note.title}" to your vault: ${message} Nothing was saved.`);
    }
  }

  async function importAllNotes() {
    if (state.addAllRunning || state.importing) return;
    if (!vaultIsUnlocked()) {
      setStatus("Unlock your vault first, then add the sample charts. Your vault holds the imported patients.");
      return;
    }
    const notes = getNotes();
    const pending = notes.filter((note) => !existingImport(note));
    if (!pending.length) {
      setStatus("Every sample chart is already in your vault.");
      return;
    }
    state.addAllRunning = true;
    render();
    let imported = 0;
    let failed = 0;
    try {
      await ensureSelectedDeidReady();
      for (const note of pending) {
        const plan = buildImportPlan(note);
        if (!plan.length) continue;
        try {
          const deidentified = [];
          for (let index = 0; index < plan.length; index += 1) {
            const part = plan[index];
            updateDeidOperation({
              active: true,
              message: `"${note.title}": de-identifying source ${index + 1} of ${plan.length} (${part.label})…`,
              value: index,
              total: plan.length
            });
            const result = await deidentify(part.sourceText, {});
            deidentified.push({ part, result });
          }
          const sections = deidentified.map(({ part, result }) =>
            createTextSection(part.label || "Sample source", {
              scope: "context",
              role: part.role || "additional_admission_source",
              sourceKind: part.sourceKind,
              resultCategory: part.resultCategory || "",
              resultDate: part.resultDate || "",
              text: result.text || ""
            })
          );
          const patient = createPatientRecord(deidentifiedLabel(note), {
            contextSections: sections,
            metadata: {
              sampleNoteId: sampleImportKey(note),
              sampleImport: true,
              importedAt: new Date().toISOString()
            }
          });
          sections.forEach((section, index) => {
            const { part, result } = deidentified[index];
            app.phiReviews.set(reviewKey("context", section.id), createEphemeralRedactionReview(part.sourceText, result));
            setSectionDraftText("context", section.id, section.deidentifiedText);
          });
          app.vault = upsertPatient(app.vault, patient, { activate: false });
          imported += 1;
        } catch (error) {
          failed += 1;
        }
      }
      await persistVault(`${imported} sample chart${imported === 1 ? "" : "s"} de-identified and added to your vault.`);
      updateDeidOperation({ active: false, message: "Sample import finished." });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "De-identification did not complete.";
      updateDeidOperation({ active: false, message });
      setStatus(`Sample import stopped: ${message} ${imported} chart${imported === 1 ? "" : "s"} were added before the stop.`);
      state.addAllRunning = false;
      render();
      return;
    }
    state.addAllRunning = false;
    render();
    const skipped = notes.length - pending.length;
    const bits = [`${imported} added`];
    if (skipped) bits.push(`${skipped} already in your vault`);
    if (failed) bits.push(`${failed} failed`);
    setStatus(`Sample import finished: ${bits.join(", ")}. Open a patient from the vault to work through it.`);
  }

  function click(target) {
    if (!target || app.view !== "sampleNotes") return false;
    const actionEl = target.closest?.("[data-action]");
    if (!actionEl) return false;
    const action = actionEl.dataset?.action;
    const noteId = actionEl.dataset?.noteId;
    if (action === "sample-notes-add-all") {
      void importAllNotes();
      return true;
    }
    if (action === "sample-notes-toggle") {
      state.expandedId = state.expandedId === noteId ? null : noteId;
      render();
      return true;
    }
    const note = noteId ? getNoteById(noteId) : null;
    if (!note) return false;
    if (action === "sample-notes-section") {
      state.sections[noteId] = resolveSection(note, actionEl.dataset?.section);
      render();
      return true;
    }
    if (action === "sample-notes-copy-section") {
      copyText(buildSectionText(note, resolveSection(note, actionEl.dataset?.section)));
      return true;
    }
    if (action === "sample-notes-use") {
      useInQuickDeid(note);
      return true;
    }
    if (action === "sample-notes-copy") {
      copyText(buildChartText(note));
      return true;
    }
    if (action === "sample-notes-add") {
      void importNote(note);
      return true;
    }
    return false;
  }

  return Object.freeze({ render, click });
}
