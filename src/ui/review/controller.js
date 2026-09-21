import { sortDays } from "../../daily-updates/days.js?v=20260921-checklist-note-export";
import { updateActivePatient } from "../../app/state/vault.js?v=20260921-checklist-note-export";
import { buildClinicalReviewIndex, filterClinicalReviewCandidates } from "../../review-data/index.js?v=20260921-checklist-note-export";
import {
  addDifferential,
  addPlanProblem,
  buildChecklistNoteCandidates,
  createNoteDraft,
  deselectChecklistFinding,
  deselectObjectiveBlock,
  editChecklistFinding,
  editObjectiveBlock,
  fieldsForNoteType,
  keepObjectiveBlock,
  keepChecklistFinding,
  NOTE_TYPES,
  normalizeNoteDraft,
  reconcileObjectiveBlock,
  reconcileChecklistFinding,
  refreshChecklistFinding,
  refreshObjectiveBlock,
  removeDifferential,
  removePlanProblem,
  renderFinalNote,
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
} from "../../note-drafts/index.js?v=20260921-checklist-note-export";

const REVIEW_PAGE_SIZE = 8;

function pageSizeForCategory(category) {
  return category === "labs" ? 1 : REVIEW_PAGE_SIZE;
}

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
  for (const { id } of fieldsForNoteType(noteType)) {
    if (source?.sections?.[id]) draft = updateNoteSection(draft, id, source.sections[id]);
  }
  return draft;
}

async function deidentifyDraftText(value, deidentify, referenceDate) {
  const original = String(value?.deidentifiedText || "");
  if (!original.trim()) return { ...value, deidentifiedText: "", residualWarnings: [] };
  const result = await deidentify(original, { referenceDate });
  return {
    ...value,
    deidentifiedText: String(result.text || ""),
    residualWarnings: Array.isArray(result.residualWarnings) ? result.residualWarnings : (result.flags || []),
    updatedAt: new Date().toISOString()
  };
}

async function deidentifyDraft(draft, deidentify, referenceDate) {
  const sections = Object.fromEntries(await Promise.all(Object.entries(draft.sections).map(async ([key, value]) => [key, await deidentifyDraftText(value, deidentify, referenceDate)])));
  const closing = Object.fromEntries(await Promise.all(Object.entries(draft.closing).map(async ([key, value]) => [key, await deidentifyDraftText(value, deidentify, referenceDate)])));
  const manual = await deidentifyDraftText(draft.objective.manual, deidentify, referenceDate);
  const selectedBlocks = [];
  for (const block of draft.objective.selectedBlocks) {
    const result = block.editedText === block.generatedText
      ? { text: block.editedText }
      : await deidentify(block.editedText, { referenceDate });
    selectedBlocks.push({ ...block, editedText: String(result.text || "") });
  }
  const checklistBlocks = [];
  for (const block of draft.checklistFindings.selectedBlocks) {
    const [generated, edited] = await Promise.all([
      deidentify(block.generatedText, { referenceDate }),
      deidentify(block.editedText, { referenceDate })
    ]);
    checklistBlocks.push({ ...block, generatedText: String(generated.text || ""), editedText: String(edited.text || "") });
  }
  const problems = [];
  for (const problem of draft.problems) {
    const differentials = [];
    for (const differential of problem.differentials) {
      differentials.push({
        ...differential,
        diagnosis: await deidentifyDraftText(differential.diagnosis, deidentify, referenceDate),
        cluesFor: await deidentifyDraftText(differential.cluesFor, deidentify, referenceDate),
        cluesAgainst: await deidentifyDraftText(differential.cluesAgainst, deidentify, referenceDate)
      });
    }
    problems.push({
      ...problem,
      problem: await deidentifyDraftText(problem.problem, deidentify, referenceDate),
      keyContext: await deidentifyDraftText(problem.keyContext, deidentify, referenceDate),
      knownEtiology: await deidentifyDraftText(problem.knownEtiology, deidentify, referenceDate),
      diagnosticPlan: await deidentifyDraftText(problem.diagnosticPlan, deidentify, referenceDate),
      therapeuticPlan: await deidentifyDraftText(problem.therapeuticPlan, deidentify, referenceDate),
      differentials
    });
  }
  return normalizeNoteDraft({
    ...draft,
    sections,
    objective: { manual, selectedBlocks },
    checklistFindings: { selectedBlocks: checklistBlocks },
    assessment: await deidentifyDraftText(draft.assessment, deidentify, referenceDate),
    problems,
    closing,
    updatedAt: new Date().toISOString()
  });
}

