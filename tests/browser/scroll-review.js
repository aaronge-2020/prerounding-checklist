// Actual controller, renderer and styles. Only inference and the remote request
// use deterministic substitutes; synthetic fixture text never leaves.
import { createAiChatController } from "../../src/ui/ai-chat/controller.js";
const patient = {
  id: "scroll-patient", displayLabel: "Synthetic room", metadata: {}, days: [],
  contextSections: Array.from({ length: 8 }, (_, i) => ({
    id: `note-${i}`, label: `Document ${i + 1}`, sourceKind: "primary_note",
    deidentifiedText: `SyntheticName${i} described chest discomfort. ManualTarget needs review.\n` +
      "SyntheticName remains stable.\n".repeat(8) + "Clinical observation without identifiers.\n".repeat(35)
  }))
};
window.sent = [];
window.fixtureApp = { view: "aiChat", vault: { patients: [patient], activePatientId: patient.id } };
const deidDeps = {
  getSelectedDeidModelStatus: key => ({ ready: true, modelKey: key, label: "Synthetic test model" }),
  getAdvancedDeidStatus: () => ({ label: "Synthetic test model" }),
  crossOriginIsolationBlocker: () => "", verifyAdvancedDeidModel: async () => {},
  preloadAdvancedDeidModel: async () => ({}),
  deidentifyText: async raw => {
    const text = String(raw);
    if (window.failModel) throw new Error("Synthetic model failure");
    const entities = [...text.matchAll(/SyntheticName\d*/g)].map(m => ({
      start: m.index, end: m.index + m[0].length, label: "NAME", renderedPlaceholder: "[NAME]", source: "model"
    }));
    return { text: text.replace(/SyntheticName\d*/g, "[NAME]"), entities,
      redactionTotal: entities.length, counts: { NAME: entities.length }, residualWarnings: [], flags: [],
      modelId: "fixture-model", modelChunkFailures: 0 };
  }
};
const controller = createAiChatController({
  app: window.fixtureApp, byId: id => document.getElementById(id),
  escapeHtml: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  icon: () => "", setStatus: text => { window.fixtureStatus = text; },
  onNavigateToChartSection: target => { window.navigated = target; },
  render: () => controller.render(), getDraftNoteText: () => "",
  currentPreferences: () => ({ openAiApiKey: "synthetic-key", openAiModel: "gpt-5.4-mini", medicalService: "medicine" }),
  deidDeps, chatDeps: { requestOpenAiChat: async args => { window.sent.push(args); return "Synthetic reply"; } }
});
window.controller = controller;
document.addEventListener("click", event => controller.click(event.target));
document.addEventListener("change", event => controller.change(event.target));
document.addEventListener("submit", event => controller.submit(event));
document.addEventListener("keydown", event => controller.keydown(event));
document.addEventListener("mousedown", event => {
  if (event.target.closest("button[data-action]")) event.preventDefault();
});
controller.render();
