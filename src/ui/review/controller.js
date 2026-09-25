import { sortDays } from "../../daily-updates/days.js?v=20260921-medication-card-v4";
import { updateActivePatient } from "../../app/state/vault.js?v=20260921-medication-card-v4";
import { buildClinicalReviewIndex } from "../../review-data/index.js?v=20260924-optional-sections-v1&labs=20260925-trend-specimen-v1";
import { createLabAutocomplete } from "./lab-autocomplete.js?v=20260924-dollar-autocomplete-v1";
import {
  compileSmartExam,
  EXAM_SYSTEMS,
  getExamSystem,
  getExamVar,
  normalizeSmartExam,
} from "../../clinical/exam-templates.js?v=20260925-exam-templates-v1";
import {
  addDifferential,
  addPlanProblem,
  buildChecklistNoteCandidates,
  changeNoteDraftType,
  CLOSING_SECTION_FIELDS,
  createNoteDraft,
  deselectObjectiveBlock,
  deselectObjectiveBlockWithMemory,
  editObjectiveGroup,
  fieldsForNoteType,
  NOTE_TYPES,
  normalizeNoteDraft,
  reconcileObjectiveBlock,
  reconcileChecklistFinding,
  refreshObjectiveGroup,
  removeDifferential,
  removeObjectiveGroupWithMemory,
  removePlanProblem,
  renderFinalNoteHtml,
  renderFinalNotePlainText,
  reorderDifferentials,
  reorderPlanProblems,
  reselectObjectiveBlock,
  selectObjectiveBlock,
  selectChecklistFinding,
  setSectionVisibility,
  studentGuidance,
  updateAssessment,
  updateClosingSection,
  updateDifferential,
  updateSmartExam,
  updateManualObjective,
  updateNoteSection,
  updatePlanProblem
} from "../../note-drafts/index.js?v=20260924-optional-sections-v1";
import { parseClinicalPlanProblems } from "../../patient-context/clinical-plan-parser.js?v=20260925-plan-rows-v1";
import {
  clearLabBaseline,
  setLabBaseline
} from "../../patient-context/lab-baselines.js?v=20260925-lab-baselines-v2";
import {
  apResultToHtml,
  buildApContextText
} from "../../ai/ap-generator.js?v=20260925-ap-generator-v1";
import { generateProblemApWithOpenAi } from "../openai-ap-api.js?v=20260925-ap-generator-v1";
import { createDifferential } from "../../note-drafts/index.js?v=20260924-optional-sections-v1";

function packetKey(value) {
  return String(value || "admission");
}

// U5: a packet counts as populated when it has a primary team note with any
// section text or a saved note draft with content.
function noteDraftHasContent(draft) {
  if (!draft) return false;
  const text = (value) => {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") return String(value.deidentifiedText || "").trim();
    return "";
  };
  if (Object.values(draft.sections || {}).some((section) => text(section))) return true;
  if (text(draft.assessment)) return true;
  if ((draft.problems || []).some((problem) => text(problem.problem))) return true;
  return (draft.objective?.selectedBlocks || []).length > 0;
}

function packetHasData(patient, packetId) {
  const source = sourceNoteForPacket(patient, packetId);
  if (source && Object.values(source.sections || {}).some((section) => sourceSectionText(section).trim())) return true;
  return noteDraftHasContent(patient?.noteDrafts?.[packetKey(packetId)]);
}

// U5: when entering review without an explicit packet choice, prefer the
// latest populated packet over an empty Admission H&P. An explicitly
// requested packet that has data is always kept.
// Exported for targeted testing; pure derivation, no DOM or vault access.
export function resolveDefaultPacket(patient, requestedId) {
  if (packetHasData(patient, requestedId)) return requestedId;
  const populated = packetsForPatient(patient).filter((entry) => packetHasData(patient, entry.id)).at(-1);
  return populated?.id || requestedId;
}

