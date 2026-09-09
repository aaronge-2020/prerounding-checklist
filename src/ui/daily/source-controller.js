import { sortDays, upsertDay } from "../../daily-updates/days.js?v=20260722-unified-stay-v2";
import { createTextSection, updateActivePatient } from "../../app/state/vault.js?v=20260815-smart-variable-fields";
import {
  parseClinicalExport,
  prepareClinicalExportForSave
} from "../../patient-context/clinical-export-parser.js?v=20260908-epic-mixed-packet";
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

  function sourcePartsForSave(prepared, fallbackSourceKind) {
    const sections = Array.isArray(prepared.parseResult.sections) ? prepared.parseResult.sections : [];
    if (sections.length) {
      return sections
        .map((section) => ({
          sourceKind: section.sourceKind || "other_chart_text",
          label: section.formatLabel || "Parsed chart source",
          sourceText: String(section.outputText || "").trim()
        }))
        .filter((section) => section.sourceText);
    }
    return prepared.sourceText
      ? [{
          sourceKind: prepared.parseResult.suggestedSourceKind || fallbackSourceKind,
          label: prepared.parseResult.recognized ? prepared.parseResult.formatLabel : "",
          sourceText: prepared.sourceText
        }]
      : [];
  }

  async function deidentifySourceParts(parts, referenceDate) {
    const deidentified = [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      deps.updateDeidOperation({
        active: true,
        message: parts.length > 1
          ? `De-identifying source ${index + 1} of ${parts.length}: ${part.label}…`
          : `De-identifying ${part.label || "this source"} locally…`,
        value: index,
        total: parts.length
      });
      deidentified.push({ part, result: await deps.deidentify(part.sourceText, { referenceDate }) });
    }
    return deidentified;
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
    if (addButton) {
      const parsedSourceCount = Array.isArray(parsed.sections) && parsed.sections.length > 1 ? parsed.sections.length : 1;
      addButton.textContent = parsedSourceCount > 1 ? `De-identify and add ${parsedSourceCount} sources` : "De-identify and add source";
      addButton.disabled = deps.app.deidOperation.active || !deps.app[state.draftKey].trim();
    }
  }

  function updateParsedDraft(scope, value, sectionIndex = "") {
    const state = sourceState(scope);
    const parsed = deps.app[state.parseKey];
    if (!parsed?.recognized) return;
    const numericSectionIndex = sectionIndex === "" ? -1 : Number(sectionIndex);
    if (numericSectionIndex >= 0 && Array.isArray(parsed.sections)) {
      const sections = parsed.sections.map((section, index) => index === numericSectionIndex ? { ...section, outputText: String(value || "") } : section);
      deps.app[state.parseKey] = {
        ...parsed,
        sections,
        outputText: sections.map((section) => section.outputText).join("\n\n"),
        parsedCharacterCount: sections.reduce((total, section) => total + section.outputText.length, 0),
        edited: true
      };
      const count = document.querySelector(`[data-source-parse-preview="${scope}"] [data-source-parsed-count="${numericSectionIndex}"]`);
      if (count) count.textContent = `${String(value || "").length.toLocaleString()} characters after parsing`;
      return;
    }
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
    const prepared = sourceTextForSave("daily");
    const parts = sourcePartsForSave(prepared, deps.app.dailySourceKind);
    if (!prepared.rawText || !parts.length) throw new Error("Paste a chart source before adding it.");
    deps.updateDeidOperation({
      active: true,
      message: prepared.parseResult.recognized
        ? `${prepared.parseResult.formatLabel} parsed into ${parts.length} source${parts.length === 1 ? "" : "s"}; preparing local de-identification…`
        : "De-identifying this source locally…",
      value: 0,
      total: parts.length
    });
    try {
      await deps.ensureSelectedDeidReady();
      const deidentified = await deidentifySourceParts(parts, day.date);
      const captures = deidentified.map(({ part, result }) => createSourceCapture({
        sourceKind: part.sourceKind,
        label: part.label,
        text: result.text || "",
        residualWarnings: result.residualWarnings || result.flags || []
      }));
      captures.forEach((capture, index) => {
        const { part, result } = deidentified[index];
        deps.app.phiReviews.set(reviewKey("daily", capture.id), createEphemeralRedactionReview(part.sourceText, result));
        deps.setSectionDraftText("daily", capture.id, capture.deidentifiedText);
      });
      const nextDay = { ...day, sourceCaptures: [...(day.sourceCaptures || []), ...captures], updatedAt: new Date().toISOString() };
      deps.admissionDateAnchor.remember();
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({ ...patient, days: upsertDay(patient.days, nextDay) }));
      deps.app.dailySourceDraft = "";
      deps.app.dailySourceParse = null;
      deps.beginSectionReview("daily");
      await deps.persistVault(`${captures.length} source${captures.length === 1 ? "" : "s"} de-identified and added to this hospital day.`);
      deps.updateDeidOperation({ active: false, message: `${captures.length} source${captures.length === 1 ? "" : "s"} de-identified and saved locally.` });
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "De-identification did not complete." });
      throw error;
    }
  }

  async function addAdmissionSource() {
    const patient = deps.active();
    const prepared = sourceTextForSave("admission");
    const parts = sourcePartsForSave(prepared, deps.app.admissionSourceKind);
    if (!patient) throw new Error("Select a patient first.");
    if (!prepared.rawText || !parts.length) throw new Error("Paste a chart source before adding it.");
    deps.updateDeidOperation({
      active: true,
      message: prepared.parseResult.recognized
        ? `${prepared.parseResult.formatLabel} parsed into ${parts.length} source${parts.length === 1 ? "" : "s"}; preparing local de-identification…`
        : "De-identifying this admission source locally…",
      value: 0,
      total: parts.length
    });
    try {
      await deps.ensureSelectedDeidReady();
      const deidentified = await deidentifySourceParts(parts, deps.app.admissionDate);
      const sections = deidentified.map(({ part, result }) => createTextSection(part.label || "Other chart text", {
        scope: "context",
        role: admissionRoleForSourceKind(part.sourceKind),
        sourceKind: part.sourceKind,
        text: result.text || ""
      }));
      sections.forEach((section, index) => {
        const { part, result } = deidentified[index];
        deps.app.phiReviews.set(reviewKey("context", section.id), createEphemeralRedactionReview(part.sourceText, result));
        deps.setSectionDraftText("context", section.id, section.deidentifiedText);
      });
      deps.app.vault = updateActivePatient(deps.app.vault, (current) => ({
        ...current,
        contextSections: [...(current.contextSections || []), ...sections]
      }));
      deps.app.admissionSourceDraft = "";
      deps.app.admissionSourceParse = null;
      deps.admissionDateAnchor.remember();
      deps.beginSectionReview("context");
      await deps.persistVault(`${sections.length} admission source${sections.length === 1 ? "" : "s"} de-identified and added.`);
      deps.updateDeidOperation({ active: false, message: `${sections.length} admission source${sections.length === 1 ? "" : "s"} de-identified and saved locally.` });
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
