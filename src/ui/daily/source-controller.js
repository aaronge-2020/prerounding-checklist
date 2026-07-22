import { sortDays, upsertDay } from "../../daily-updates/days.js?v=20260722-unified-stay-v2";
import { updateActivePatient } from "../../app/state/vault.js?v=20260722-unified-stay-v2";
import { createEphemeralRedactionReview, reviewKey, synchronizeReviewPlaceholders } from "../../patient-context/review.js?v=20260715-reject-rest";
import { createSourceCapture, dailySourceKindOptions, replaceSourceCapturesFromFormAsync, sourceCapturePacketCheck } from "../../patient-context/source-captures.js?v=20260722-unified-stay-v2";

export function createDailySourceController(deps) {
  const captureRows = () => [...document.querySelectorAll("#dailySources .source-capture-editor")].map((row) => ({
    id: row.dataset.sectionId,
    createdAt: row.dataset.createdAt,
    capturedAt: row.dataset.capturedAt,
    sourceKind: row.querySelector(".source-kind")?.value || "other_chart_text",
    label: row.querySelector(".source-kind option:checked")?.textContent || "Other chart text",
    text: row.querySelector(".section-text")?.value || ""
  }));

  function renderSourceCaptureEditor(capture) {
    const editing = deps.isSectionTextEditing("daily", capture.id);
    const review = deps.sectionReviewFor("daily", capture.id);
    const draftText = deps.sectionDraftText("daily", capture.id, capture.deidentifiedText);
    synchronizeReviewPlaceholders(review, draftText);
    return deps.redactionPresentation.renderSourceCaptureEditor({
      capture,
      sourceOptions: dailySourceKindOptions(),
      editing,
      pendingFocus: deps.app.pendingSectionReviewFocus,
      review,
      draftText,
      captures: deps.reviewSectionsForScope("daily"),
      reviewFor: (id) => deps.sectionReviewFor("daily", id)
    });
  }

  function renderDaily() {
    const patient = deps.active();
    const days = sortDays(patient?.days || []);
    const selected = days.find((day) => day.id === deps.app.selectedDayId) || days.at(-1) || null;
    if (selected && selected.id !== deps.app.selectedDayId) deps.app.selectedDayId = selected.id;
    const selectedPacketId = deps.app.selectedStayPacketId === "admission"
      ? "admission"
      : days.some((day) => day.id === deps.app.selectedStayPacketId)
        ? deps.app.selectedStayPacketId
        : selected?.id || "admission";
    deps.app.selectedStayPacketId = selectedPacketId;
    deps.byId("dailyContent").innerHTML = deps.dailyPresentation.renderDaily({
      patient,
      days,
      selectedDayId: deps.app.selectedDayId,
      selectedPacketId,
      localCalendarDate: deps.localCalendarDate(),
      patientRequiredMessage: deps.patientRequiredMessage(),
      renderDeidStrip: deps.renderDeidStrip(),
      renderSectionEditor: deps.renderSectionEditor,
      renderSourceCaptureEditor,
      renderWarnings: deps.renderWarnings,
      sourceOptions: dailySourceKindOptions(),
      selectedSourceKind: deps.app.dailySourceKind,
      sourceDraft: deps.app.dailySourceDraft,
      packetCheck: sourceCapturePacketCheck(selected?.sourceCaptures || []),
      deidBusy: deps.app.deidOperation.active
    });
  }

  async function addSource() {
    const day = deps.selectedChecklistDay(deps.active());
    if (!day) throw new Error("Add a hospital day first.");
    const rawText = deps.app.dailySourceDraft.trim();
    if (!rawText) throw new Error("Paste a chart source before adding it.");
    deps.updateDeidOperation({ active: true, message: "De-identifying this source locally…", value: 0, total: 1 });
    try {
      await deps.ensureSelectedDeidReady();
      const result = await deps.deidentify(rawText, { referenceDate: day.date });
      const capture = createSourceCapture({ sourceKind: deps.app.dailySourceKind, text: result.text || "", residualWarnings: result.residualWarnings || result.flags || [] });
      deps.app.phiReviews.set(reviewKey("daily", capture.id), createEphemeralRedactionReview(rawText, result));
      deps.setSectionDraftText("daily", capture.id, capture.deidentifiedText);
      const nextDay = { ...day, sourceCaptures: [...(day.sourceCaptures || []), capture], updatedAt: new Date().toISOString() };
      deps.admissionDateAnchor.remember();
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({ ...patient, days: upsertDay(patient.days, nextDay) }));
      deps.app.dailySourceDraft = "";
      deps.beginSectionReview("daily");
      await deps.persistVault("Source de-identified and added to this hospital day.");
      deps.updateDeidOperation({ active: false, message: "Source de-identified and saved locally." });
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
      throw error;
    }
  }

  async function saveSources() {
    const day = deps.selectedChecklistDay(deps.active());
    if (!day) throw new Error("Add a hospital day first.");
    const rows = captureRows();
    if (!rows.length) throw new Error("Add at least one selected-day source first.");
    deps.updateDeidOperation({ active: true, message: "Preparing source edits for local de-identification…", value: 0, total: rows.length });
    try {
      await deps.ensureSelectedDeidReady();
      const retainedIds = new Set(rows.map((row) => row.id));
      for (const key of deps.app.phiReviews.keys()) if (key.startsWith("daily:") && !retainedIds.has(key.slice(6))) deps.app.phiReviews.delete(key);
      const captures = await replaceSourceCapturesFromFormAsync(rows, (text) => deps.deidentify(text, { referenceDate: day.date }), {
        priorCaptures: day.sourceCaptures || [],
        reprocessEditedText: true,
        onResult: ({ row, result, prior, plan }) => {
          const key = reviewKey("daily", row.id);
          if (deps.app.phiReviews.get(key)?.approvedRedactionIndexes?.size || plan.mode === "unchanged") return;
          const review = plan.mode === "append"
            ? createEphemeralRedactionReview(plan.suffix, result.suffixResult || {}, { priorOutputText: prior?.deidentifiedText || "" })
            : createEphemeralRedactionReview(row.text, result);
          deps.app.phiReviews.set(key, review);
        },
        onProgress: ({ completed, total }) => deps.updateDeidOperation({ active: true, value: completed, total, message: completed ? `De-identified ${completed} of ${total} sources locally.` : `Preparing ${total} source${total === 1 ? "" : "s"} for local de-identification…` })
      });
      deps.admissionDateAnchor.remember();
      const nextDay = { ...day, sourceCaptures: deps.applyApprovedRedactions("daily", captures), updatedAt: new Date().toISOString() };
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({ ...patient, days: upsertDay(patient.days, nextDay) }));
      deps.beginSectionReview("daily");
      await deps.persistVault("Source edits saved as de-identified local text.");
      deps.updateDeidOperation({ active: false, message: "Selected-day sources de-identified and saved locally." });
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
      throw error;
    }
  }

  function selectPacket(packetId) {
    deps.app.selectedStayPacketId = packetId || "admission";
    if (packetId && packetId !== "admission") deps.app.selectedDayId = packetId;
    deps.app.dailySourceDraft = "";
    deps.app.dailySourceKind = "primary_note";
    deps.render();
  }

  return Object.freeze({ addSource, renderDaily, saveSources, selectPacket });
}
