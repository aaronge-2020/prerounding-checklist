import { sortDays } from "../../daily-updates/days.js?v=20260921-medication-card-v4";
import { updateActivePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";
import { buildClinicalReviewIndex } from "../../review-data/index.js?v=20260922-readable-objective-v1&labs=analyte-selection-v3";
import {
  addDifferential,
  addPlanProblem,
  buildChecklistNoteCandidates,
  changeNoteDraftType,
  createNoteDraft,
  deselectObjectiveBlock,
  editObjectiveBlock,
  fieldsForNoteType,
  keepObjectiveBlock,
  NOTE_TYPES,
  normalizeNoteDraft,
  reconcileObjectiveBlock,
  reconcileChecklistFinding,
  refreshObjectiveBlock,
  removeDifferential,
  removePlanProblem,
  renderFinalNote,
  renderFinalNoteHtml,
  renderFinalNotePlainText,
  reorderDifferentials,
  reorderPlanProblems,
  selectObjectiveBlock,
  selectChecklistFinding,
  studentGuidance,
  updateAssessment,
  updateClosingSection,
  updateDifferential,
  updateManualObjective,
  updateNoteSection,
  updatePlanProblem
} from "../../note-drafts/index.js?v=20260924-note-grouping-v1";
import { parseClinicalPlanProblems } from "../../patient-context/clinical-plan-parser.js?v=20260923-plan-problems-v1";
import {
  clearLabBaseline,
  setLabBaseline
} from "../../patient-context/lab-baselines.js?v=20260924-lab-baselines-v1";

function packetKey(value) {
  return String(value || "admission");
}

function moveId(ids, id, direction) {
  const next = [...ids];
  const index = next.indexOf(id);
  const destination = index + Number(direction || 0);
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

function sourceNoteForPacket(patient, selectedPacketId) {
  if (selectedPacketId === "admission") return patient?.admissionPrimaryTeamNote || null;
  return patient?.days?.find((day) => day.id === selectedPacketId)?.primaryTeamNote || null;
}

function draftFromSource(patient, selectedPacketId) {
  const noteType = selectedPacketId === "admission" ? NOTE_TYPES.H_AND_P : NOTE_TYPES.PROGRESS;
  let draft = createNoteDraft(noteType, {
    patientId: patient?.id || "",
    hospitalDayId: selectedPacketId === "admission" ? "" : selectedPacketId
  });
  const source = sourceNoteForPacket(patient, selectedPacketId);
  if (!source) return draft;

  if (selectedPacketId === "admission") {
    for (const { id } of fieldsForNoteType(noteType)) {
      if (source?.sections?.[id]) draft = updateNoteSection(draft, id, source.sections[id]);
    }
  } else {
    for (const { id } of fieldsForNoteType(noteType)) {
      if (id !== "patient_report" && source?.sections?.[id]) {
        draft = updateNoteSection(draft, id, source.sections[id]);
      }
    }
  }

  const rawPlan = source?.sections?.plan?.deidentifiedText || source?.sections?.plan || "";
  const problems = source?.parsedProblems || (rawPlan ? parseClinicalPlanProblems(rawPlan) : []);
  if (Array.isArray(problems) && problems.length > 0 && (!draft.problems || draft.problems.length === 0)) {
    for (const p of problems) {
      draft = addPlanProblem(draft, {
        problem: p.problem || p.title || "",
        keyContext: p.keyContext || "",
        knownEtiology: p.knownEtiology || "",
        differentials: p.differentials || [],
        diagnosticPlan: p.diagnosticPlan || "",
        therapeuticPlan: p.therapeuticPlan || ""
      });
    }
  }

  return draft;
}

export function createReviewController(deps) {
  // Which lab row currently has its baseline editor open. Local UI state:
  // the saved baselines themselves live on the patient record in the vault.
  let baselineEditorId = "";

  function packets(patient) {
    return [
      { id: "admission", label: "Admission H&P", date: "" },
      ...sortDays(patient?.days || []).map((day, index) => ({ id: day.id, label: `${day.label || `Hospital day ${index + 1}`} · Progress note`, date: day.date }))
    ];
  }

  function selectedPacket(patient) {
    const available = packets(patient);
    const selected = available.find((entry) => entry.id === deps.app.reviewPacketId) || available.at(-1) || available[0];
    deps.app.reviewPacketId = selected?.id || "admission";
    return selected;
  }

  function reviewDraft(patient, selectedPacketId, index, checklistCandidates) {
    const key = packetKey(selectedPacketId);
    let draft = deps.app.noteDraftSessions.get(key) || patient?.noteDrafts?.[key] || draftFromSource(patient, key);
    draft = normalizeNoteDraft(draft);

    if (!draft.problems || draft.problems.length === 0) {
      const source = sourceNoteForPacket(patient, selectedPacketId);
      const rawPlan = source?.sections?.plan?.deidentifiedText || source?.sections?.plan || "";
      const problems = source?.parsedProblems || (rawPlan ? parseClinicalPlanProblems(rawPlan) : []);
      if (Array.isArray(problems) && problems.length > 0) {
        for (const p of problems) {
          draft = addPlanProblem(draft, {
            problem: p.problem || p.title || "",
            keyContext: p.keyContext || "",
            knownEtiology: p.knownEtiology || "",
            differentials: p.differentials || [],
            diagnosticPlan: p.diagnosticPlan || "",
            therapeuticPlan: p.therapeuticPlan || ""
          });
        }
      }
    }
    const candidates = new Map((index.objectiveCandidates || index.candidates).map((candidate) => [candidate.id, candidate]));
    for (const block of draft.objective.selectedBlocks) {
      const candidate = candidates.get(block.selectionId);
      if (candidate) draft = reconcileObjectiveBlock(draft, {
        selectionId: candidate.id,
        sourceFingerprint: candidate.fingerprint,
        generatedText: candidate.insertionText
      });
    }
    const checklistById = new Map(checklistCandidates.map((candidate) => [candidate.id, candidate]));
    for (const candidate of checklistCandidates) {
      const existing = draft.checklistFindings.selectedBlocks.find((block) => block.selectionId === candidate.id);
      draft = existing ? reconcileChecklistFinding(draft, candidate) : selectChecklistFinding(draft, candidate);
    }
    if (draft.checklistFindings.selectedBlocks.some((block) => !checklistById.has(block.selectionId))) {
      draft = normalizeNoteDraft({
        ...draft,
        checklistFindings: {
          selectedBlocks: draft.checklistFindings.selectedBlocks.filter((block) => checklistById.has(block.selectionId))
        }
      });
    }
    deps.app.noteDraftSessions.set(key, draft);
    return draft;
  }

  function setDraft(draft) {
    deps.app.noteDraftSessions.set(packetKey(deps.app.reviewPacketId), draft);
  }

  function model() {
    const patient = deps.active();
    if (!patient) return { patient: null };
    const packet = selectedPacket(patient);
    const index = buildClinicalReviewIndex(patient);
    const checklistCandidates = buildChecklistNoteCandidates(patient, packet.id);
    const draft = reviewDraft(patient, packet.id, index, checklistCandidates);
    return {
      patient,
      packet,
      index,
      checklistCandidates,
      draft,
      oneLiner: draft.sections.one_liner.deidentifiedText || ""
    };
  }

  // The compact sheet renders every matching row on one page, so render() and
  // the live search patch share one view-model builder.
  function reviewViewModel(current) {
    return {
      patientLabel: current.patient.displayLabel,
      oneLiner: current.oneLiner,
      packets: packets(current.patient),
      selectedPacketId: current.packet.id,
      index: current.index,
      query: deps.app.reviewSearchQuery,
      category: deps.app.reviewCategory,
      draft: current.draft,
      guidanceFor: (sectionId) => studentGuidance(current.draft.noteType, sectionId),
      differenceSelectionId: deps.app.reviewDifferenceSelectionId,
      finalNote: renderFinalNote(current.draft),
      finalNoteHtml: renderFinalNoteHtml(current.draft),
      baselineEditorId,
      patientRequiredMessage: deps.patientRequiredMessage()
    };
  }

  function render() {
    const current = model();
    deps.byId("reviewContent").innerHTML = current.patient
      ? deps.presentation.renderReview(reviewViewModel(current))
      : deps.patientRequiredMessage();
  }

  function prepare(selectedPacketId = "admission") {
    deps.app.reviewPacketId = selectedPacketId || "admission";
    deps.app.reviewSearchQuery = "";
    deps.app.reviewCategory = "all";
  }

  function open(selectedPacketId = "admission") {
    prepare(selectedPacketId);
    deps.app.view = "review";
    deps.render();
  }

  function updateInput(target) {
    const current = model();
    if (!current.patient) return false;
    let draft = current.draft;
    if (target.matches("[data-draft-section]")) draft = updateNoteSection(draft, target.dataset.draftSection, target.value);
    else if (target.matches("[data-draft-objective-manual]")) draft = updateManualObjective(draft, target.value);
    else if (target.matches("[data-objective-block-text]")) draft = editObjectiveBlock(draft, target.dataset.objectiveBlockText, target.value);
    else if (target.matches("[data-draft-assessment]")) draft = updateAssessment(draft, target.value);
    else if (target.matches("[data-draft-closing]")) draft = updateClosingSection(draft, target.dataset.draftClosing, target.value);
    else {
      const problemCard = target.closest("[data-problem-id]");
      const differentialCard = target.closest("[data-differential-id]");
      if (target.matches("[data-differential-field]") && problemCard && differentialCard) {
        draft = updateDifferential(draft, problemCard.dataset.problemId, differentialCard.dataset.differentialId, { [target.dataset.differentialField]: target.value });
      } else if (target.matches("[data-problem-field]") && problemCard) {
        draft = updatePlanProblem(draft, problemCard.dataset.problemId, { [target.dataset.problemField]: target.value });
      } else return false;
    }
    setDraft(draft);
    const preview = deps.byId("reviewContent")?.querySelector("[data-final-note-preview]");
    if (preview) preview.innerHTML = renderFinalNoteHtml(draft) || `<p class="muted">Start writing to build the note preview.</p>`;
    return true;
  }

  function change(target) {
    const current = model();
    if (!current.patient) return false;
    if (target.id === "reviewPacketSelect") {
      deps.app.reviewPacketId = target.value || "admission";
      deps.app.reviewDifferenceSelectionId = "";
      deps.render();
      return true;
    }
    if (target.id === "reviewNoteType") {
      setDraft(changeNoteDraftType(current.draft, target.value));
      render();
      return true;
    }
    if (target.id === "reviewDataCategory") {
      deps.app.reviewCategory = target.value || "all";
      render();
      return true;
    }
    if (target.matches("[data-objective-selection-id]")) {
      const candidate = (current.index.objectiveCandidates || current.index.candidates).find((entry) => entry.id === target.dataset.objectiveSelectionId);
      if (!candidate) return true;
      let draft = current.draft;
      if (target.checked) {
        if (target.matches("[data-lab-panel-selection]")) {
          const panel = current.index.labs.find((entry) => entry.id === candidate.id);
          for (const result of panel?.results || []) draft = deselectObjectiveBlock(draft, result.selectionCandidate?.id);
          // Report-only and pending rows lifted out of the panel into the
          // compact sheet still belong to it: selecting the whole panel
          // replaces their individual selections.
          for (const item of [...(current.index.reportItems || []), ...(current.index.pendingItems || [])]) {
            if (item.panelId === candidate.id) draft = deselectObjectiveBlock(draft, item.selectionCandidate.id);
          }
        } else if (target.matches("[data-lab-result-selection]")) {
          const panelIds = new Set();
          for (const panel of current.index.labs) {
            if (panel.results.some((result) => result.selectionCandidate?.id === candidate.id)) panelIds.add(panel.id);
          }
          if (candidate.panelId) panelIds.add(candidate.panelId);
          for (const panelId of panelIds) draft = deselectObjectiveBlock(draft, panelId);
        }
        draft = selectObjectiveBlock(draft, {
          selectionId: candidate.id,
          sourceFingerprint: candidate.fingerprint,
          generatedText: candidate.insertionText,
          kind: candidate.kind,
          noteGroupKey: candidate.noteGroupKey,
          noteGroupLabel: candidate.noteGroupLabel,
          noteLabel: candidate.noteLabel,
          noteDetail: candidate.noteDetail
        });
      } else {
        draft = deselectObjectiveBlock(draft, candidate.id);
      }
      setDraft(draft);
      render();
      return true;
    }
    if (target.matches("[data-problem-etiology]")) {
      const problemId = target.closest("[data-problem-id]")?.dataset.problemId;
      if (problemId) setDraft(updatePlanProblem(current.draft, problemId, { etiologyStatus: target.value }));
      render();
      return true;
    }
    return false;
  }

  function input(target) {
    if (target.id === "reviewDataSearch") {
      deps.app.reviewSearchQuery = target.value;
      const current = model();
      if (!current.patient) return true;
      const rendered = deps.presentation.renderReview(reviewViewModel(current));
      // Patch only the clinical-data sheet so the search field keeps focus.
      const template = document.createElement("template");
      template.innerHTML = rendered;
      const nextList = template.content.querySelector(".review-data-list");
      const nextSummary = template.content.querySelector(".review-filter-summary");
      const wrapper = deps.byId("reviewContent")?.querySelector(".review-data-list");
      const summary = deps.byId("reviewContent")?.querySelector(".review-filter-summary");
      if (summary && nextSummary) summary.textContent = nextSummary.textContent;
      if (wrapper && nextList) wrapper.replaceChildren(...nextList.childNodes);
      return true;
    }
    return updateInput(target);
  }

  async function saveDraft() {
    const current = model();
    if (!current.patient) return;
    const savedDraft = normalizeNoteDraft(current.draft);
    deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({
      ...patient,
      noteDrafts: { ...(patient.noteDrafts || {}), [current.packet.id]: savedDraft }
    }));
    setDraft(savedDraft);
    const ephemeralDemo = deps.isEphemeralDemo?.();
    if (!ephemeralDemo) await deps.persistVault("Encrypted note draft saved.");
    const savedMessage = ephemeralDemo ? "Demo note kept only for this temporary walkthrough." : "Encrypted note draft saved.";
    deps.setStatus(savedMessage);
    deps.onDraftSaved?.();
    deps.render();
  }

  async function saveLabBaseline(analyte, fields, { clear = false } = {}) {
    const current = model();
    if (!current.patient) return;
    deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({
      ...patient,
      labBaselines: clear
        ? clearLabBaseline(patient.labBaselines, analyte)
        : setLabBaseline(patient.labBaselines, analyte, fields)
    }));
    baselineEditorId = "";
    render();
    const ephemeralDemo = deps.isEphemeralDemo?.();
    if (!ephemeralDemo) await deps.persistVault(clear ? "Baseline cleared." : "Baseline saved.");
    deps.setStatus(ephemeralDemo
      ? "Baseline change kept only for this temporary walkthrough."
      : clear ? "Baseline cleared." : "Baseline saved — the review sheet and note now show it.");
  }

  function click(target) {
    const action = target.closest("[data-action]")?.dataset.action;
    const button = target.closest("[data-action]");
    if (!action || !button) return false;
    const current = model();
    if (!current.patient) return false;
    let draft = current.draft;
    if (action === "save-note-draft") {
      void saveDraft();
      return true;
    }
    if (action === "copy-final-note") {
      void deps.copyText(renderFinalNotePlainText(current.draft)).then(() => deps.setStatus("Plain-text note copied for Epic or another destination."));
      return true;
    }
    if (action === "copy-rich-note") {
      const html = renderFinalNoteHtml(current.draft);
      const plain = renderFinalNotePlainText(current.draft);
      void (async () => {
        try {
          if (!html) throw new Error("empty note");
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" })
            })
          ]);
          deps.setStatus("Rich-text note copied — paste into a document editor to keep headings and tables.");
        } catch (error) {
          try {
            await deps.copyText(plain);
            deps.setStatus("Rich copy was unavailable; plain-text note copied instead.");
          } catch {
            deps.setStatus("Copy failed. Select the preview text manually.");
          }
        }
      })();
      return true;
    }
    if (action === "download-final-note") {
      const label = String(current.patient.displayLabel || "patient-note").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "patient-note";
      deps.downloadText(`${label}-${current.draft.noteType === NOTE_TYPES.H_AND_P ? "hp" : "progress-note"}.txt`, renderFinalNotePlainText(current.draft));
      deps.setStatus("Plain-text note downloaded.");
      return true;
    }
    if (action === "baseline-edit") {
      baselineEditorId = button.dataset.baselineResultId || "";
      render();
      return true;
    }
    if (action === "baseline-cancel") {
      baselineEditorId = "";
      render();
      return true;
    }
    if (action === "baseline-save" || action === "baseline-clear") {
      const editor = button.closest(".lab-cell")?.querySelector("[data-baseline-editor]");
      const analyte = editor?.dataset.baselineAnalyte || "";
      if (!editor || !analyte) return true;
      if (action === "baseline-clear") {
        void saveLabBaseline(analyte, {}, { clear: true });
        return true;
      }
      const fields = {};
      editor.querySelectorAll("[data-baseline-field]").forEach((input) => {
        fields[input.dataset.baselineField] = input.value;
      });
      if (!String(fields.value || "").trim()) {
        deps.setStatus("Enter a baseline value before saving.");
        return true;
      }
      void saveLabBaseline(analyte, fields);
      return true;
    }
    if (action === "insert-no-acute-events") {
      draft = updateNoteSection(draft, "interval_events", "No acute events overnight.");
    } else if (action === "add-plan-problem") draft = addPlanProblem(draft);
    else if (action === "remove-plan-problem") draft = removePlanProblem(draft, button.dataset.problemId);
    else if (action === "move-plan-problem") draft = reorderPlanProblems(draft, moveId(draft.problems.map((entry) => entry.id), button.dataset.problemId, button.dataset.direction));
    else if (action === "add-differential") draft = addDifferential(draft, button.dataset.problemId);
    else if (action === "remove-differential") draft = removeDifferential(draft, button.dataset.problemId, button.dataset.differentialId);
    else if (action === "move-differential") {
      const problem = draft.problems.find((entry) => entry.id === button.dataset.problemId);
      draft = reorderDifferentials(draft, button.dataset.problemId, moveId(problem?.differentials.map((entry) => entry.id) || [], button.dataset.differentialId, button.dataset.direction));
    } else if (action === "remove-objective-selection") draft = deselectObjectiveBlock(draft, button.dataset.selectionId);
    else if (action === "refresh-objective-selection") draft = refreshObjectiveBlock(draft, button.dataset.selectionId);
    else if (action === "keep-objective-selection") draft = keepObjectiveBlock(draft, button.dataset.selectionId);
    else if (action === "review-objective-difference") {
      deps.app.reviewDifferenceSelectionId = deps.app.reviewDifferenceSelectionId === button.dataset.selectionId ? "" : button.dataset.selectionId;
      render();
      return true;
    } else return false;
    setDraft(draft);
    render();
    return true;
  }

  return Object.freeze({ change, click, input, open, prepare, render, saveDraft });
}
