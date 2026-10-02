import assert from "node:assert/strict";
import { createReviewPresentation } from "../src/ui/review/presentation.js";
import { createReviewController } from "../src/ui/review/controller.js";
import { addDraftCustomSection, getLayout } from "../src/note-drafts/layout.js";
import { normalizeNoteDraft, updateNoteSection } from "../src/note-drafts/model.js";

// Removing a custom section that holds text must ask for confirmation first;
// an empty custom section removes immediately. Runs the real controller with
// stubbed DOM deps (the confirmation dialog lives in index.html, so the
// controller talks to it through deps.byId).

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    set innerHTML(value) { this._html = value; },
    content: { querySelector: () => null }
  })
};

const dialogMessage = { textContent: "" };
const dialogStub = {
  shown: false,
  showModal() { this.shown = true; },
  close() { this.shown = false; },
  querySelector: (sel) => (sel === "#removeCustomSectionConfirmText" ? dialogMessage : null)
};
const draftPanelStub = { scrollTop: 0, scrollLeft: 0, outerHTML: "" };
const reviewContent = {
  innerHTML: "",
  querySelector: (sel) => (sel === ".note-draft-panel" ? draftPanelStub : null)
};

const patient = {
  id: "confirm_patient",
  displayLabel: "Confirm Patient",
  days: [{ id: "day_one", date: "2026-09-23", label: "HD1", createdAt: "2026-09-23T06:00:00.000Z" }],
  noteDrafts: {}
};

const statuses = [];
const app = {
  noteDraftSessions: new Map(),
  reviewPacketId: "day_one",
  reviewCategory: "all",
  reviewSearchQuery: "",
  reviewDifferenceSelectionId: ""
};
const controller = createReviewController({
  app,
  active: () => patient,
  byId: (id) => {
    if (id === "reviewContent") return reviewContent;
    if (id === "removeCustomSectionConfirmDialog") return dialogStub;
    return null;
  },
  presentation: createReviewPresentation({ escapeHtml, icon: () => "" }),
  patientRequiredMessage: () => "",
  persistVault: async () => {},
  render: () => {},
  setStatus: (message) => { statuses.push(message); },
  copyText: async () => {},
  downloadText: () => {}
});

const targetFor = (action, dataset = {}) => ({
  closest: (sel) => (sel === "[data-action]" ? { dataset: { action, ...dataset } } : null)
});

function seedDraft() {
  let draft = normalizeNoteDraft({ noteType: "progress", sections: {} });
  const added = addDraftCustomSection(draft, "Night Events", { idFactory: () => "test_confirm_1" });
  draft = updateNoteSection(added.draft, added.sectionId, "Patient rested comfortably overnight.");
  const empty = addDraftCustomSection(draft, "Empty Corner", { idFactory: () => "test_empty_1" });
  draft = empty.draft;
  patient.noteDrafts = { day_one: draft };
  app.noteDraftSessions.clear();
  dialogStub.shown = false;
  dialogMessage.textContent = "";
  return { filledId: added.sectionId, emptyId: empty.sectionId };
}

const orderOf = () => getLayout(patient.noteDrafts.day_one).order;
const sessionOrder = () => getLayout(app.noteDraftSessions.get("day_one")).order;

// 1. Non-empty custom section: remove click opens the dialog, section stays.
{
  const { filledId } = seedDraft();
  const handled = controller.click(targetFor("remove-custom-section", { sectionId: filledId }));
  assert.equal(handled, true, "remove-custom-section click is handled");
  assert.equal(dialogStub.shown, true, "confirmation dialog opens for a non-empty section");
  assert.ok(dialogMessage.textContent.includes("Night Events"), "dialog names the section label");
  assert.ok(orderOf().includes(filledId), "section is retained until confirmed");
}

// 2. Confirming removes the section and closes the dialog.
{
  const { filledId } = seedDraft();
  controller.click(targetFor("remove-custom-section", { sectionId: filledId }));
  assert.equal(dialogStub.shown, true, "dialog opens before confirm");
  const handled = controller.click(targetFor("confirm-remove-custom-section"));
  assert.equal(handled, true, "confirm click is handled");
  assert.equal(dialogStub.shown, false, "dialog closes after confirm");
  assert.ok(!sessionOrder().includes(filledId), "section is removed from the session draft");
}

// 3. Empty custom section: removes immediately, no dialog.
{
  const { emptyId } = seedDraft();
  const handled = controller.click(targetFor("remove-custom-section", { sectionId: emptyId }));
  assert.equal(handled, true, "remove click on empty section is handled");
  assert.equal(dialogStub.shown, false, "no dialog for an empty section");
  assert.ok(!sessionOrder().includes(emptyId), "empty section is removed immediately");
}

console.log("custom section remove-confirmation tests passed");
