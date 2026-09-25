import { sortDays, upsertDay } from "../../daily-updates/days.js?v=20260921-medication-card-v4";
import { createTextSection, updateActivePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";
import {
  clinicalParseWarning,
  parseClinicalExport,
  prepareClinicalExportForSave
} from "../../patient-context/clinical-export-parser.js?v=20260925-negative-lab-v1";
import {
  createEphemeralRedactionReview,
  reviewKey,
  synchronizeReviewPlaceholders
} from "../../patient-context/review.js?v=20260715-reject-rest";
import {
  admissionSourceKindOptions,
  createSourceCapture,
  dailySourceKindLabel,
  dailySourceKindOptions,
  replaceSourceCapturesFromFormAsync,
  sourceCapturePacketCheck
} from "../../patient-context/source-captures.js?v=20260921-medication-card-v4";
import { NOTE_TYPES } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import {
  createPrimaryTeamNote,
  primaryTeamNoteFields,
  updatePrimaryTeamNoteSection
} from "../../patient-context/primary-team-note.js?v=20260921-medication-card-v4";
import { parsePrimaryTeamNote } from "../../patient-context/primary-team-note-parser.js?v=20260925-one-liner-v1";

export function createDailySourceController(deps) {
  function noteDraftSessionHasContent(draft) {
    const textValues = [
      ...Object.values(draft?.sections || {}),
      draft?.objective?.manual,
      draft?.assessment,
      ...Object.values(draft?.closing || {})
    ];
    return textValues.some((value) => String(value?.deidentifiedText || "").trim())
      || Boolean(draft?.objective?.selectedBlocks?.length)
      || Boolean(draft?.checklistFindings?.selectedBlocks?.length)
      || Boolean(draft?.problems?.length);
  }

  function structuredNoteKey(scope) {
    return scope === "admission" ? "admission" : deps.selectedChecklistDay(deps.active())?.id || "";
  }

  function structuredNoteType(scope) {
    return scope === "admission" ? NOTE_TYPES.H_AND_P : NOTE_TYPES.PROGRESS;
  }

  function existingStructuredNote(scope) {
    const patient = deps.active();
    const day = scope === "admission" ? null : deps.selectedChecklistDay(patient);
    return scope === "admission" ? patient?.admissionPrimaryTeamNote : day?.primaryTeamNote;
  }

  function structuredNoteComposer(scope, { create = true } = {}) {
    const key = structuredNoteKey(scope);
    if (!key) return null;
    const existing = deps.app.structuredNoteComposers.get(key);
    if (existing || !create) return existing || null;
    const noteType = structuredNoteType(scope);
    const composer = {
      mode: existingStructuredNote(scope) ? "sections" : "paste",
      pastedText: "",
      parseResult: parsePrimaryTeamNote("", noteType),
      activeFieldId: primaryTeamNoteFields(noteType)[0]?.id || "",
      dirtyFieldIds: []
    };
    deps.app.structuredNoteComposers.set(key, composer);
    return composer;
  }

  function setStructuredNoteComposer(scope, changes) {
    const key = structuredNoteKey(scope);
    if (!key) return null;
    const current = structuredNoteComposer(scope) || {};
    const next = { ...current, ...changes };
    deps.app.structuredNoteComposers.set(key, next);
    return next;
  }

  function updateStructuredNotePaste(scope, value) {
    const key = structuredNoteKey(scope);
    if (!key) return;
    const noteType = structuredNoteType(scope);
    const parseResult = parsePrimaryTeamNote(value, noteType);
    const composer = structuredNoteComposer(scope);
    const dirty = new Set(composer?.dirtyFieldIds || []);
    const current = deps.app.structuredNoteDrafts.get(key) || {};
    const parsedDrafts = { ...current };
    for (const field of primaryTeamNoteFields(noteType)) {
      if (!dirty.has(field.id)) parsedDrafts[field.id] = parseResult.sections[field.id] || "";
    }
    deps.app.structuredNoteDrafts.set(key, parsedDrafts);
    setStructuredNoteComposer(scope, { pastedText: String(value || ""), parseResult });
    const panel = document.querySelector(`[data-structured-note-detected="${scope}"]`);
    if (panel) panel.innerHTML = deps.dailyPresentation.renderStructuredNoteDetected({ noteType, parseResult, scope });
    document.querySelectorAll(`[data-action="review-structured-note-sections"][data-note-scope="${scope}"]`).forEach((button) => {
      button.disabled = !String(value || "").trim();
      button.textContent = parseResult.detectedSectionCount ? "Review sections" : "Review note";
    });
    const count = document.querySelector(`[data-structured-note-paste-count="${scope}"]`);
    if (count) count.textContent = `${String(value || "").length.toLocaleString()} characters · session only`;
  }

  function setStructuredNoteMode(scope, mode) {
    setStructuredNoteComposer(scope, { mode: mode === "sections" ? "sections" : "paste" });
    deps.render();
  }

  function reviewStructuredNoteSections(scope) {
    const composer = structuredNoteComposer(scope);
    const drafts = deps.app.structuredNoteDrafts.get(structuredNoteKey(scope)) || {};
    const fields = primaryTeamNoteFields(structuredNoteType(scope));
    const detected = new Set(composer?.parseResult?.detectedFieldIds || []);
    // The one-liner is a summary, not a clinical section to review. Open on
    // the first detected clinical section with content.
    const firstDetected = fields.find((field) => field.id !== "one_liner" && detected.has(field.id) && String(drafts[field.id] || "").trim())?.id;
    const firstPopulated = fields.find((field) => field.id !== "one_liner" && String(drafts[field.id] || "").trim())?.id;
    setStructuredNoteComposer(scope, {
      mode: "sections",
      activeFieldId: firstDetected || firstPopulated || composer?.activeFieldId
    });
    deps.render();
  }

  function renderStructuredNoteEditor(scope, { focusFieldId = "" } = {}) {
    const current = document.querySelector(`[data-structured-primary-note-scope="${scope}"]`);
    if (!current) {
      deps.render();
      return;
    }
    const view = current.closest(".view");
    const scrollTop = view?.scrollTop || 0;
    const scrollLeft = view?.scrollLeft || 0;
    current.outerHTML = deps.dailyPresentation.renderStructuredPrimaryNote({
      noteType: structuredNoteType(scope),
      note: existingStructuredNote(scope),
      draftValues: deps.app.structuredNoteDrafts.get(structuredNoteKey(scope)) || {},
      composer: structuredNoteComposer(scope) || {},
      scope,
      deidBusy: deps.app.deidOperation.active
    });
    const restore = () => {
      if (view) {
        view.scrollTop = scrollTop;
        view.scrollLeft = scrollLeft;
      }
    };
    restore();
    requestAnimationFrame(() => {
      const field = focusFieldId
        ? document.querySelector(`[data-structured-note-scope="${scope}"][data-structured-note-field="${focusFieldId}"]`)
        : null;
      field?.focus({ preventScroll: true });
      restore();
      requestAnimationFrame(restore);
    });
  }

  function selectStructuredNoteField(scope, fieldId) {
    const fields = primaryTeamNoteFields(structuredNoteType(scope));
    if (!fields.some((field) => field.id === fieldId)) return;
    setStructuredNoteComposer(scope, { mode: "sections", activeFieldId: fieldId });
    renderStructuredNoteEditor(scope, { focusFieldId: fieldId });
  }

  function moveStructuredNoteField(scope, direction) {
    const fields = primaryTeamNoteFields(structuredNoteType(scope));
    const composer = structuredNoteComposer(scope);
    const currentIndex = Math.max(0, fields.findIndex((field) => field.id === composer?.activeFieldId));
    const nextIndex = Math.min(fields.length - 1, Math.max(0, currentIndex + Number(direction || 0)));
    selectStructuredNoteField(scope, fields[nextIndex]?.id || fields[0]?.id || "");
  }

  function clearStructuredNoteField(scope, fieldId) {
    updateStructuredNoteDraft(scope, fieldId, "");
    deps.render();
  }

  function clearStructuredNotePaste(scope) {
    const composer = structuredNoteComposer(scope);
    setStructuredNoteComposer(scope, { dirtyFieldIds: [] });
    updateStructuredNotePaste(scope, "");
    if (composer?.mode !== "paste") setStructuredNoteComposer(scope, { mode: "paste" });
    deps.render();
  }

  function handleStructuredNoteAction(target) {
    const scope = target.dataset.noteScope || "daily";
    const action = target.dataset.action;
    if (action === "select-structured-note-mode") setStructuredNoteMode(scope, target.dataset.noteMode || "paste");
    else if (action === "review-structured-note-sections") reviewStructuredNoteSections(scope);
    else if (action === "select-structured-note-field") selectStructuredNoteField(scope, target.dataset.noteField || "");
    else if (action === "move-structured-note-field") moveStructuredNoteField(scope, Number(target.dataset.direction || 0));
    else if (action === "clear-structured-note-field") clearStructuredNoteField(scope, target.dataset.noteField || "");
    else if (action === "clear-structured-note-paste") clearStructuredNotePaste(scope);
    else return false;
    return true;
  }

  function handleInput(target) {
    if (target.matches("[data-result-metadata]")) updateResultMetadata(target.dataset.resultScope || "daily", target.dataset.resultMetadata, target.value);
    else if (target.matches("[data-structured-note-paste]")) updateStructuredNotePaste(target.dataset.structuredNoteScope || "daily", target.value);
    else if (target.matches("[data-structured-note-field]")) updateStructuredNoteDraft(target.dataset.structuredNoteScope || "daily", target.dataset.structuredNoteField, target.value);
    else return false;
    return true;
  }

  function updateStructuredNoteDraft(scope, fieldId, value) {
    const key = structuredNoteKey(scope);
    if (!key) return;
    const current = deps.app.structuredNoteDrafts.get(key) || {};
    deps.app.structuredNoteDrafts.set(key, { ...current, [fieldId]: String(value || "") });
    const composer = structuredNoteComposer(scope);
    const dirty = new Set(composer?.dirtyFieldIds || []);
    dirty.add(fieldId);
    setStructuredNoteComposer(scope, { activeFieldId: fieldId, dirtyFieldIds: [...dirty] });
    const row = document.querySelector(`[data-action="select-structured-note-field"][data-note-scope="${scope}"][data-note-field="${fieldId}"]`);
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    const status = row?.querySelector(".structured-note-section-status");
    if (status) { status.classList.toggle("complete", Boolean(cleaned)); status.textContent = cleaned ? "✓" : ""; }
    const snippet = row?.querySelector("small");
    if (snippet) snippet.textContent = cleaned ? (cleaned.length > 54 ? `${cleaned.slice(0, 53)}…` : cleaned) : "Not added";
    const nav = row?.closest(".structured-note-section-nav");
    const count = nav?.querySelector(".structured-note-section-nav-heading span");
    if (count) count.textContent = `${nav.querySelectorAll(".structured-note-section-status.complete").length} of ${primaryTeamNoteFields(structuredNoteType(scope)).length} added`;
  }

  async function saveStructuredPrimaryNote(scope) {
    const patient = deps.active();
    const day = scope === "admission" ? null : deps.selectedChecklistDay(patient);
    if (!patient) throw new Error("Select a patient first.");
    if (scope !== "admission" && !day) throw new Error("Add a hospital day first.");
    const noteType = scope === "admission" ? NOTE_TYPES.H_AND_P : NOTE_TYPES.PROGRESS;
    const key = structuredNoteKey(scope);
    const existing = scope === "admission" ? patient.admissionPrimaryTeamNote : day.primaryTeamNote;
    const draftValues = deps.app.structuredNoteDrafts.get(key) || {};
    let note = existing || createPrimaryTeamNote(noteType, {
      patientId: patient.id,
      hospitalDayId: day?.id || ""
    });
    deps.updateDeidOperation({ active: true, message: "De-identifying primary-team note sections locally…", value: 0, total: primaryTeamNoteFields(noteType).length });
    try {
      await deps.ensureSelectedDeidReady();
      const fields = primaryTeamNoteFields(noteType);
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        const rawText = Object.hasOwn(draftValues, field.id)
          ? draftValues[field.id]
          : existing?.sections?.[field.id]?.deidentifiedText || "";
        const result = rawText.trim()
          ? await deps.deidentify(rawText, { referenceDate: day?.date || deps.app.admissionDate })
          : { text: "", residualWarnings: [] };
        note = updatePrimaryTeamNoteSection(note, field.id, {
          deidentifiedText: result.text || "",
          residualWarnings: result.residualWarnings || result.flags || []
        });
        deps.updateDeidOperation({ active: true, message: `De-identified ${index + 1} of ${fields.length} note sections locally.`, value: index + 1, total: fields.length });
      }
      deps.app.vault = updateActivePatient(deps.app.vault, (current) => {
        if (scope === "admission") return { ...current, admissionPrimaryTeamNote: note };
        const nextDay = { ...day, primaryTeamNote: note, updatedAt: new Date().toISOString() };
        return { ...current, days: upsertDay(current.days, nextDay) };
      });
      deps.app.structuredNoteDrafts.delete(key);
      deps.app.structuredNoteComposers.delete(key);
      if (!noteDraftSessionHasContent(deps.app.noteDraftSessions.get(key))) deps.app.noteDraftSessions.delete(key);
      await deps.persistVault(`${noteType === NOTE_TYPES.H_AND_P ? "H&P" : "Progress-note"} source de-identified and saved locally.`);
      deps.updateDeidOperation({ active: false, message: "Primary-team note saved in the encrypted vault." });
      deps.setStatus("Primary-team note saved in the encrypted vault.");
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "The structured note was not saved." });
      throw error;
    }
  }

  // Save the primary note form values directly to the draft session WITHOUT
  // de-identification. This lets the student transfer their work to the Draft
  // Note tab immediately, then de-identify separately via "Save note".
  // The draft session holds raw text (not persisted to vault); the vault only
  // receives de-identified text via saveStructuredPrimaryNote.
  function saveStructuredNoteToDraft(scope) {
    const patient = deps.active();
    if (!patient) throw new Error("Select a patient first.");
    const key = structuredNoteKey(scope);
    if (!key) throw new Error("Select a hospital day first.");
    const draftValues = deps.app.structuredNoteDrafts.get(key) || {};
    const noteType = structuredNoteType(scope);
    const fields = primaryTeamNoteFields(noteType);

    // Build a draft from the raw form values (not de-identified).
    const sections = {};
    for (const field of fields) {
      const rawText = Object.hasOwn(draftValues, field.id) ? draftValues[field.id] : "";
      if (rawText?.trim()) {
        sections[field.id] = { deidentifiedText: rawText.trim(), notDeidentified: true };
      }
    }

    if (Object.keys(sections).length === 0) {
      throw new Error("No note content to save. Type or paste note text first.");
    }

    // Get or create the draft session, update with the raw sections.
    let draft = deps.app.noteDraftSessions.get(key);
    if (!draft) {
      // Create a minimal draft structure; the review controller will populate the rest.
      draft = { noteType, sections: {}, objective: { selectedBlocks: [] } };
    }
    draft = {
      ...draft,
      sections: { ...draft.sections, ...sections },
      _hasRawText: true,
      _rawTextWarning: "This draft contains text that has not been de-identified."
    };
    deps.app.noteDraftSessions.set(key, draft);
    // Sync the Review tab's selected packet to this day so the saved draft
    // is visible when the user navigates to Review Data / Draft Note.
    deps.app.reviewPacketId = key;
    deps.setStatus("Note saved to draft (not de-identified). Use 'De-identify & save' to de-identify and save to vault.");
    deps.render();
  }

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
    const prepared = prepareClinicalExportForSave(deps.app[state.draftKey], deps.app[state.parseKey], {
      sourceKind: deps.app[state.kindKey]
    });
    deps.app[state.parseKey] = prepared.parseResult;
    if (prepared.parseResult.suggestedSourceKind && state.options.some((option) => option.id === prepared.parseResult.suggestedSourceKind)) {
      deps.app[state.kindKey] = prepared.parseResult.suggestedSourceKind;
    }
    return prepared;
  }

  function sourcePartsForSave(prepared, fallbackSourceKind, resultMetadata = {}) {
    const sections = Array.isArray(prepared.parseResult.sections) ? prepared.parseResult.sections : [];
    if (sections.length) {
      return sections
        .map((section) => ({
          sourceKind: section.sourceKind || "other_chart_text",
          label: section.formatLabel || "Parsed chart source",
          panelLabel: section.panelLabel || "",
          resultCategory: section.sourceKind === "results" ? (section.resultCategory || resultMetadata.category || "") : "",
          resultDate: section.sourceKind === "results" ? (section.resultDate || resultMetadata.date || "") : "",
          resultContext: section.sourceKind === "results" ? (section.resultContext || resultMetadata.context || "") : "",
          sourceText: String(section.edited ? section.outputText : section.canonicalPromptText || section.outputText || "").trim()
        }))
        .filter((section) => section.sourceText);
    }
    return prepared.sourceText
      ? [{
          sourceKind: prepared.parseResult.suggestedSourceKind || fallbackSourceKind,
          label: (prepared.parseResult.suggestedSourceKind || fallbackSourceKind) === "results"
            ? String(resultMetadata.label || prepared.parseResult.formatLabel || "Diagnostic result")
            : (prepared.parseResult.recognized ? prepared.parseResult.formatLabel : ""),
          resultCategory: (prepared.parseResult.suggestedSourceKind || fallbackSourceKind) === "results" ? resultMetadata.category : "",
          resultDate: (prepared.parseResult.suggestedSourceKind || fallbackSourceKind) === "results" ? resultMetadata.date : "",
          resultContext: (prepared.parseResult.suggestedSourceKind || fallbackSourceKind) === "results" ? resultMetadata.context : "",
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
      const result = await deps.deidentify(part.sourceText, { referenceDate });
      const safeCollectionTime = part.panelLabel
        ? String(result.text || "").match(/^@\s*(.+)$/m)?.[1] || ""
        : "";
      deidentified.push({
        part: part.panelLabel
          ? { ...part, label: [part.panelLabel, safeCollectionTime].filter(Boolean).join(" · ") }
          : part,
        result
      });
    }
    return deidentified;
  }

  function updateDraft(scope, value) {
    const state = sourceState(scope);
    deps.app[state.draftKey] = String(value || "");
    const parsed = parseClinicalExport(value, { sourceKind: deps.app[state.kindKey] });
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

  function selectSourceKind(scope, sourceKind) {
    const state = sourceState(scope);
    deps.app[state.kindKey] = state.options.some((option) => option.id === sourceKind)
      ? sourceKind
      : "primary_note";
    updateDraft(scope, deps.app[state.draftKey]);
  }

  function updateResultMetadata(scope, field, value) {
    const key = scope === "admission" ? "admissionResultMetadata" : "dailyResultMetadata";
    if (!Object.hasOwn(deps.app[key], field)) return;
    deps.app[key] = { ...deps.app[key], [field]: String(value || "") };
  }

  function updateParsedDraft(scope, value, sectionIndex = "") {
    const state = sourceState(scope);
    const parsed = deps.app[state.parseKey];
    if (!parsed?.recognized) return;
    const numericSectionIndex = sectionIndex === "" ? -1 : Number(sectionIndex);
    if (numericSectionIndex >= 0 && Array.isArray(parsed.sections)) {
      const sections = parsed.sections.map((section, index) => index === numericSectionIndex ? { ...section, outputText: String(value || ""), edited: true } : section);
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
        vital_signs: "admission_results",
        laboratory_results: "admission_results",
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
      label: row.querySelector("[data-saved-result-label]")?.value || row.dataset.sourceLabel || row.querySelector(".source-kind option:checked")?.textContent || "Other chart text",
      resultCategory: row.querySelector("[data-saved-result-category]")?.value || "",
      resultDate: row.querySelector("[data-saved-result-date]")?.value || "",
      resultContext: row.querySelector("[data-saved-result-context]")?.value || "",
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
      structuredDisplay: "",
      parseWarning: clinicalParseWarning(capture.sourceKind, draftText),
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
      structuredNoteDrafts: Object.fromEntries(deps.app.structuredNoteDrafts),
      structuredNoteComposers: Object.fromEntries(deps.app.structuredNoteComposers),
      dailyResultMetadata: deps.app.dailyResultMetadata,
      admissionResultMetadata: deps.app.admissionResultMetadata,
      packetCheck: sourceCapturePacketCheck(selected?.sourceCaptures || [], { structuredNote: selected?.primaryTeamNote, scope: "daily" }),
      admissionPacketCheck: sourceCapturePacketCheck(
        (patient?.contextSections || []).filter(
          (section) => String(section.deidentifiedText || "").trim() || (section.residualWarnings || []).length
        ),
        { structuredNote: patient?.admissionPrimaryTeamNote, scope: "admission" }
      ),
      deidBusy: deps.app.deidOperation.active
    });
  }

  async function addSource() {
    const day = deps.selectedChecklistDay(deps.active());
    if (!day) throw new Error("Add a hospital day first.");
    if (deps.app.dailySourceKind === "results" && !deps.app.dailyResultMetadata.label.trim())
      throw new Error("Enter a descriptive result label before adding this result.");
    const prepared = sourceTextForSave("daily");
    const parts = sourcePartsForSave(prepared, deps.app.dailySourceKind, deps.app.dailyResultMetadata);
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
        resultCategory: part.resultCategory,
        resultDate: part.resultDate,
        resultContext: part.resultContext,
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
      deps.app.dailyResultMetadata = { label: "", category: "imaging", date: "", context: "" };
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
    if (deps.app.admissionSourceKind === "results" && !deps.app.admissionResultMetadata.label.trim())
      throw new Error("Enter a descriptive result label before adding this result.");
    const prepared = sourceTextForSave("admission");
    const parts = sourcePartsForSave(prepared, deps.app.admissionSourceKind, deps.app.admissionResultMetadata);
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
      const sections = deidentified.map(({ part, result }) => createTextSection(part.label || dailySourceKindLabel(part.sourceKind), {
        scope: "context",
        role: admissionRoleForSourceKind(part.sourceKind),
        sourceKind: part.sourceKind,
        resultCategory: part.resultCategory,
        resultDate: part.resultDate,
        resultContext: part.resultContext,
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
      deps.app.admissionResultMetadata = { label: "", category: "imaging", date: "", context: "" };
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

  return Object.freeze({
    addAdmissionSource,
    addSource,
    clearStructuredNoteField,
    clearStructuredNotePaste,
    handleStructuredNoteAction,
    handleInput,
    moveStructuredNoteField,
    renderDaily,
    saveSources,
    saveStructuredPrimaryNote,
    saveStructuredNoteToDraft,
    selectPacket,
    selectSourceKind,
    selectStructuredNoteField,
    setStructuredNoteMode,
    updateDraft,
    updateParsedDraft,
    updateResultMetadata,
    updateStructuredNoteDraft,
    updateStructuredNotePaste
  });
}
