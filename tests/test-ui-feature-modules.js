import assert from "node:assert/strict";
import { createChecklistPresentation } from "../src/ui/checklist/presentation.js";
import { checklistPhoneUrl, createPhoneTransferController } from "../src/ui/checklist/transfer.js";
import { createRedactionPresentation, redactionPosition, warningDescription, warningSnippet } from "../src/ui/redaction/presentation.js";
import { createWorkupPresentation, normalizeWorkupCatalogQuery } from "../src/ui/workups/presentation.js";
import { createDailyPresentation } from "../src/ui/daily/presentation.js";
import { createDemoPresentation, demoStage } from "../src/ui/demo/presentation.js";
import { createDemoPatient } from "../src/ui/demo/session.js";
import { createPromptsPresentation } from "../src/ui/prompts/presentation.js";
import { GUIDELINE_PAGE_SIZE, guidelinePageModel } from "../src/ui/settings/guideline-pagination.js";
import { renderGuidelineSets } from "../src/ui/settings/guidelines-presentation.js";
import { evaluatePacketCompleteness, packetReviewRequirement } from "../src/daily-updates/packet-completeness.js";
import { sourceCapturePacketCheck } from "../src/patient-context/source-captures.js";
import { replaceViewContent } from "../src/ui/view-scroll.js";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const icon = (name) => `<svg data-icon="${name}"></svg>`;

const scrollOwner = { scrollTop: 640, scrollLeft: 18 };
const viewContent = {
  closest: (selector) => selector === ".view" ? scrollOwner : null,
  set innerHTML(value) {
    this.markup = value;
    scrollOwner.scrollTop = 0;
    scrollOwner.scrollLeft = 0;
  }
};
replaceViewContent(viewContent, "<button>Saved</button>");
assert.equal(viewContent.markup, "<button>Saved</button>");
assert.deepEqual([scrollOwner.scrollTop, scrollOwner.scrollLeft], [640, 18], "whole-view rerenders preserve route scroll");

