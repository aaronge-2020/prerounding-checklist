import { safeHtml } from "../../lib/safe-html.js?v=20261012-safety";
import { captureScrollPositions, restoreScrollPositions } from "../view-scroll.js?v=20261012-safety";
import { updateActivePatient, createLocalId } from "../../app/state/vault.js?v=20261015-encounter-review";
import {
  packetSources,
  createSourceReference,
  renderedSourceText,
  retainedSourceRange,
  renderedSourceRange,
  addReviewItem,
  recordItemReview,
  normalizeEncounterReview,
  reviewItemState,
  buildEncounterReviewBrief
} from "../../encounter-review/index.js?v=20261015-encounter-review";
import { renderEncounterReview } from "./presentation.js?v=20261015-sample-note-sections";

export function createEncounterReviewController(deps) {
  // Only UI choices are retained here. Patient text remains in the vault's
  // de-identified sources or protected DOM; no chart-bearing session cache.
  let identity = "",
    ui = {},
    saving = false;
  const root = () => deps.byId("dailyContent")?.querySelector("[data-encounter-review]");
  const packetId = () => deps.app.selectedStayPacketId || "admission";
  function reset() {
    identity = "";
    ui = {};
  }
  function sync() {
    const next = `${deps.active()?.id || ""}:${packetId()}`;
    if (identity !== next) {
      identity = next;
      ui = {
        open: false,
        tab: "items",
        filter: "all",
        sourcePacketId: packetId(),
        sourceId: "",
        comparePacketId: "",
        message: "",
        evidenceItemId: ""
      };
    }
    const sources = packetSources(deps.active(), ui.sourcePacketId);
    if (!sources.some((source) => source.id === ui.sourceId))
      ui.sourceId = sources.find((source) => source.fieldId === "plan")?.id || sources[0]?.id || "";
  }
  function markup() {
    if (!deps.active()) return "";
    sync();
    return renderEncounterReview(deps.active(), packetId(), { ...ui, saving }, deps.escapeHtml);
  }
  function refresh() {
    const node = root();
    if (!node || !deps.active()) return;
    ui.open = node.open;
    const positions = captureScrollPositions(node);
    node.outerHTML = safeHtml(markup());
    restoreScrollPositions(root(), positions);
  }
  function selectedReference() {
    const textarea = root()?.querySelector("[data-encounter-source-text]");
    const source = packetSources(deps.active(), ui.sourcePacketId).find((entry) => entry.id === ui.sourceId);
    if (!textarea || !source || textarea.value !== renderedSourceText(source.text))
      throw new Error("The source changed. Reopen it before selecting a passage.");
    if (textarea.selectionEnd - textarea.selectionStart > 3000)
      throw new Error("Select a focused passage of at most 3,000 characters; the full source remains available.");
    const range = retainedSourceRange(source.text, textarea.selectionStart, textarea.selectionEnd);
    return createSourceReference(deps.active(), ui.sourcePacketId, ui.sourceId, range.start, range.end);
  }
  async function save(transform, message) {
    if (saving || !deps.active() || !deps.app.passphrase) return;
    const prior = deps.app.vault,
      token = identity;
    const next = updateActivePatient(prior, transform);
    saving = true;
    deps.app.vault = next;
    try {
      await deps.persistVault(message);
      if (identity === token && deps.app.vault === next) {
        ui.message = message;
        refresh();
      }
    } catch (error) {
      if (deps.app.vault === next) deps.app.vault = prior;
      if (identity === token) {
        ui.message = `Not saved: ${error.message}`;
        refresh();
      }
      throw error;
    } finally {
      saving = false;
      if (identity === token && deps.active()) refresh();
    }
  }
  function showReference(ref) {
    ui.tab = "sources";
    ui.sourcePacketId = ref.packetId;
    ui.sourceId = ref.sourceId;
    ui.open = true;
    refresh();
    const textarea = root()?.querySelector("[data-encounter-source-text]");
    const source = packetSources(deps.active(), ref.packetId).find((entry) => entry.id === ref.sourceId);
    const range = source ? renderedSourceRange(source.text, ref.start, ref.end) : null;
    if (textarea && range && textarea.value.slice(range.start, range.end) === renderedSourceText(ref.quote)) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(range.start, range.end);
    }
  }
  async function click(target) {
    const action = target.dataset.action;
    if (!action?.startsWith("encounter-")) return false;
    if (saving || !deps.active() || !root()?.contains(target)) return true;
    sync();
    ui.open = true;
    ui.message = "";
    const item = normalizeEncounterReview(deps.active().encounterReview).items.find((entry) => entry.id === target.dataset.itemId);
    if (action === "encounter-tab") {
      ui.tab = target.dataset.tab;
      ui.evidenceItemId = "";
      refresh();
    }
    if (action === "encounter-add" || action === "encounter-track-line") {
      if (action === "encounter-track-line") {
        const textarea = root()?.querySelector("[data-encounter-source-text]");
        const current = packetSources(deps.active(), ui.sourcePacketId).find((entry) => entry.id === ui.sourceId);
        if (textarea && current) {
          const range = renderedSourceRange(current.text, Number(target.dataset.start), Number(target.dataset.end));
          textarea.setSelectionRange(range.start, range.end);
        }
      }
      const source = selectedReference();
      await save(
        (patient) =>
          addReviewItem(patient, {
            id: createLocalId("review"),
            kind: action === "encounter-track-line" ? "follow_up" : target.dataset.kind,
            source
          }),
        "Reminder added. Check it during the encounter, then choose your answer."
      );
      ui.tab = "items";
      refresh();
    }
    if (action === "encounter-remove" && item)
      await save(
        (patient) => ({
          ...patient,
          encounterReview: {
            ...normalizeEncounterReview(patient.encounterReview),
            items: normalizeEncounterReview(patient.encounterReview).items.filter((entry) => entry.id !== item.id)
          }
        }),
        "Review item removed. The chart source is unchanged."
      );
    if (action === "encounter-source" && item) showReference(item.source);
    if (action === "encounter-evidence-source" && item) {
      const ref = reviewItemState(deps.active(), item, packetId()).current?.evidence;
      if (ref) showReference(ref);
    }
    if (action === "encounter-choose-evidence" && item) {
      ui.evidenceItemId = item.id;
      ui.tab = "sources";
      ui.sourcePacketId = packetId();
      ui.sourceId = "";
      refresh();
      ui.message = "Select a supporting passage, then attach it. Attaching evidence does not change the status.";
      refresh();
    }
    if (action === "encounter-cancel-evidence") {
      ui.evidenceItemId = "";
      refresh();
    }
    if (action === "encounter-attach" && item) {
      const evidence = selectedReference(),
        status = reviewItemState(deps.active(), item, packetId()).status,
        currentPacket = packetId();
      await save(
        (patient) =>
          recordItemReview(patient, { itemId: item.id, packetId: currentPacket, status, evidence, recordedAt: new Date().toISOString() }),
        "Supporting passage attached; status unchanged."
      );
      ui.evidenceItemId = "";
      ui.tab = "items";
      refresh();
    }
    if (action === "encounter-copy") await deps.copyText(buildEncounterReviewBrief(deps.active(), packetId()));
    return true;
  }
  function change(target) {
    if (!root()?.contains(target) || !deps.active()) return false;
    sync();
    if (target.matches("[data-encounter-source-packet]")) {
      ui.sourcePacketId = target.value;
      ui.sourceId = "";
      refresh();
      return true;
    }
    if (target.matches("[data-encounter-source-id]")) {
      ui.sourceId = target.value;
      refresh();
      return true;
    }
    if (target.matches("[data-encounter-compare]")) {
      ui.comparePacketId = target.value;
      refresh();
      return true;
    }
    if (target.matches("[data-encounter-filter]")) {
      ui.filter = target.value;
      refresh();
      return true;
    }
    if (target.matches("[data-encounter-status]")) {
      const itemId = target.dataset.encounterStatus,
        currentPacket = packetId(),
        status = target.value;
      const item = normalizeEncounterReview(deps.active().encounterReview).items.find((entry) => entry.id === itemId);
      const state = item ? reviewItemState(deps.active(), item, currentPacket) : null;
      const evidence = state?.evidence?.valid ? state.current.evidence : null;
      void save(
        (patient) => recordItemReview(patient, { itemId, packetId: currentPacket, status, evidence, recordedAt: new Date().toISOString() }),
        "Answer saved for the selected encounter."
      ).catch((error) => deps.setStatus(error.message));
      return true;
    }
    return false;
  }
  function open() {
    sync();
    ui.open = true;
    refresh();
    root()?.setAttribute("open", "");
  }
  return { markup, click, change, reset, open };
}
