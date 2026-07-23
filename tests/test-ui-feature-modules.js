import assert from "node:assert/strict";
import { createChecklistPresentation } from "../src/ui/checklist/presentation.js";
import { checklistPhoneUrl, createPhoneTransferController } from "../src/ui/checklist/transfer.js";
import { createRedactionPresentation, redactionPosition, warningDescription, warningSnippet } from "../src/ui/redaction/presentation.js";
import { createWorkupPresentation, normalizeWorkupCatalogQuery } from "../src/ui/workups/presentation.js";
import { createDailyPresentation } from "../src/ui/daily/presentation.js";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const icon = (name) => `<svg data-icon="${name}"></svg>`;

const dailyView = createDailyPresentation({ escapeHtml, icon });
const dailyMarkup = dailyView.renderDaily({
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
});
assert.match(dailyMarkup, /data-action="select-admission"/);
assert.match(dailyMarkup, /data-action="add-admission-source"/);
assert.match(dailyMarkup, /source-capture-composer/);

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