const promptsView = createPromptsPresentation({ escapeHtml });
const paginationGuidelines = Array.from({ length: 23 }, (_, index) => ({
  id: `guideline-${index + 1}`,
  label: index === 19 ? "Pre-Op Prep" : `Guideline ${index + 1}`,
  token: index === 19 ? "@pre-op-prep-guidelines" : `@guideline-${index + 1}`,
  text: `Instructions ${index + 1}`
}));
assert.equal(GUIDELINE_PAGE_SIZE, 10);
assert.equal(guidelinePageModel(paginationGuidelines, { page: 1 }).pageSets.length, 10);
assert.equal(guidelinePageModel(paginationGuidelines, { page: 2 }).pageSets.length, 10);
assert.equal(guidelinePageModel(paginationGuidelines, { page: 3 }).pageSets.length, 3);
assert.equal(guidelinePageModel(paginationGuidelines, { page: 99 }).currentPage, 3, "guideline pages clamp after deletion or filtering");
const filteredGuidelinePage = guidelinePageModel(paginationGuidelines, { searchQuery: "pre-op", page: 2 });
assert.equal(filteredGuidelinePage.currentPage, 1);
assert.deepEqual(filteredGuidelinePage.pageSets.map(({ label }) => label), ["Pre-Op Prep"]);
const guidelinePageMarkup = renderGuidelineSets({
  guidelineSets: paginationGuidelines,
  escapeHtml,
  page: 2
});
assert.equal((guidelinePageMarkup.match(/class="guideline-row /g) || []).length, 10);
assert.match(guidelinePageMarkup, /Showing 11-20 of 23 guidelines/);
assert.match(guidelinePageMarkup, /Page 2 of 3/);
assert.match(guidelinePageMarkup, /data-guideline-page="1"/);
assert.match(guidelinePageMarkup, /data-guideline-page="3"/);
const critiqueMarkup = promptsView.renderPrompts({
  patient: { id: "patient_1" },
  patientRequiredMessage: "",
  task: { id: "attending_presentation_critique", label: "Attending presentation critique" },
  tasks: [{ id: "attending_presentation_critique", label: "Attending presentation critique" }],
  promptDays: [],
  selectedPromptDayId: "admission",
  template: "Template",
  previewSegments: [{ type: "text", value: "Preview" }],
  templateHighlightSegments: [{ type: "text", value: "Template" }],
  promptError: "",
  presentationToEdit: "De-identified draft",
  presentationSpecialty: "Cardiology & EP",
  requiresPresentationToEdit: true,
  requiresPresentationSpecialty: true,
  variables: [],
  smartMenuOpen: false
});
assert.match(critiqueMarkup, /Student note to critique/);
assert.match(critiqueMarkup, /No saved draft is available/);
assert.match(critiqueMarkup, /id="presentationSpecialty"/);
assert.match(critiqueMarkup, /Cardiology &amp; EP/);
assert.match(critiqueMarkup, /De-identified draft/);

const dailyView = createDailyPresentation({ escapeHtml, icon });
const missingPacket = evaluatePacketCompleteness([
  { sourceKind: "primary_note", deidentifiedText: "Reviewed note." },
  { sourceKind: "results", deidentifiedText: "Legacy combined results." },
  { sourceKind: "consult_note", deidentifiedText: "Consult reviewed." }
]);
assert.equal(missingPacket.requiredReviewed, 1);
assert.deepEqual(missingPacket.missingRequired.map(({ id }) => id), ["vital_signs", "laboratory_results"], "generic legacy results must not silently satisfy the distinct vital-sign and laboratory requirements");
assert.equal(missingPacket.items.find(({ id }) => id === "consult_note").requirement, "optional");
assert.equal(packetReviewRequirement("medication_activity"), "optional");
const completePacket = evaluatePacketCompleteness([
  { sourceKind: "primary_note", deidentifiedText: "Reviewed note." },
  { sourceKind: "vital_signs", deidentifiedText: "Reviewed vitals." },
  { sourceKind: "laboratory_results", deidentifiedText: "Reviewed labs." }
]);
assert.equal(completePacket.hasMissingRequired, false);
assert.deepEqual(sourceCapturePacketCheck([{ sourceKind: "results", deidentifiedText: "Legacy results." }]).notSupplied, ["Primary team note", "Vital signs", "Laboratory results"]);
const demoView = createDemoPresentation({ escapeHtml });
const demoPatient = createDemoPatient();
assert.equal(demoPatient.contextSections.length, 0, "the guided demo must begin with an empty admission source list");
assert.equal(demoPatient.days[0].sourceCaptures.length, 0, "the guided demo must add the selected-day source through the normal workflow");
assert.equal(demoStage("write-note").title, "Review the complete assessment and plan");
assert.match(demoView.renderGuide({ session: { stage: "write-note" }, currentView: "review" }), /fully written synthetic assessment/i);
assert.match(demoView.renderCallout({ stage: demoStage("save-context") }), /Daniel Morgan is a synthetic 61-year-old/);
const dailyRenderOptions = {
  patient: { contextSections: [{ id: "admission", label: "Admission context", deidentifiedText: "", residualWarnings: [], createdAt: "2026-01-01" }] },
  days: [{ id: "day1", label: "HD1", date: "2026-01-02", sourceCaptures: [] }],
  selectedDayId: "day1",
  selectedPacketId: "admission",
  localCalendarDate: "2026-01-02",
  patientRequiredMessage: "",
  renderDeidStrip: "<div>De-ID</div>",
  renderSectionEditor: () => "<article>Admission editor</article>",
  renderSourceCaptureEditor: () => "",
  renderWarnings: () => "",
  sourceOptions: [{ id: "primary_note", label: "Primary team note", description: "Note" }],
  selectedSourceKind: "primary_note",
  sourceDraft: "",
  packetCheck: { included: [], notSupplied: [], needsConfirmation: [] },
  deidBusy: false
};
const dailyMarkup = dailyView.renderDaily(dailyRenderOptions);
assert.match(dailyMarkup, /data-action="select-admission"/);
assert.match(dailyMarkup, /data-structured-note-paste/);
assert.match(dailyMarkup, /Paste full note/);
assert.match(dailyMarkup, /Enter by section/);
assert.match(dailyMarkup, /Sections found/);
assert.equal((dailyMarkup.match(/<textarea/g) || []).length, 1, "paste mode should render one full-note editor");
assert.doesNotMatch(dailyMarkup, /data-action="add-admission-source"/, "the primary note uses its dedicated paste-first composer");
const unlabeledNoteMarkup = dailyView.renderDaily({
  ...dailyRenderOptions,
  structuredNoteComposers: {
    admission: {
      mode: "paste",
      pastedText: "Unlabeled primary-team narrative.",
      parseResult: { rawCharacterCount: 34, detectedFieldIds: [], detectedSectionCount: 0 }
    }
  }
});
assert.match(unlabeledNoteMarkup, /full note will be kept under Other note content/i);
assert.match(unlabeledNoteMarkup, /data-action="review-structured-note-sections"[^>]*>Review note<\/button>/);
assert.doesNotMatch(unlabeledNoteMarkup, /data-action="review-structured-note-sections"[^>]*disabled/);
const sectionMarkup = dailyView.renderDaily({
  ...dailyRenderOptions,
  structuredNoteComposers: { admission: { mode: "sections", activeFieldId: "physical_exam" } },
  structuredNoteDrafts: { admission: { one_liner: "Adult with dyspnea.", physical_exam: "No respiratory distress." } }
});
assert.match(sectionMarkup, /data-action="save-structured-primary-note"/);
assert.match(sectionMarkup, /data-note-field="one_liner"/);
assert.match(sectionMarkup, /data-note-field="physical_exam"/);
assert.match(sectionMarkup, /data-note-field="assessment"/);
assert.match(sectionMarkup, /data-note-field="plan"/);
assert.match(sectionMarkup, /data-structured-note-field="physical_exam"/);
assert.equal((sectionMarkup.match(/<textarea/g) || []).length, 1, "section mode should render only the active section editor");
assert.match(sectionMarkup, /2 of 20 added/);
assert.match(dailyMarkup, /Review completeness/);
assert.match(dailyMarkup, /Required items are visible reminders, not blockers/);
assert.match(dailyMarkup, /data-review-item="primary_note" data-review-requirement="required" data-review-status="not_reviewed"/);
assert.match(dailyMarkup, /data-review-item="consult_note" data-review-requirement="optional" data-review-status="not_reviewed"/);
assert.match(dailyMarkup, /data-required-missing="3"/);
const parsedSourceMarkup = dailyView.renderSourceParsePreview({
  scope: "daily",
  parseResult: {
    recognized: true,
    rawCharacterCount: 420,
    formatLabel: "CPRS inpatient-order table",
    summary: "2 medication entries; report columns removed.",
    outputText: "Medications\nAcetaminophen 650 mg PO — given",
    displayModel: {
      type: "medications",
      title: "Medication activity",
      columns: ["Medication", "Order", "Status / administrations", "Instructions"],
      provenance: { sourceSystem: "CPRS" },
      groups: [{ label: "Scheduled", timestamp: "", rows: [{ id: "med_1", cells: ["Acetaminophen", "650 mg · PO", "Given", ""], emphasis: "unknown" }] }]
    }
  }
});
assert.match(parsedSourceMarkup, /CPRS inpatient-order table recognized/);
assert.match(parsedSourceMarkup, /data-source-parsed-draft/);
assert.match(parsedSourceMarkup, /Session only/);
assert.doesNotMatch(parsedSourceMarkup, /data-clinical-view="medications"/, "clinical summaries belong on Review Data, not Hospital Stay");
assert.match(parsedSourceMarkup, /Acetaminophen/);
assert.match(parsedSourceMarkup, /AI-ready text/);
const labPreviewMarkup = dailyView.renderSourceParsePreview({
  scope: "daily",
  parseResult: {
    recognized: true,
    rawCharacterCount: 120,
    formatLabel: "Laboratory clipboard table",
    summary: "2 results.",
    outputText: "Labs\nSodium: 140 mmol/L\nSodium: 132 mmol/L; flag L",
    displayModel: {
      type: "labs",
      title: "Laboratory results",
      columns: ["Test", "Result", "Units", "Reference range", "Flag"],
      provenance: { sourceSystem: "Clipboard table" },
      groups: [{ label: "Chemistry", timestamp: "Hospital day", rows: [{ id: "lab_1", cells: ["Sodium", "132", "mmol/L", "135–145", "L"], emphasis: "low" }] }],
      series: [{ name: "Sodium", points: [{ value: 140, unit: "mmol/L" }, { value: 132, unit: "mmol/L" }] }]
    }
  }
});
assert.doesNotMatch(labPreviewMarkup, /data-clinical-view="labs"/);
assert.doesNotMatch(labPreviewMarkup, /clinical-trend/);
const mixedSourceParse = {
  recognized: true,
  rawCharacterCount: 900,
  formatLabel: "Mixed Epic export",
  summary: "3 source sections detected.",
  outputText: "Combined structured text",
  sections: [
    { sourceKind: "laboratory_results", formatLabel: "Epic results", summary: "2 results.", outputText: "Results text" },
    { sourceKind: "medication_activity", formatLabel: "Epic MAR", summary: "1 medication entry.", outputText: "MAR text" },
    { sourceKind: "vital_signs", formatLabel: "Epic vitals", summary: "2 vital-sign fields.", outputText: "Vitals text" }
  ]
};
const mixedSourceMarkup = dailyView.renderSourceParsePreview({ scope: "daily", parseResult: mixedSourceParse });
assert.match(mixedSourceMarkup, /Mixed Epic export recognized as 3 sources/);
assert.equal((mixedSourceMarkup.match(/data-source-section-index=/g) || []).length, 3);
assert.match(mixedSourceMarkup, /Each section below will be de-identified and saved as its own typed source/);
const dailyMixedMarkup = dailyView.renderDaily({
  patient: { contextSections: [] },
  days: [{ id: "day1", label: "HD1", date: "2026-01-02", sourceCaptures: [] }],
  selectedDayId: "day1",
  selectedPacketId: "day1",
  localCalendarDate: "2026-01-02",
  patientRequiredMessage: "",
  renderDeidStrip: "<div>De-ID</div>",
  renderSectionEditor: () => "",
  renderSourceCaptureEditor: () => "",
  renderWarnings: () => "",
  sourceOptions: [{ id: "results", label: "Results", description: "Labs and vitals" }],
  selectedSourceKind: "results",
  sourceDraft: "Mixed Epic text",
  sourceParse: mixedSourceParse,
  packetCheck: { included: [], notSupplied: [], needsConfirmation: [] },
  deidBusy: false
});
assert.match(dailyMixedMarkup, /De-identify and add 3 sources/);
assert.equal(dailyMixedMarkup.indexOf("De-identify and add 3 sources") < dailyMixedMarkup.indexOf("Mixed Epic export recognized as 3 sources"), true, "the save action must remain visible before the structured review");

const snapshot = {
  id: "checklist_test",
  workupTitles: ["Test workup"],
  items: [
    { id: "history_1", kind: "history", system: "General", text: "History item", workupTitle: "Test workup", choices: ["No", "Yes"], select: "one" },
    { id: "exam_1", kind: "exam", system: "General", text: "Exam item", workupTitle: "Test workup", choices: ["Normal", "Abnormal"], select: "one" }
  ]
};
const answers = { history_1: { selected: ["No"], note: "" }, exam_1: { selected: ["Normal"], note: "" } };

const checklistView = createChecklistPresentation({ escapeHtml, icon });
assert.equal(checklistView.completedCount(snapshot.items, answers), 2);
assert.match(checklistView.renderDesktopChecklist({ day: { label: "Hospital day 1" }, snapshot, answers, phoneLink: "https://example.test/#phone=bundle" }), /data-action="share-phone-bundle"/);
const phoneView = checklistView.buildPhoneChecklistView({ patientLabel: "A", snapshot, answers, phoneReturnReady: true, returnBundle: "return-token" });
assert.equal(phoneView.readyToReturn, true);
assert.match(phoneView.markup, /data-action="share-phone-return"/);

assert.equal(normalizeWorkupCatalogQuery("  Acute Kidney  "), "acute kidney");
const workupView = createWorkupPresentation({ escapeHtml, icon });
const workup = {
  id: "test-workup",
  title: "Test workup",
  aliases: [],
  items: [
    { id: "history", kind: "history", system: "general", text: "History question", choices: ["No", "Yes"], select: "one" },
    { id: "exam", kind: "exam", system: "general", text: "Exam item", choices: ["Normal", "Abnormal"], select: "one" }
  ]
};
const workupMarkup = workupView.renderWorkups({
  catalog: [workup],
  selectedIds: new Set([workup.id]),
  matchingWorkupIds: null,
  editorWorkup: workup,
  hasDraftWorkup: false,
  catalogQuery: "",
  thoroughness: "standard",
  hasSavedOpenAiKey: false,
  openAiModelLabel: "gpt-4o-mini",
  workspace: { status: "unconfigured", message: "Choose a workspace folder." },
  workspaceBusy: false,
  workupOverrides: {},
  workupImportError: "",
  workupApiBusy: false,
  workupApiDeidConfirmed: false,
  workupImportDraft: ""
});
assert.match(workupMarkup, /id="workupTitleInput"/);
assert.equal(redactionPosition("Keep [NAME] safe", { placeholder: "[NAME]", occurrence: 0 }), 5);
assert.equal(warningDescription({ type: "Name", snippet: "Jane" }), "Name: Jane");
assert.equal(warningSnippet({ snippet: " Jane " }), "Jane");
const redactionView = createRedactionPresentation({ escapeHtml, icon });
const warningMarkup = redactionView.renderWarnings({
  scope: "context",
  sections: [{ id: "admission", label: "Admission context", residualWarnings: [{ type: "MRN", reason: "direct identifier" }] }],
  reviewFor: () => null
});
assert.match(warningMarkup, /data-action="dismiss-all-section-warnings"/);
assert.match(warningMarkup, /Dismiss all warnings for Admission context as not PHI/);
const confirmedMarkup = redactionView.renderRedactionDocument("[NAME]", {
  inspectedRedactionIndex: 0,
  redactions: [{ placeholder: "[NAME]", original: "Jane", occurrence: 0, state: "confirmed" }]
});
assert.doesNotMatch(confirmedMarkup, /Jane/);
assert.match(confirmedMarkup, /Accepted redaction/);
const quietReviewMarkup = redactionView.renderSectionSurface({
  section: { id: "admission", label: "Admission context" },
  scope: "context",
  review: { inspectedRedactionIndex: -1, redactions: [] },
  editing: false,
  draftText: "No identifiers remain in this field.",
  sections: [
    { id: "admission", label: "Admission context" },
    { id: "medications", label: "Medications" }
  ],
  reviewFor: (sectionId) => sectionId === "medications" ? { redactions: [] } : null
});
assert.match(quietReviewMarkup, /Field complete/);
assert.match(quietReviewMarkup, /Next: review Medications/);
assert.match(quietReviewMarkup, /data-action="continue-section-review"/);
const editableWithoutReviewMarkup = redactionView.renderSectionSurface({
  section: { id: "physical-exam", label: "Physical exam" },
  scope: "daily",
  review: null,
  editing: false,
  draftText: "Edited de-identified text."
});
assert.match(editableWithoutReviewMarkup, /data-action="resume-section-review"/);
assert.match(editableWithoutReviewMarkup, /Save and re-run redaction review/);

class FakeFile {
  constructor(parts, name, options) {
    this.parts = parts;
    this.name = name;
    this.type = options.type;
  }
}

const transferEvents = [];
const checklistBundle = { schema: "prerounding_phone_checklist_bundle_v1", patientLabel: "A", checklist: snapshot, answers };
const returnBundle = { schema: "prerounding_checklist_return_v1", checklistId: snapshot.id, answers };
const fallbackTransfer = createPhoneTransferController({
  FileConstructor: FakeFile,
  getChecklistBundle: () => checklistBundle,
  getReturnBundle: () => returnBundle,
  location: { origin: "https://example.test", pathname: "/app" },
  navigatorObject: {},
  downloadJson: (name, body) => transferEvents.push({ name, body }),
  setStatus: (message) => transferEvents.push({ message })
});
assert.match(checklistPhoneUrl({ origin: "https://example.test", pathname: "/app" }, checklistBundle), /^https:\/\/example\.test\/app#phone=/);
await fallbackTransfer.shareChecklist();
assert.equal(transferEvents[0].name, "prerounding-checklist.bundle.json");

const shared = [];
const sharedTransfer = createPhoneTransferController({
  FileConstructor: FakeFile,
  getChecklistBundle: () => checklistBundle,
  getReturnBundle: () => returnBundle,
  location: { origin: "https://example.test", pathname: "/app" },
  navigatorObject: {
    canShare: () => true,
    share: async (payload) => shared.push(payload)
  },
  downloadJson: () => assert.fail("native sharing should not download"),
  setStatus: () => {}
});
await sharedTransfer.shareReturn();
assert.equal(shared[0].files[0].name, "prerounding-checklist-return.bundle.txt");

console.log("UI feature module tests passed");
