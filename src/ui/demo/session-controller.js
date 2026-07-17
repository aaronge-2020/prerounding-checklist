import { DEMO_ADMISSION_DATE, DEMO_CONTEXT_TEXTS, DEMO_DAILY_TEXTS, DEMO_DAY_ID, DEMO_PATIENT_ID, DEMO_WORKUP_ID } from "./session.js?v=20260717-guided-demo-ux-4";
import { reviewKey } from "../../patient-context/review.js";

export function createDemoSessionController({ app, createDemoPatient, structuredDeidMode, clearPhiReviews, clearQuickDeidSession, render, setStatus }) {
  function seedDraftText(patient) {
    patient.contextSections.forEach((section, index) => app.sectionDrafts.set(reviewKey("context", section.id), DEMO_CONTEXT_TEXTS[index] || ""));
    const day = patient.days.find((entry) => entry.id === DEMO_DAY_ID);
    day?.sections.forEach((section, index) => app.sectionDrafts.set(reviewKey("daily", section.id), DEMO_DAILY_TEXTS[index] || ""));
  }

  function start() {
    if (!app.vault || !app.passphrase) throw new Error("Unlock the local vault before starting the guided demo.");
    if (app.demoSession) exit({ renderAfter: false });
    app.demoSession = {
      stage: "save-context",
      restoreVault: app.vault,
      restoreView: app.view,
      restoreSelectedDayId: app.selectedDayId,
      restoreDeidMode: app.deidMode,
      restoreAdmissionDate: app.admissionDate,
      restoreSelectedWorkupEditorId: app.selectedWorkupEditorId,
      restoreSelectedPromptTask: app.selectedPromptTask,
      restorePromptDayId: app.promptDayId,
      restorePromptDayFollowsChecklist: app.promptDayFollowsChecklist,
      restoreDraftWorkup: app.draftWorkup,
      restoreChecklistSearchQuery: app.checklistSearchQuery,
      restoreWorkupCatalogQuery: app.workupCatalogQuery,
      restoreWorkupCatalogOpen: app.workupCatalogOpen
    };
    const sourcePatient = createDemoPatient();
    const patient = {
      ...sourcePatient,
      contextSections: sourcePatient.contextSections.map((section) => ({ ...section, deidentifiedText: "" })),
      days: sourcePatient.days.map((day) => ({ ...day, sections: day.sections.map((section) => ({ ...section, deidentifiedText: "" })) }))
    };
    app.vault = { ...app.vault, activePatientId: DEMO_PATIENT_ID, patients: [patient], selectedWorkupIds: [], updatedAt: new Date().toISOString() };
    app.selectedDayId = DEMO_DAY_ID;
    app.admissionDate = DEMO_ADMISSION_DATE;
    app.deidMode = structuredDeidMode;
    app.selectedWorkupEditorId = DEMO_WORKUP_ID;
    app.draftWorkup = null;
    app.checklistSearchQuery = "";
    app.workupCatalogQuery = "";
    app.workupCatalogOpen = true;
    clearPhiReviews();
    clearQuickDeidSession();
    seedDraftText(patient);
    app.view = "daily";
    setStatus("Guided demo started. Synthetic data only — nothing is written to your vault.");
    render();
  }

  function exit({ renderAfter = true } = {}) {
    const session = app.demoSession;
    if (!session) return;
    app.vault = session.restoreVault;
    app.view = session.restoreView;
    app.selectedDayId = session.restoreSelectedDayId;
    app.deidMode = session.restoreDeidMode;
    app.admissionDate = session.restoreAdmissionDate;
    app.selectedWorkupEditorId = session.restoreSelectedWorkupEditorId;
    app.selectedPromptTask = session.restoreSelectedPromptTask;
    app.promptDayId = session.restorePromptDayId;
    app.promptDayFollowsChecklist = session.restorePromptDayFollowsChecklist;
    app.draftWorkup = session.restoreDraftWorkup;
    app.checklistSearchQuery = session.restoreChecklistSearchQuery;
    app.workupCatalogQuery = session.restoreWorkupCatalogQuery;
    app.workupCatalogOpen = session.restoreWorkupCatalogOpen;
    app.demoSession = null;
    clearPhiReviews();
    clearQuickDeidSession();
    setStatus("Guided demo closed. Your vault was not changed.");
    if (renderAfter) render();
  }

  return { exit, start };
}