export function packetsForPatient(patient) {
  return [
    { id: "admission", label: "Admission H&P", date: "" },
    ...sortDays(patient?.days || []).map((day, index) => ({ id: day.id, label: `${day.label || `Hospital day ${index + 1}`} · Progress note`, date: day.date }))
  ];
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

// Saved note sections cross a state boundary: a fresh parse stores plain
// strings, while the vault stores { deidentifiedText } objects. Read the text
// without falling through to the raw object — an empty-but-present object is
// truthy, and String(object) renders "[object Object]", which would seed the
// draft (or the plan parser) with literal garbage text.
function sourceSectionText(section) {
  if (typeof section === "string") return section;
  if (section && typeof section === "object") return String(section.deidentifiedText ?? "");
  return "";
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

  const rawPlan = sourceSectionText(source?.sections?.plan);
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

  // Seed the draft assessment from the source note's own assessment section
  // (including text split out of a combined "Assessment and Plan" heading),
  // but never overwrite the student's own writing.
  const sourceAssessment = sourceSectionText(source?.sections?.assessment);
  if (String(sourceAssessment).trim() && !String(draft.assessment?.deidentifiedText || "").trim()) {
    draft = updateAssessment(draft, String(sourceAssessment).trim());
  }

  return draft;
}

export function createReviewController(deps) {
  // Which lab row currently has its baseline editor open. Local UI state:
  // the saved baselines themselves live on the patient record in the vault.
  let baselineEditorId = "";
  // Per-problem AI Assessment & Plan generation state. Local UI state only:
  // which problem is awaiting generation, and the pending de-identification
  // confirmation ({ problemId, problemName, contextText }) shown in the modal.
  // Nothing here is persisted; generated content lands in the draft on success.
  let generatingApProblemId = "";
  let apConfirmState = null;
  // Which lab families / flagged sections are collapsed on the data sheet.
  // Local UI state only; it survives re-renders and the search-only DOM patch.
  const collapsedFamilies = new Set();

  // Whether the Clinical Data panel is collapsed (user can focus on the note).
  // Local UI state only; survives re-renders.
  let clinicalDataCollapsed = false;

  // Which Objective editor groups are collapsed (vitals, lab families, etc.).
  // Local UI state only; survives re-renders.
  const collapsedObjectiveGroups = new Set();

  // Which draft-note sections are collapsed (One-Liner, HPI, Physical Exam,
  // Objective, Assessment, Plan, closing sections, Medications). Local UI
  // state only; survives re-renders.
  const collapsedDraftSections = new Set();

  // Smart-exam UI state. Transient only (not persisted): which inline
  // variable's dropdown is open. The selections themselves live on
  // draft.smartExam and are saved.
  const smartExamUi = { openVar: null }; // "systemId:varId" of the open inline dropdown
  // Which exam-finding systems are expanded. Native <details> open state is
  // lost on re-render (innerHTML replacement), so track it here and render
  // the `open` attribute from this set.

  // Latest clinical review index, cached for the `$` lab autocomplete.
  // Rebuilt on every model() call; the autocomplete reads from here.
  let latestIndex = null;

  // Smart `$` autocomplete for pulling labs/vitals into the draft note.
  // Attaches via event delegation so it survives full re-renders.
  const labAutocomplete = createLabAutocomplete({
    getCandidates: () => {
      if (!latestIndex) return [];
      // Labs and vitals are the most useful for inline insertion.
      return [...(latestIndex.labs || []), ...(latestIndex.vitals || [])];
    }
  });

  // Only the 5 core vitals are auto-selected: BP, SpO2, HR, RR, Temp.
  // Medications are also auto-added. Labs and other vitals (weight, MAP, etc.)
  // are never auto-added — the student selects them explicitly.
  // Deselections survive re-renders via objective.deselectedIds.
  const CORE_VITAL_NAMES = new Set([
    "blood pressure", "bp",
    "spo2", "oxygen saturation", "o2 sat",
    "heart rate", "hr", "pulse",
    "respiratory rate", "rr", "respirations",
    "temperature", "temp"
  ]);
  const isCoreVital = (candidate) => {
    if (candidate?.noteGroupKey !== "vitals") return false;
    const name = String(candidate?.name || "").toLowerCase().trim();
    // Match against core vital names (handles "Blood Pressure (cuff)", "Pulse", etc.)
    for (const core of CORE_VITAL_NAMES) {
      if (name === core || name.startsWith(core + " ") || name.startsWith(core + "(")) return true;
    }
    return false;
  };
  const isDefaultOn = (candidate) =>
    isCoreVital(candidate) || candidate?.noteGroupKey === "medications" ||
    candidate?.pendingLab === true ||
    (candidate?.kind === "diagnostic_result" && candidate?.needsFreeText === true);

  function selectionInputFor(candidate) {
    return {
      selectionId: candidate.id,
      sourceFingerprint: candidate.fingerprint,
      generatedText: candidate.insertionText,
      kind: candidate.kind,
      noteGroupKey: candidate.noteGroupKey,
      noteGroupLabel: candidate.noteGroupLabel,
      noteLabel: candidate.noteLabel,
      noteDetail: candidate.noteDetail,
      noteRange: candidate.noteRange,
      noteMean: candidate.noteMean,
      needsFreeText: candidate.needsFreeText === true
    };
  }

  function packets(patient) {
    return packetsForPatient(patient);
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
      const rawPlan = sourceSectionText(source?.sections?.plan);
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
      if (candidate) draft = reconcileObjectiveBlock(draft, selectionInputFor(candidate));
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
    // Auto-include every vital and medication candidate the student has not
    // explicitly unchecked. Explicit deselections survive re-renders, packet
    // switches, and saved-draft reloads through objective.deselectedIds.
    // A temperature whose source never stated a unit is never auto-included:
    // the student must confirm °F/°C on the review sheet first.
    const deselectedIds = new Set((draft.objective?.deselectedIds || []).map(String));
    const alreadySelected = new Set(draft.objective.selectedBlocks.map((block) => block.selectionId));
    for (const candidate of candidates.values()) {
      if (!isDefaultOn(candidate)) continue;
      if (candidate.unitUnmarked) continue;
      if (deselectedIds.has(String(candidate.id)) || alreadySelected.has(candidate.id)) continue;
      draft = selectObjectiveBlock(draft, selectionInputFor(candidate));
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
    // Explicit student confirmations for unmarked temperature units live on
    // the patient record and resolve the ambiguity at the review boundary.
    const index = buildClinicalReviewIndex(patient, { temperatureUnits: patient?.temperatureUnits });
    latestIndex = index;
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
      baselineEditorId,
      collapsedFamilies,
      clinicalDataCollapsed,
      collapsedObjectiveGroups,
      collapsedDraftSections,
      smartExamUi: { openVar: smartExamUi.openVar },
      patientRequiredMessage: deps.patientRequiredMessage(),
      generatingApProblemId,
      apConfirm: apConfirmState
    };
  }

  // Preserve scroll position across re-renders: selecting a vital or toggling
  // a candidate must not yank the user back to the top of the page.
  // `.view` owns route scrolling in this app (window.scrollY stays zero), and
  // replacing innerHTML briefly empties the scrollable area, which clamps the
  // view's scrollTop to zero — so capture the real scroll owner, not window.
  // Guard for non-browser environments (tests).
  function withPreservedViewScroll(container, update) {
    const canPreserve = typeof window !== "undefined" && typeof document !== "undefined";
    if (!canPreserve) { update(); return; }
    // Snapshot scroll positions by SELECTOR, not element reference: update()
    // does container.innerHTML = ..., which destroys all inner elements.
    // Holding old element references would restore to disconnected nodes.
    const snapshot = [];
    const seen = new Set();
    const selectorFor = (el) => {
      if (el === document.scrollingElement || el === document.documentElement) return ":root-scroller";
      if (el.id) return "#" + el.id;
      // Use class-based selector; prefer the most specific stable class
      const cls = (el.className?.baseVal ?? el.className ?? "").toString().trim().split(/\s+/).filter(Boolean);
      if (cls.length) return el.tagName.toLowerCase() + "." + cls.slice(0, 3).join(".");
      return null;
    };
    const consider = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      let overflowY = "";
      try { overflowY = window.getComputedStyle(el).overflowY; } catch { return; }
      const isDocScroller = el === document.scrollingElement || el === document.documentElement;
      const isScrollable = /(auto|scroll|overlay)/.test(overflowY) || isDocScroller;
      if (isScrollable && el.scrollHeight > el.clientHeight + 1) {
        const sel = selectorFor(el);
        if (sel) snapshot.push({ sel, top: el.scrollTop, left: el.scrollLeft });
      }
    };
    // Ancestors of the container (including container itself).
    for (let current = container; current; current = current.parentElement) consider(current);
    // Document scroller (covers the narrow-viewport case).
    consider(document.scrollingElement);
    consider(document.documentElement);
    // Scrollable descendants within the container subtree — catches nested
    // scrollers like the clinical-data list.
    if (container?.querySelectorAll) {
      for (const el of container.querySelectorAll("*")) consider(el);
    }
    // Blur the focused control before replacing DOM: when a checkbox is
    // removed mid-focus the browser can reset scroll as focus falls back.
    const active = document.activeElement;
    if (active && active !== document.body && container?.contains(active)) {
      try { active.blur(); } catch { /* ignore */ }
    }
    update();
    const restore = () => {
      for (const { sel, top, left } of snapshot) {
        try {
          let target = null;
          if (sel === ":root-scroller") {
            target = document.scrollingElement || document.documentElement;
          } else if (sel.startsWith("#")) {
            target = document.getElementById(sel.slice(1));
          } else {
            target = document.querySelector(sel);
          }
          if (!target) continue;
          if (target.scrollHeight > target.clientHeight) target.scrollTop = top;
          if (target.scrollWidth > target.clientWidth) target.scrollLeft = left;
        } catch { /* ignore */ }
      }
    };
    restore();
    // Layout can settle after paint; restore on the next frame and again
    // after a tick to beat late browser scroll adjustments.
    window.requestAnimationFrame(restore);
    setTimeout(restore, 0);
    setTimeout(restore, 60);
  }
  // Patch only the clinical-data sheet (list + match summary) so typing in
  // the search field or toggling a lab-family collapse does not lose focus.
  function patchDataList() {
    const current = model();
    if (!current.patient) return;
    const rendered = deps.presentation.renderReview(reviewViewModel(current));
    const template = document.createElement("template");
    template.innerHTML = rendered;
    const nextList = template.content.querySelector(".review-data-list");
    const nextSummary = template.content.querySelector(".review-filter-summary");
    const wrapper = deps.byId("reviewContent")?.querySelector(".review-data-list");
    const summary = deps.byId("reviewContent")?.querySelector(".review-filter-summary");
    if (summary && nextSummary) summary.textContent = nextSummary.textContent;
    if (wrapper && nextList) withPreservedViewScroll(wrapper, () => wrapper.replaceChildren(...nextList.childNodes));
  }

  function render() {
    const current = model();
    const container = deps.byId("reviewContent");
    const canPreserveScroll = typeof window !== "undefined" && typeof document !== "undefined";
    const activeId = canPreserveScroll ? (document.activeElement?.id || null) : null;
    withPreservedViewScroll(container, () => {
      container.innerHTML = current.patient
        ? deps.presentation.renderReview(reviewViewModel(current))
        : deps.patientRequiredMessage();
    });
    if (canPreserveScroll && activeId) {
      const restored = document.getElementById(activeId);
      if (restored) restored.focus({ preventScroll: true });
    }
    // Attach the `$` lab autocomplete via event delegation. Safe to call on
    // every render; it no-ops if already attached to this container.
    if (container) labAutocomplete.attach(container);
  }

  function prepare(selectedPacketId = "admission", { preferPopulated = true } = {}) {
    const requested = selectedPacketId || "admission";
    // U5: default navigation prefers the latest populated packet over an
    // empty Admission H&P; explicit opens (open-progress-note,
    // open-admission-note) keep the requested packet untouched.
    deps.app.reviewPacketId = preferPopulated ? resolveDefaultPacket(deps.active(), requested) : requested;
    deps.app.reviewSearchQuery = "";
    deps.app.reviewCategory = "all";
  }

  function open(selectedPacketId = "admission") {
    prepare(selectedPacketId, { preferPopulated: false });
    deps.app.view = "review";
    deps.render();
  }

  // The note editor's editable regions are contenteditable elements, not
  // form fields: read their text via innerText (trailing whitespace trimmed
  // so <br>-rendered newlines round-trip cleanly). Plain inputs/textareas
  // and non-DOM test fakes keep using .value.
  function editableText(target) {
    if (target.isContentEditable) return String(target.innerText || "").replace(/[\s\uFEFF]+$/, "");
    return target.value;
  }

  function updateInput(target) {
    const current = model();
    if (!current.patient) return false;
    let draft = current.draft;
    if (target.matches("[data-draft-section]")) draft = updateNoteSection(draft, target.dataset.draftSection, editableText(target));
    else if (target.matches("[data-draft-objective-manual]")) draft = updateManualObjective(draft, editableText(target));
    else if (target.matches("[data-objective-group-text]")) draft = editObjectiveGroup(draft, target.dataset.objectiveGroupText, editableText(target));
    else if (target.matches("[data-draft-assessment]")) draft = updateAssessment(draft, editableText(target));
    else if (target.matches("[data-draft-closing]")) draft = updateClosingSection(draft, target.dataset.draftClosing, editableText(target));
    else {
      const problemCard = target.closest("[data-problem-id]");
      const differentialCard = target.closest("[data-differential-id]");
      if (target.matches("[data-differential-field]") && problemCard && differentialCard) {
        draft = updateDifferential(draft, problemCard.dataset.problemId, differentialCard.dataset.differentialId, { [target.dataset.differentialField]: editableText(target) });
      } else if (target.matches("[data-problem-field]") && problemCard) {
        draft = updatePlanProblem(draft, problemCard.dataset.problemId, { [target.dataset.problemField]: editableText(target) });
      } else return false;
    }
    setDraft(draft);
    return true;
  }

  function change(target) {
    const current = model();
    if (!current.patient) return false;
    if (target.matches("[data-smart-var-option]")) {
      toggleSmartVarOption(target.dataset.system, target.dataset.var, target.dataset.option, target.checked);
      return true;
    }
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
    if (target.matches("[data-section-visibility]")) {
      setDraft(setSectionVisibility(current.draft, target.dataset.sectionVisibility, target.checked));
      render();
      return true;
    }
    if (target.matches("[data-objective-selection-id]")) {
      const candidate = (current.index.objectiveCandidates || current.index.candidates).find((entry) => entry.id === target.dataset.objectiveSelectionId);
      if (!candidate) return true;
      // An unmarked temperature can only enter the note through explicit
      // °F/°C confirmation — never through the checkbox alone.
      if (candidate.unitUnmarked && target.checked) {
        deps.setStatus("Confirm °F or °C for this temperature before adding it to the note.");
        render();
        return true;
      }
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
        draft = reselectObjectiveBlock(draft, selectionInputFor(candidate));
      } else {
        // Unchecking a default-on vital or medication remembers the choice so
        // the auto-include pass does not silently re-add it.
        draft = isDefaultOn(candidate)
          ? deselectObjectiveBlockWithMemory(draft, candidate.id)
          : deselectObjectiveBlock(draft, candidate.id);
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
    if (target.matches?.("[data-smart-exam-notes]")) {
      setSmartExamNotes(target.value);
      return true;
    }
    if (target.id === "reviewDataSearch") {
      deps.app.reviewSearchQuery = target.value;
      patchDataList();
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

  async function confirmTemperatureUnit(candidateId, unit) {
    try {
      const current = model();
      if (!current.patient) return;
      if ((unit !== "°F" && unit !== "°C") || !candidateId) return;
      deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({
        ...patient,
        temperatureUnits: { ...(patient.temperatureUnits || {}), [String(candidateId)]: unit }
      }));
      // Confirming resolves the ambiguity, so the default-on pass picks the
      // temperature up on the next render with the confirmed unit attached.
      // Update the UI first so the user gets immediate feedback even if the
      // vault write fails; persist in the background with error reporting.
      const ephemeralDemo = deps.isEphemeralDemo?.();
      deps.setStatus(ephemeralDemo
        ? "Temperature unit confirmed for this temporary walkthrough."
        : `Temperature unit confirmed as ${unit} — saved to the encrypted vault.`);
      render();
      if (!ephemeralDemo) {
        try {
          await deps.persistVault("Temperature unit confirmed.");
        } catch (error) {
          deps.showToast?.("Unit confirmed on screen, but the vault save failed — your change may not persist after reload.", { type: "error" });
          deps.setStatus("Temperature unit confirmed on screen; vault save failed.");
        }
      }
    } catch (error) {
      deps.showToast?.("Could not confirm the temperature unit. Please try again.", { type: "error" });
      deps.setStatus("Temperature unit confirmation failed.");
    }
  }

  // --- Per-problem AI Assessment & Plan generation ---
  // Extract plain text from a draft field (string or { deidentifiedText }).
  function apDraftText(value) {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") return String(value.deidentifiedText ?? "");
    return "";
  }

  // Assemble the de-identified context for one problem. Only draft text is
  // used — the draft is built from de-identified sources by construction.
  // The student confirms the exact text in the modal before anything is sent.
  function buildApContextForProblem(draft, problem) {
    const sections = draft.sections || {};
    const differentials = (problem.differentials || []).map((d) => apDraftText(d.diagnosis)).filter(Boolean);
    return {
      problem: apDraftText(problem.problem),
      keyContext: apDraftText(problem.keyContext),
      existingDifferentials: differentials,
      contextText: buildApContextText({
        oneLiner: apDraftText(draft.oneLiner) || apDraftText(sections.one_liner),
        hpi: apDraftText(sections.history_of_present_illness),
        pastMedicalHistory: apDraftText(sections.past_medical_history),
        medications: apDraftText(sections.medications),
        allergies: apDraftText(sections.allergies),
        vitals: apDraftText(draft.vitalsSummary),
        keyLabs: apDraftText(draft.keyLabsSummary),
        assessment: apDraftText(draft.assessment)
      })
    };
  }

  function openApConfirm(problemId) {
    const current = model();
    const draft = current.draft;
    const problem = (draft.problems || []).find((p) => p.id === problemId);
    if (!problem) return;
    const built = buildApContextForProblem(draft, problem);
    if (!built.problem && !built.keyContext) {
      deps.setStatus("Name the clinical problem (or add key context) before generating a plan.");
      return;
    }
    const preferences = deps.currentPreferences ? deps.currentPreferences() : {};
    if (!preferences.openAiApiKey) {
      deps.setStatus("Save an OpenAI API key in Settings before generating a plan.");
      return;
    }
    apConfirmState = {
      problemId,
      problemName: built.problem || "(unnamed problem)",
      contextText: [
        `Problem: ${built.problem || "(not named)"}`,
        built.keyContext ? `Key context: ${built.keyContext}` : null,
        built.existingDifferentials.length ? `Existing differential: ${built.existingDifferentials.join("; ")}` : null,
        "",
        "--- De-identified patient context ---",
        built.contextText || "(no additional context in the draft)"
      ].filter((line) => line !== null).join("\n"),
      payload: built
    };
    render();
  }

  async function runApGeneration(problemId) {
    const pending = apConfirmState;
    if (!pending || pending.problemId !== problemId) return;
    apConfirmState = null;
    generatingApProblemId = problemId;
    render();
    deps.setStatus(`Generating assessment and plan for "${pending.problemName}"…`);
    try {
      const preferences = deps.currentPreferences ? deps.currentPreferences() : {};
      const result = await generateProblemApWithOpenAi({
        apiKey: preferences.openAiApiKey,
        model: preferences.openAiModel,
        problem: pending.payload.problem,
        keyContext: pending.payload.keyContext,
        existingDifferentials: pending.payload.existingDifferentials,
        contextText: pending.payload.contextText
      });
      const html = apResultToHtml(result);
      const current = model();
      let draft = current.draft;
      const problems = (draft.problems || []).map((p) => {
        if (p.id !== problemId) return p;
        return {
          ...p,
          differentials: result.differentials.map((d) => createDifferential({
            diagnosis: d.diagnosis,
            cluesFor: `${d.likelihood}${d.reasoning ? ` — ${d.reasoning}` : ""}`,
            cluesAgainst: ""
          })),
          diagnosticPlan: html.diagnosticPlanHtml || p.diagnosticPlan,
          therapeuticPlan: html.therapeuticPlanHtml || p.therapeuticPlan
        };
      });
      draft = { ...draft, problems };
      setDraft(draft);
      generatingApProblemId = "";
      render();
      deps.setStatus(`Plan generated for "${pending.problemName}" — review and edit before using. Verify every citation.`);
    } catch (error) {
      generatingApProblemId = "";
      render();
      const message = error instanceof Error ? error.message : "Plan generation failed.";
      deps.setStatus(message);
    }
  }

  async function saveLabBaseline(analyte, fields, { clear = false } = {}) {    const current = model();
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

  // Pull the corresponding section text from the primary team note (for the
  // current hospital day) into the draft as a starting point. This lets the
  // student start from yesterday's primary note text when writing their own.
  function pullFromPrimaryNote(fieldId) {
    const current = model();
    if (!current.patient) return;
    const source = sourceNoteForPacket(current.patient, current.packet.id);
    const fieldLabel = fieldId.replace(/_/g, " ");
    if (!source) {
      const message = "No primary team note for this day — paste one under Hospital Stay first, then pull.";
      deps.setStatus(message);
      deps.showToast?.(message, { type: "warning" });
      return;
    }
    let text = sourceSectionText(source?.sections?.[fieldId]).trim();
    if (!text && fieldId === "plan") {
      // Bare-"Assessment:" notes keep numbered problems in the assessment
      // section with no separate Plan — pull from there instead.
      text = sourceSectionText(source?.sections?.assessment).trim();
    }
    if (!text) {
      const message = `The primary note has no "${fieldLabel}" text to pull.`;
      deps.setStatus(message);
      deps.showToast?.(message, { type: "warning" });
      return;
    }
    let draft = current.draft;
    try {
      // Route to the correct update function based on field type.
      // Standard sections use updateNoteSection; special sections have
      // their own update functions; closing sections use updateClosingSection.
      if (fieldId === "objective") {
        draft = updateManualObjective(draft, text);
      } else if (fieldId === "assessment") {
        draft = updateAssessment(draft, text);
      } else if (fieldId === "physical_exam") {
        // The smart exam editor owns the physical_exam section text: pulled
        // text lands in its free-text notes so the next recompile keeps it.
        const state = getSmartExam(draft);
        const existing = state.freeText.trim();
        state.freeText = existing ? `${existing}\n\n${text}` : text;
        draft = withSmartExam(draft, state);
      } else if (CLOSING_SECTION_FIELDS.some((field) => field.id === fieldId)) {
        draft = updateClosingSection(draft, fieldId, text);
      } else if (fieldId === "plan") {
        // Plan is structured (draft.problems), not free text. Parse the
        // primary note's plan text into problems. Many Epic notes put numbered
        // problems under a bare "Assessment:" heading with no separate Plan
        // section — fall back to the assessment text when the plan yields
        // nothing.
        let problems = parseClinicalPlanProblems(text);
        if (problems.length === 0) {
          const assessmentText = sourceSectionText(source?.sections?.assessment).trim();
          if (assessmentText) problems = parseClinicalPlanProblems(assessmentText);
        }
        if (problems.length > 0) {
          // B1 fix: skip problems that already exist (normalized text match)
          // so pulling twice doesn't create duplicates. Draft problems store
          // the title as a { deidentifiedText } object (or a plain string for
          // fresh parses) — read the text, never String(object).
          const titleText = (value) => {
            if (typeof value === "string") return value;
            if (value && typeof value === "object") return String(value.deidentifiedText ?? "");
            return "";
          };
          const existingTitles = new Set(
            (draft.problems || []).map((p) => titleText(p.problem).trim().toLowerCase())
          );
          let added = 0;
          for (const p of problems) {
            const title = String(p.problem || p.title || "").trim();
            if (!title || existingTitles.has(title.toLowerCase())) continue;
            existingTitles.add(title.toLowerCase());
            draft = addPlanProblem(draft, {
              problem: p.problem || p.title || "",
              keyContext: p.keyContext || "",
              knownEtiology: p.knownEtiology || "",
              differentials: p.differentials || [],
              diagnosticPlan: p.diagnosticPlan || "",
              therapeuticPlan: p.therapeuticPlan || ""
            });
            added++;
          }
          if (added === 0) {
            const message = "Plan already pulled — no new problems to add.";
            deps.setStatus(message);
            deps.showToast?.(message, { type: "warning" });
            return;
          }
        } else {
          const message = "Could not parse plan from primary note.";
          deps.setStatus(message);
          deps.showToast?.(message, { type: "warning" });
          return;
        }
      } else {
        draft = updateNoteSection(draft, fieldId, text);
      }
    } catch (error) {
      const message = `Cannot pull ${fieldLabel}: ${error.message}`;
      deps.setStatus(message);
      deps.showToast?.(message, { type: "error" });
      return;
    }
    deps.app.noteDraftSessions.set(packetKey(current.packet.id), draft);
    // B2 fix: pulling writes through to the persisted vault (not just the
    // in-memory session) so the pulled content survives a page reload.
    // Normalize first so the saved shape matches saveDraft().
    const normalizedPull = normalizeNoteDraft(draft);
    deps.app.vault = updateActivePatient(deps.app.vault, (patient) => ({
      ...patient,
      noteDrafts: { ...(patient.noteDrafts || {}), [current.packet.id]: normalizedPull }
    }));
    setDraft(normalizedPull);
    if (!deps.isEphemeralDemo?.()) {
      void deps.persistVault("Pulled section saved.").catch(() => {
        deps.showToast?.("Pulled content is shown, but the vault save failed — click Save draft to be safe.", { type: "error" });
      });
    }
    const successMessage = `Pulled ${fieldLabel} from primary note.`;
    deps.setStatus(successMessage);
    deps.showToast?.(successMessage, { type: "success", durationMs: 2500 });
    deps.render();
  }

  // Insert the selected exam system into the smart physical-exam editor.
  // The system renders inline in the note area as prose with smart-variable
  // pills — no separate picker section.
  function insertSmartExamSystem() {
    const select = document.querySelector("[data-smart-exam-select]");
    const system = getExamSystem(select?.value);
    if (!system) {
      deps.setStatus("Select an exam system first.");
      return;
    }
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    if (!state.systems.includes(system.id)) state.systems.push(system.id);
    setSmartExam(current.draft, state);
    deps.render();
    deps.setStatus(`Inserted ${system.name} exam — click any pill to document findings.`);
  }

  // ─── Smart physical-exam editor ────────────────────────────────
  // Inline smart variables: each exam system is prose with pill buttons.
  // Clicking a pill opens an inline multi-select dropdown; selections
  // compile straight into the Physical Exam note text — no separate
  // picker section, no manual copy step.

  // Smart-exam state, migrated lazily: legacy free text already saved in
  // the physical_exam section becomes freeText notes so nothing is lost.
  function getSmartExam(draft) {
    const state = normalizeSmartExam(draft?.smartExam);
    if (!draft?.smartExam && !state.freeText) {
      const legacy = sourceSectionText(draft?.sections?.physical_exam).trim();
      if (legacy) state.freeText = legacy;
    }
    return state;
  }

  // Pure: apply smart-exam state to a draft and recompile the Physical
  // Exam note text, so copy/download/final-note always see the current
  // selections.
  function withSmartExam(draft, smartExam) {
    const state = normalizeSmartExam(smartExam);
    const compiled = compileSmartExam(state);
    const timestamp = new Date().toISOString();
    const prev = draft?.sections?.physical_exam || {};
    const next = updateSmartExam(draft, state);
    next.sections = {
      ...next.sections,
      physical_exam: {
        deidentifiedText: compiled,
        createdAt: prev.createdAt || timestamp,
        updatedAt: timestamp,
      },
    };
    return next;
  }

  // Write smart-exam state to the session and recompile the note text.
  function setSmartExam(draft, smartExam) {
    setDraft(withSmartExam(draft, smartExam));
  }

  function removeSmartExamSystem(systemId) {
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    state.systems = state.systems.filter((id) => id !== systemId);
    delete state.selections[systemId];
    smartExamUi.openVar = null;
    setSmartExam(current.draft, state);
    deps.render();
  }

  function markSmartExamNormal(systemIds) {
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    const names = [];
    for (const sysId of systemIds) {
      const system = getExamSystem(sysId);
      if (!system) continue;
      if (!state.systems.includes(sysId)) state.systems.push(sysId);
      const vars = {};
      for (const seg of system.template) {
        if (seg && typeof seg === "object" && seg.normal.length) vars[seg.var] = [...seg.normal];
      }
      state.selections[sysId] = vars;
      names.push(system.name);
    }
    smartExamUi.openVar = null;
    setSmartExam(current.draft, state);
    deps.render();
    deps.setStatus(names.length
      ? `Marked ${names.join(", ")} normal — change any abnormal findings.`
      : "Insert an exam system first.");
  }

  function clearSmartExam() {
    const current = model();
    if (!current.patient) return;
    smartExamUi.openVar = null;
    setSmartExam(current.draft, { systems: [], selections: {}, freeText: "" });
    deps.render();
    deps.setStatus("Cleared the smart exam.");
  }

  function toggleSmartVarDropdown(systemId, varId) {
    if (!getExamVar(systemId, varId)) return;
    const key = `${systemId}:${varId}`;
    smartExamUi.openVar = smartExamUi.openVar === key ? null : key;
    deps.render();
  }

  function setSmartVarSelections(systemId, varId, values) {
    if (!getExamVar(systemId, varId)) return;
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    const clean = [...new Set(values.map((x) => String(x ?? "").trim()).filter(Boolean))];
    if (!state.selections[systemId]) state.selections[systemId] = {};
    if (clean.length) state.selections[systemId][varId] = clean;
    else delete state.selections[systemId][varId];
    setSmartExam(current.draft, state);
    deps.render();
  }

  function toggleSmartVarOption(systemId, varId, option, checked) {
    const variable = getExamVar(systemId, varId);
    if (!variable) return;
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    const currentVals = new Set(state.selections?.[systemId]?.[varId] || []);
    const isNormal = variable.normal.includes(option);
    if (checked) {
      if (!variable.multi) {
        // Single-select (e.g. GCS components): the new choice replaces all.
        currentVals.clear();
        currentVals.add(option);
      } else {
        // Normal options are mutually exclusive with everything else, so
        // the compiled sentence can never read "non-tender, tender".
        for (const val of [...currentVals]) {
          const valIsNormal = variable.normal.includes(val);
          if (isNormal ? !valIsNormal : valIsNormal) currentVals.delete(val);
        }
        currentVals.add(option);
      }
    } else {
      currentVals.delete(option);
    }
    setSmartVarSelections(systemId, varId, [...currentVals]);
  }

  function addSmartVarCustom(systemId, varId, text) {
    const value = String(text || "").trim();
    if (!value) return;
    const variable = getExamVar(systemId, varId);
    if (!variable) return;
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    const vals = new Set(state.selections?.[systemId]?.[varId] || []);
    // Custom entries count as non-normal: they clear normal options.
    if (variable.multi) {
      for (const val of [...vals]) {
        if (variable.normal.includes(val)) vals.delete(val);
      }
    } else {
      vals.clear();
    }
    vals.add(value);
    setSmartVarSelections(systemId, varId, [...vals]);
    deps.setStatus(`${variable.label}: ${value}`);
  }

  function removeSmartVarCustom(systemId, varId, text) {
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    const vals = new Set(state.selections?.[systemId]?.[varId] || []);
    vals.delete(String(text || ""));
    setSmartVarSelections(systemId, varId, [...vals]);
  }

  function setSmartExamNotes(text) {
    const current = model();
    if (!current.patient) return;
    const state = getSmartExam(current.draft);
    state.freeText = String(text ?? "");
    // Recompile without re-rendering: the textarea owns its own value and
    // a re-render would drop the caret mid-typing.
    setDraft(withSmartExam(current.draft, state));
  }

  // Keyboard: Enter commits a smart-variable custom entry; Escape closes
  // the open inline dropdown.
  function keydown(event) {
    const customInput = event.target?.closest?.("[data-smart-var-custom]");
    if (customInput) {
      if (event.key === "Enter") {
        event.preventDefault();
        addSmartVarCustom(customInput.dataset.system, customInput.dataset.var, customInput.value);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        smartExamUi.openVar = null;
        deps.render();
        return true;
      }
      return false;
    }
    if (event.key === "Escape" && smartExamUi.openVar) {
      event.preventDefault();
      smartExamUi.openVar = null;
      deps.render();
      return true;
    }
    return false;
  }

  function toggle(event) {
    // Draft-note section collapse: track by section id so re-renders keep
    // the student's open/closed choices.
    const sectionDetails = event.target?.closest?.("details.ed-section");
    if (sectionDetails) {
      const id = sectionDetails.dataset.draftSectionId;
      if (!id) return false;
      if (sectionDetails.open) collapsedDraftSections.delete(id);
      else collapsedDraftSections.add(id);
      return true;
    }
    return false;
  }

  function click(target) {
    // Clicking outside the smart-exam editor closes an open inline dropdown.
    if (smartExamUi.openVar && !target.closest?.("[data-smart-exam]")) {
      smartExamUi.openVar = null;
      deps.render();
      return true;
    }
    // Pull-from-primary-note button (not a data-action; handled separately).
    const pullButton = target.closest("[data-pull-section]");
    if (pullButton) {
      const fieldId = pullButton.dataset.pullSection;
      if (fieldId) {
        pullFromPrimaryNote(fieldId);
        return true;
      }
    }

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
    if (action === "smart-exam-insert") {
      insertSmartExamSystem();
      return true;
    }
    if (action === "smart-exam-all-normal") {
      const current2 = model();
      if (current2.patient) markSmartExamNormal(getSmartExam(current2.draft).systems);
      return true;
    }
    if (action === "smart-exam-clear") {
      clearSmartExam();
      return true;
    }
    if (action === "smart-exam-system-normal") {
      markSmartExamNormal([button.dataset.system]);
      return true;
    }
    if (action === "smart-exam-system-remove") {
      removeSmartExamSystem(button.dataset.system);
      return true;
    }
    if (action === "smart-var-open") {
      toggleSmartVarDropdown(button.dataset.system, button.dataset.var);
      return true;
    }
    if (action === "smart-var-add-custom") {
      const wrap = button.closest("[data-smart-var-wrap]");
      const input = wrap?.querySelector("[data-smart-var-custom]");
      addSmartVarCustom(button.dataset.system, button.dataset.var, input?.value);
      return true;
    }
    if (action === "smart-var-remove-custom") {
      removeSmartVarCustom(button.dataset.system, button.dataset.var, button.dataset.option);
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
            deps.setStatus("Copy failed. Use Download .txt instead.");
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
    if (action === "confirm-temperature-unit") {
      void confirmTemperatureUnit(button.dataset.candidateId, button.dataset.unit);
      return true;
    }
    if (action === "toggle-lab-family") {
      const family = button.dataset.family || "";
      if (family) {
        if (collapsedFamilies.has(family)) collapsedFamilies.delete(family);
        else collapsedFamilies.add(family);
      }
      patchDataList();
      return true;
    }
    if (action === "toggle-clinical-data") {
      clinicalDataCollapsed = !clinicalDataCollapsed;
      render();
      return true;
    }
    if (action === "toggle-objective-group") {
      const group = button.dataset.group || "";
      if (group) {
        if (collapsedObjectiveGroups.has(group)) collapsedObjectiveGroups.delete(group);
        else collapsedObjectiveGroups.add(group);
      }
      render();
      return true;
    }
    if (action === "baseline-cancel") {
      baselineEditorId = "";
      render();
      return true;
    }
    if (action === "baseline-save" || action === "baseline-clear") {
      const editor = button.closest(".lab-row")?.querySelector("[data-baseline-editor]");
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
    else if (action === "generate-ap") {
      openApConfirm(button.dataset.problemId);
      return true;
    } else if (action === "ap-confirm-cancel") {
      apConfirmState = null;
      render();
      return true;
    } else if (action === "ap-confirm-generate") {
      void runApGeneration(button.dataset.problemId);
      return true;
    }
    else if (action === "remove-plan-problem") draft = removePlanProblem(draft, button.dataset.problemId);
    else if (action === "move-plan-problem") draft = reorderPlanProblems(draft, moveId(draft.problems.map((entry) => entry.id), button.dataset.problemId, button.dataset.direction));
    else if (action === "add-differential") draft = addDifferential(draft, button.dataset.problemId);
    else if (action === "remove-differential") draft = removeDifferential(draft, button.dataset.problemId, button.dataset.differentialId);
    else if (action === "move-differential") {
      const problem = draft.problems.find((entry) => entry.id === button.dataset.problemId);
      draft = reorderDifferentials(draft, button.dataset.problemId, moveId(problem?.differentials.map((entry) => entry.id) || [], button.dataset.differentialId, button.dataset.direction));
    } else if (action === "remove-objective-selection") {
      const candidate = (current.index.objectiveCandidates || current.index.candidates).find((entry) => entry.id === button.dataset.selectionId);
      // Removing a default-on vital or medication remembers the choice so the
      // auto-include pass does not silently re-add it.
      draft = isDefaultOn(candidate)
        ? deselectObjectiveBlockWithMemory(draft, button.dataset.selectionId)
        : deselectObjectiveBlock(draft, button.dataset.selectionId);
    } else if (action === "remove-objective-group") {
      draft = removeObjectiveGroupWithMemory(draft, button.dataset.group);
    } else if (action === "refresh-objective-group") {
      draft = refreshObjectiveGroup(draft, button.dataset.group);
    } else return false;
    setDraft(draft);
    render();
    return true;
  }

  return Object.freeze({ change, click, input, keydown, open, prepare, render, saveDraft, toggle });
}
