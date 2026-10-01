import {
  DEMO_ADMISSION_DATE,
  DEMO_CONTEXT_TEXTS,
  DEMO_DAILY_TEXTS,
  DEMO_DAY_ID,
  DEMO_PATIENT_ID
} from "./session.js?v=20261001-demo-v4";

export function createDemoSessionController({
  app,
  createDemoPatient,
  structuredDeidMode,
  clearPhiReviews,
  clearQuickDeidSession,
  render,
  setStatus
}) {
  function start() {
    if (!app.vault || !app.passphrase) throw new Error("Unlock the local vault before starting the guided demo.");
    if (app.demoSession) exit({ renderAfter: false });
    app.demoSession = {
      stage: "save-context",
      restoreVault: app.vault,
      restoreView: app.view,
      restoreSelectedDayId: app.selectedDayId,
      restoreSelectedStayPacketId: app.selectedStayPacketId,
      restoreDeidMode: app.deidMode,
      restoreAdmissionDate: app.admissionDate,
      restoreSelectedPromptTask: app.selectedPromptTask,
      restorePresentationToEdit: app.presentationToEdit,
      restorePresentationToEditPacketId: app.presentationToEditPacketId,
      restorePresentationToEditEdited: app.presentationToEditEdited,
      restorePromptDayId: app.promptDayId,
      restorePromptDayFollowsSelectedDay: app.promptDayFollowsSelectedDay,
      restoreAdmissionSourceDraft: app.admissionSourceDraft,
      restoreAdmissionSourceKind: app.admissionSourceKind,
      restoreDailySourceDraft: app.dailySourceDraft,
      restoreDailySourceKind: app.dailySourceKind,
      restoreNoteDraftSessions: new Map(app.noteDraftSessions),
      restoreReviewPacketId: app.reviewPacketId
    };
    const sourcePatient = createDemoPatient();
    const patient = {
      ...sourcePatient,
      contextSections: sourcePatient.contextSections.map((section) => ({ ...section, deidentifiedText: "" })),
      days: sourcePatient.days.map((day) => ({
        ...day,
        sourceCaptures: day.sourceCaptures.map((capture) => ({ ...capture, deidentifiedText: "" }))
      }))
    };
    app.vault = {
      ...app.vault,
      activePatientId: DEMO_PATIENT_ID,
      patients: [patient],
      updatedAt: new Date().toISOString()
    };
    app.selectedDayId = DEMO_DAY_ID;
    app.selectedStayPacketId = "admission";
    app.admissionDate = DEMO_ADMISSION_DATE;
    app.deidMode = structuredDeidMode;
    app.selectedPromptTask = "presentation_quality_editor";
    app.promptDayId = DEMO_DAY_ID;
    app.presentationToEdit = "";
    app.presentationToEditPacketId = "";
    app.presentationToEditEdited = false;
    app.noteDraftSessions = new Map();
    app.reviewPacketId = DEMO_DAY_ID;
    app.admissionSourceKind = "other_chart_text";
    app.admissionSourceDraft = DEMO_CONTEXT_TEXTS.join("\n\n");
    app.dailySourceKind = "other_chart_text";
    app.dailySourceDraft = DEMO_DAILY_TEXTS.join("\n\n");
    clearPhiReviews();
    clearQuickDeidSession();
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
    app.selectedStayPacketId = session.restoreSelectedStayPacketId;
    app.deidMode = session.restoreDeidMode;
    app.admissionDate = session.restoreAdmissionDate;
    app.selectedPromptTask = session.restoreSelectedPromptTask;
    app.presentationToEdit = session.restorePresentationToEdit;
    app.presentationToEditPacketId = session.restorePresentationToEditPacketId;
    app.presentationToEditEdited = session.restorePresentationToEditEdited;
    app.promptDayId = session.restorePromptDayId;
    app.promptDayFollowsSelectedDay = session.restorePromptDayFollowsSelectedDay;
    app.admissionSourceDraft = session.restoreAdmissionSourceDraft;
    app.admissionSourceKind = session.restoreAdmissionSourceKind;
    app.dailySourceDraft = session.restoreDailySourceDraft;
    app.dailySourceKind = session.restoreDailySourceKind;
    app.noteDraftSessions = new Map(session.restoreNoteDraftSessions);
    app.reviewPacketId = session.restoreReviewPacketId;
    app.demoSession = null;
    clearPhiReviews();
    clearQuickDeidSession();
    setStatus("Guided demo closed. Your vault was not changed.");
    if (renderAfter) render();
  }

  return { exit, start };
}