export function createReviewController(deps) {
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
    const candidates = new Map(index.candidates.map((candidate) => [candidate.id, candidate]));
    for (const block of draft.objective.selectedBlocks) {
      const candidate = candidates.get(block.selectionId);
      if (candidate) draft = reconcileObjectiveBlock(draft, {
        selectionId: candidate.id,
        sourceFingerprint: candidate.fingerprint,
        generatedText: candidate.insertionText
      });
    }
    const checklistById = new Map(checklistCandidates.map((candidate) => [candidate.id, candidate]));
    for (const block of draft.checklistFindings.selectedBlocks) {
      const candidate = checklistById.get(block.selectionId);
      if (candidate) draft = reconcileChecklistFinding(draft, candidate);
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
    const group = deps.app.reviewCategory === "all" ? "" : deps.app.reviewCategory;
    const matchingCandidates = filterClinicalReviewCandidates(index, deps.app.reviewSearchQuery, { group });
    const pageSize = pageSizeForCategory(deps.app.reviewCategory);
    const pageCount = Math.max(1, Math.ceil(matchingCandidates.length / pageSize));
    deps.app.reviewPage = Math.min(Math.max(0, Number(deps.app.reviewPage) || 0), pageCount - 1);
    const filteredCandidates = matchingCandidates.slice(deps.app.reviewPage * pageSize, (deps.app.reviewPage + 1) * pageSize);
    const draft = reviewDraft(patient, packet.id, index, checklistCandidates);
    const sourceOneLiner = sourceNoteForPacket(patient, packet.id)?.sections?.one_liner?.deidentifiedText || "";
    return {
      patient,
      packet,
      index,
      filteredCandidates,
      checklistCandidates,
      filteredCandidateCount: matchingCandidates.length,
      page: deps.app.reviewPage,
      pageCount,
      draft,
      oneLiner: sourceOneLiner || draft.sections.one_liner.deidentifiedText || ""
    };
  }

  function render() {
    const current = model();
    deps.byId("reviewContent").innerHTML = current.patient
      ? deps.presentation.renderReview({
          patientLabel: current.patient.displayLabel,
          oneLiner: current.oneLiner,
          packets: packets(current.patient),
          selectedPacketId: current.packet.id,
          index: current.index,
          filteredCandidates: current.filteredCandidates,
          checklistCandidates: current.checklistCandidates,
          filteredCandidateCount: current.filteredCandidateCount,
          page: current.page,
          pageCount: current.pageCount,
          query: deps.app.reviewSearchQuery,
          category: deps.app.reviewCategory,
          draft: current.draft,
          helpKey: deps.app.reviewHelpKey,
          guidanceFor: (sectionId) => studentGuidance(current.draft.noteType, sectionId),
          differenceSelectionId: deps.app.reviewDifferenceSelectionId,
          finalNote: renderFinalNote(current.draft),
          patientRequiredMessage: deps.patientRequiredMessage()
        })
      : deps.patientRequiredMessage();
  }

  function open(selectedPacketId = "admission") {
    deps.app.reviewPacketId = selectedPacketId || "admission";
    deps.app.reviewHelpKey = "";
    deps.app.view = "review";
    deps.render();
  }

  function updateInput(target) {
    const current = model();
    if (!current.patient) return false;
    let draft = current.draft;
    if (target.matches("[data-draft-section]")) draft = updateNoteSection(draft, target.dataset.draftSection, target.value);
    else if (target.matches("[data-checklist-finding-text]")) draft = editChecklistFinding(draft, target.dataset.checklistFindingText, target.value);
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
    if (preview) preview.textContent = renderFinalNote(draft) || "Start writing to build the note preview.";
    return true;
  }

  function change(target) {
    const current = model();
    if (!current.patient) return false;
    if (target.id === "reviewPacketSelect") {
      deps.app.reviewPacketId = target.value || "admission";
      deps.app.reviewPage = 0;
      deps.app.reviewHelpKey = "";
      deps.app.reviewDifferenceSelectionId = "";
      deps.render();
      return true;
    }
    if (target.id === "reviewDataCategory") {
      deps.app.reviewCategory = target.value || "all";
      deps.app.reviewPage = 0;
      render();
      return true;
    }
    if (target.matches("[data-objective-selection-id]")) {
      const candidate = current.index.candidates.find((entry) => entry.id === target.dataset.objectiveSelectionId);
      if (!candidate) return true;
      const draft = target.checked
        ? selectObjectiveBlock(current.draft, { selectionId: candidate.id, sourceFingerprint: candidate.fingerprint, generatedText: candidate.insertionText })
        : deselectObjectiveBlock(current.draft, candidate.id);
      setDraft(draft);
      render();
      return true;
    }
    if (target.matches("[data-checklist-finding-selection-id]")) {
      const candidate = current.checklistCandidates.find((entry) => entry.id === target.dataset.checklistFindingSelectionId);
      if (!candidate) return true;
      setDraft(target.checked ? selectChecklistFinding(current.draft, candidate) : deselectChecklistFinding(current.draft, candidate.id));
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
    if (target.id === "checklistFindingSearch") {
      const query = String(target.value || "").trim().toLocaleLowerCase("en-US");
      const cards = [...(deps.byId("reviewContent")?.querySelectorAll("[data-checklist-finding-candidate]") || [])];
      cards.forEach((card) => { card.hidden = Boolean(query) && !String(card.dataset.checklistFindingSearch || "").includes(query); });
      const count = cards.filter((card) => !card.hidden).length;
      const output = deps.byId("reviewContent")?.querySelector("[data-checklist-finding-count]");
      if (output) output.textContent = `${count} matching completed item${count === 1 ? "" : "s"}`;
      return true;
    }
    if (target.id === "reviewDataSearch") {
      deps.app.reviewSearchQuery = target.value;
      deps.app.reviewPage = 0;
      const current = model();
      const group = deps.app.reviewCategory === "all" ? "" : deps.app.reviewCategory;
      const matchingCandidates = filterClinicalReviewCandidates(current.index, deps.app.reviewSearchQuery, { group });
      const pageSize = pageSizeForCategory(deps.app.reviewCategory);
      const pageCount = Math.max(1, Math.ceil(matchingCandidates.length / pageSize));
      const candidates = matchingCandidates.slice(0, pageSize);
      const selectedIds = new Set(current.draft.objective.selectedBlocks.map((block) => block.selectionId));
      const wrapper = deps.byId("reviewContent")?.querySelector(".review-data-list");
      const summary = deps.byId("reviewContent")?.querySelector(".review-filter-summary");
      if (summary) summary.textContent = `${matchingCandidates.length} matching item${matchingCandidates.length === 1 ? "" : "s"}`;
      if (wrapper) {
        const rendered = deps.presentation.renderReview({
          patientLabel: current.patient.displayLabel,
          oneLiner: current.oneLiner,
          packets: packets(current.patient),
          selectedPacketId: current.packet.id,
          index: current.index,
          filteredCandidates: candidates,
          checklistCandidates: current.checklistCandidates,
          filteredCandidateCount: matchingCandidates.length,
          page: 0,
          pageCount,
          query: deps.app.reviewSearchQuery,
          category: deps.app.reviewCategory,
          draft: current.draft,
          helpKey: deps.app.reviewHelpKey,
          guidanceFor: (sectionId) => studentGuidance(current.draft.noteType, sectionId),
          differenceSelectionId: deps.app.reviewDifferenceSelectionId,
          finalNote: renderFinalNote(current.draft),
          patientRequiredMessage: deps.patientRequiredMessage()
        });
        const template = document.createElement("template");
        template.innerHTML = rendered;
        const nextList = template.content.querySelector(".review-data-list");
        const pagination = deps.byId("reviewContent")?.querySelector(".review-pagination-slot");
        const nextPagination = template.content.querySelector(".review-pagination-slot");
        if (pagination && nextPagination) pagination.replaceChildren(...nextPagination.childNodes);
        if (nextList) wrapper.replaceChildren(...nextList.childNodes);
      }
      void selectedIds;
      return true;
    }
    return updateInput(target);
  }

  async function saveDraft() {
    const current = model();
    if (!current.patient) return;
    deps.updateDeidOperation({ active: true, message: "De-identifying and encrypting the note draft…" });
    try {
      await deps.ensureSelectedDeidReady();
      const safeDraft = await deidentifyDraft(current.draft, deps.deidentify, current.packet.date || deps.app.admissionDate);
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({
        ...patient,
        noteDrafts: { ...(patient.noteDrafts || {}), [current.packet.id]: safeDraft }
      }));
      setDraft(safeDraft);
      await deps.persistVault("Note draft de-identified and saved in the encrypted vault.");
      deps.updateDeidOperation({ active: false, message: "Encrypted note draft saved." });
      deps.setStatus("Encrypted note draft saved.");
      deps.render();
    } catch (error) {
      deps.updateDeidOperation({ active: false, message: error instanceof Error ? error.message : "The note draft was not saved." });
      throw error;
    }
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
    if (action === "download-final-note") {
      const label = String(current.patient.displayLabel || "patient-note").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "patient-note";
      deps.downloadText(`${label}-${current.draft.noteType === NOTE_TYPES.H_AND_P ? "hp" : "progress-note"}.txt`, renderFinalNotePlainText(current.draft));
      deps.setStatus("Plain-text note downloaded.");
      return true;
    }
    if (action === "review-data-page") {
      deps.app.reviewPage = Math.min(Math.max(0, current.page + Number(button.dataset.direction || 0)), current.pageCount - 1);
      render();
      return true;
    }
    if (action === "toggle-note-help") {
      deps.app.reviewHelpKey = deps.app.reviewHelpKey === button.dataset.helpKey ? "" : button.dataset.helpKey;
      render();
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
    } else if (action === "remove-checklist-finding") draft = deselectChecklistFinding(draft, button.dataset.selectionId);
    else if (action === "refresh-checklist-finding") draft = refreshChecklistFinding(draft, button.dataset.selectionId);
    else if (action === "keep-checklist-finding") draft = keepChecklistFinding(draft, button.dataset.selectionId);
    else return false;
    setDraft(draft);
    render();
    return true;
  }

  return Object.freeze({ change, click, input, open, render, saveDraft });
}
