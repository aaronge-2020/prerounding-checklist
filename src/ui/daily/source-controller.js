import { sortDays, upsertDay } from "../../daily-updates/days.js?v=20260722-unified-stay-v2";
import { createTextSection, updateActivePatient } from "../../app/state/vault.js?v=20260815-smart-variable-fields";
import {
  parseClinicalExport,
  prepareClinicalExportForSave
} from "../../patient-context/clinical-export-parser.js?v=20260908-epic-parser-submit";
import {
  createEphemeralRedactionReview,
  reviewKey,
  synchronizeReviewPlaceholders
} from "../../patient-context/review.js?v=20260715-reject-rest";
import {
  admissionSourceKindOptions,
  createSourceCapture,
  dailySourceKindOptions,
  replaceSourceCapturesFromFormAsync,
  sourceCapturePacketCheck
} from "../../patient-context/source-captures.js?v=20260815-smart-variable-fields";

export function createDailySourceController(deps) {
  const sourceState = (scope) =>
    scope === "admission"
      ? {
          draftKey: "admissionSourceDraft",
          parseKey: "admissionSourceParse",
          kindKey: "admissionSourceKind",
          options: admissionSourceKindOptions(),
          countSelector: "[data-admission-source-draft-count]",
          addAction: "add-admission-source"
        }
      : {
          draftKey: "dailySourceDraft",
          parseKey: "dailySourceParse",
          kindKey: "dailySourceKind",
          options: dailySourceKindOptions(),
          countSelector: "[data-daily-source-draft-count]",
          addAction: "add-daily-source"
        };

  function sourceTextForSave(scope) {
    const state = sourceState(scope);
    const prepared = prepareClinicalExportForSave(deps.app[state.draftKey], deps.app[state.parseKey]);
    deps.app[state.parseKey] = prepared.parseResult;
    if (prepared.parseResult.suggestedSourceKind && state.options.some((option) => option.id === prepared.parseResult.suggestedSourceKind)) {
      deps.app[state.kindKey] = prepared.parseResult.suggestedSourceKind;
    }
    return prepared;
  }

  function updateDraft(scope, value) {
    const state = sourceState(scope);
    deps.app[state.draftKey] = String(value || "");
    const parsed = parseClinicalExport(value);
    deps.app[state.parseKey] = parsed;
    if (parsed.suggestedSourceKind && state.options.some((option) => option.id === parsed.suggestedSourceKind)) {
      deps.app[state.kindKey] = parsed.suggestedSourceKind;
    }

    const source = state.options.find((option) => option.id === deps.app[state.kindKey]);
    const count = document.querySelector(state.countSelector);
    if (count)
      count.textContent = `${deps.app[state.draftKey].length.toLocaleString()} characters · ${source?.description || "Chart source."}`;
    const preview = document.querySelector(`[data-source-parse-preview="${scope}"]`);
    if (preview) preview.innerHTML = deps.dailyPresentation.renderSourceParsePreview({ scope, parseResult: parsed });
    document.querySelectorAll(`[data-action="select-${scope}-source-kind"]`).forEach((button) => {
      const selected = button.dataset.sourceKind === deps.app[state.kindKey];
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const addButton = document.querySelector(`[data-action="${state.addAction}"]`);
    if (addButton) addButton.disabled = deps.app.deidOperation.active || !deps.app[state.draftKey].trim();
  }

  function updateParsedDraft(scope, value) {
    const state = sourceState(scope);
    const parsed = deps.app[state.parseKey];
    if (!parsed?.recognized) return;
    deps.app[state.parseKey] = {
      ...parsed,
      outputText: String(value || ""),
      parsedCharacterCount: String(value || "").length,
      edited: true
    };
    const count = document.querySelector(`[data-source-parse-preview="${scope}"] [data-source-parsed-count]`);
    if (count) count.textContent = `${String(value || "").length.toLocaleString()} characters after parsing`;
  }

  function admissionRoleForSourceKind(sourceKind) {
    return (
      {
        primary_note: "admission_reason",
        results: "admission_results",
        medication_activity: "procedures_devices",
        consult_note: "procedures_devices",
        prior_physical_exam: "admission_history",
        bedside_update: "admission_history"
      }[sourceKind] || "additional_admission_source"
    );
  }

  const captureRows = () =>
    [...document.querySelectorAll("#dailySources .source-capture-editor")].map((row) => ({
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
      admissionSourceOptions: admissionSourceKindOptions(),
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
    const selectedPacketId =
      deps.app.selectedStayPacketId === "admission"
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
      admissionSourceOptions: admissionSourceKindOptions(),
      selectedSourceKind: deps.app.dailySourceKind,
      sourceDraft: deps.app.dailySourceDraft,
      sourceParse: deps.app.dailySourceParse,
      admissionSourceKind: deps.app.admissionSourceKind,
      admissionSourceDraft: deps.app.admissionSourceDraft,
      admissionSourceParse: deps.app.admissionSourceParse,
      packetCheck: sourceCapturePacketCheck(selected?.sourceCaptures || []),
      admissionPacketCheck: sourceCapturePacketCheck(
        (patient?.contextSections || []).filter(
          (section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length
        )
      ),
      deidBusy: deps.app.deidOperation.active
    });
  }

  async function addSource() {
    const day = deps.selectedChecklistDay(deps.active());
    if (!day) throw new Error("Add a hospital day first.");
    const { rawText, sourceText, parseResult } = sourceTextForSave("daily");
    if (!rawText || !sourceText) throw new Error("Paste a chart source before adding it.");
    deps.updateDeidOperation({
      active: true,
      message: parseResult.recognized
        ? `${parseResult.formatLabel} parsed locally; de-identifying the structured text…`
        : "De-identifying this source locally…",
      value: 0,
      total: 1
    });
    try {
      await deps.ensureSelectedDeidReady();
      const result = await deps.deidentify(sourceText, { referenceDate: day.date });
      const capture = createSourceCapture({
        sourceKind: deps.app.dailySourceKind,
        text: result.text || "",
        residualWarnings: result.residualWarnings || result.flags || []
      });
      deps.app.phiReviews.set(reviewKey("daily", capture.id), createEphemeralRedactionReview(sourceText, result));
      deps.setSectionDraftText("daily", capture.id, capture.deidentifiedText);
      const nextDay = { ...day, sourceCaptures: [...(day.sourceCaptures || []), capture], updatedAt: new Date().toISOString() };
      deps.admissionDateAnchor.remember();
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({ ...patient, days: upsertDay(patient.days, nextDay) }));
      deps.app.dailySourceDraft = "";
      deps.app.dailySourceParse = null;
      deps.beginSectionReview("daily");
      await deps.persistVault("Source de-identified and added to this hospital day.");
      deps.updateDeidOperation({ active: false, message: "Source de-identified and saved locally." });
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
      throw error;
    }
  }

  async function addAdmissionSource() {
    const patient = deps.active();
    const { rawText, sourceText, parseResult } = sourceTextForSave("admission");
    if (!patient) throw new Error("Select a patient first.");
    if (!rawText || !sourceText) throw new Error("Paste a chart source before adding it.");
    deps.updateDeidOperation({
      active: true,
      message: parseResult.recognized
        ? `${parseResult.formatLabel} parsed locally; de-identifying the structured text…`
        : "De-identifying this admission source locally…",
      value: 0,
      total: 1
    });
    try {
      await deps.ensureSelectedDeidReady();
      const result = await deps.deidentify(sourceText, { referenceDate: deps.app.admissionDate });
      const source = admissionSourceKindOptions().find((option) => option.id === deps.app.admissionSourceKind);
      const section = createTextSection(source?.label || "Other chart text", {
        scope: "context",
        role: admissionRoleForSourceKind(deps.app.admissionSourceKind),
        sourceKind: deps.app.admissionSourceKind,
        text: result.text || ""
      });
      deps.app.phiReviews.set(reviewKey("context", section.id), createEphemeralRedactionReview(sourceText, result));
      deps.setSectionDraftText("context", section.id, section.deidentifiedText);
      deps.app.vault = updateActivePatient(deps.app.vault, (current) => ({
        ...current,
        contextSections: [...(current.contextSections || []), section]
      }));
      deps.app.admissionSourceDraft = "";
      deps.app.admissionSourceParse = null;
      deps.admissionDateAnchor.remember();
      deps.beginSectionReview("context");
      await deps.persistVault("Source de-identified and added to Admission.");
      deps.updateDeidOperation({ active: false, message: "Admission source de-identified and saved locally." });
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
    deps.updateDeidOperation({
      active: true,
      message: "Preparing source edits for local de-identification…",
      value: 0,
      total: rows.length
    });
    try {
      await deps.ensureSelectedDeidReady();
      const retainedIds = new Set(rows.map((row) => row.id));
      for (const key of deps.app.phiReviews.keys())
        if (key.startsWith("daily:") && !retainedIds.has(key.slice(6))) deps.app.phiReviews.delete(key);
      const captures = await replaceSourceCapturesFromFormAsync(rows, (text) => deps.deidentify(text, { referenceDate: day.date }), {
        priorCaptures: day.sourceCaptures || [],
        reprocessEditedText: true,
        onResult: ({ row, result, prior, plan }) => {
          const key = reviewKey("daily", row.id);
          if (deps.app.phiReviews.get(key)?.approvedRedactionIndexes?.size || plan.mode === "unchanged") return;
          const review =
            plan.mode === "append"
              ? createEphemeralRedactionReview(plan.suffix, result.suffixResult || {}, { priorOutputText: prior?.deidentifiedText || "" })
              : createEphemeralRedactionReview(row.text, result);
          deps.app.phiReviews.set(key, review);
        },
        onProgress: ({ completed, total }) =>
          deps.updateDeidOperation({
            active: true,
            value: completed,
            total,
            message: completed
              ? `De-identified ${completed} of ${total} sources locally.`
              : `Preparing ${total} source${total === 1 ? "" : "s"} for local de-identification…`
          })
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
    deps.app.dailySourceParse = null;
    deps.app.dailySourceKind = "primary_note";
    deps.render();
  }

  return Object.freeze({ addAdmissionSource, addSource, renderDaily, saveSources, selectPacket, updateDraft, updateParsedDraft });
}
