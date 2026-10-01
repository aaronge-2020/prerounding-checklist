// Controller for the Sample Notes test data tab: a read-only library of
// fictional full patient charts for end to end testing with zero real
// patient data. Owns the expanded chart id and the active section per
// chart. All markup lives in ./presentation.js (pure). The fixture data is
// bundled as a generated JS module (built from src/data/sample-notes.json
// by `npm run build:sample-notes-data`) so the tab works offline with no
// network calls. This module never touches the vault: sample charts are
// fixtures, not patient data.
import { SAMPLE_NOTES_DATA } from "../../data/sample-notes.data.js?v=20261001-sample-notes-v2";
import {
  createSampleNotesPresentation,
  resolveSection,
  buildChartText,
  buildSectionText
} from "./presentation.js?v=20261001-sample-notes-v2";

export function createSampleNotesController({ app, byId, escapeHtml, icon, replaceViewContent, render, setStatus, copyText }) {
  const presentation = createSampleNotesPresentation({ escapeHtml, icon });
  const state = { expandedId: null, sections: {} };

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
    replaceViewContent(el, presentation.renderSampleNotes({ notes, expandedId: state.expandedId, sections: state.sections }));
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

  function click(target) {
    if (!target || app.view !== "sampleNotes") return false;
    const actionEl = target.closest?.("[data-action]");
    if (!actionEl) return false;
    const action = actionEl.dataset?.action;
    const noteId = actionEl.dataset?.noteId;
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
    return false;
  }

  return Object.freeze({ render, click });
}
