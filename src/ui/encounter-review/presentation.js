import {
  REVIEW_KINDS,
  REVIEW_STATUSES,
  encounterPackets,
  packetSources,
  normalizeEncounterReview,
  reviewItemState,
  compareEncounterPackets,
  compareSourceLines,
  planPassages
} from "../../encounter-review/index.js?v=20261015-encounter-review";

export function renderEncounterReview(patient, packetId, ui, escapeHtml) {
  const itemQuestions = {
    follow_up: "Was this prior plan completed?",
    clarify: "What needs clarification?",
    verify: "Is this history still accurate?"
  };
  const addLabels = { follow_up: "Check a prior plan", clarify: "Clarify with patient", verify: "Confirm history" };
  const e = escapeHtml,
    packets = encounterPackets(patient),
    items = normalizeEncounterReview(patient.encounterReview).items;
  const packetName = (id) => packets.find((packet) => packet.id === id)?.label || "Removed packet";
  const optionList = (selected, blank = false) =>
    `${blank ? '<option value="">Choose a packet</option>' : ""}${packets.map((packet) => `<option value="${e(packet.id)}" ${packet.id === selected ? "selected" : ""}>${e(packet.label)}</option>`).join("")}`;
  const sources = packetSources(patient, ui.sourcePacketId);
  const source = sources.find((entry) => entry.id === ui.sourceId);
  const openCount = items.filter((item) => reviewItemState(patient, item, packetId).needsAttention).length;
  const visibleItems = ui.filter === "attention" ? items.filter((item) => reviewItemState(patient, item, packetId).needsAttention) : items;
  const comparisons = compareEncounterPackets(patient, ui.comparePacketId, packetId);
  const differentCount = comparisons.filter((row) => row.state !== "same").length;
  const compareLabel = {
    same: "Same text",
    different: "Different text",
    only_before: "Only in comparison packet",
    only_after: "Only in selected packet",
    multiple: "Multiple sources — compare individually"
  };
  const compareRow = (row) => {
    const diff = row.before.length === 1 && row.after.length === 1 ? compareSourceLines(row.before[0].text, row.after[0].text) : null;
    const columns = [
      [ui.comparePacketId, row.before, diff?.before],
      [packetId, row.after, diff?.after]
    ]
      .map(
        ([id, entries, lines]) =>
          `<section><h3>${e(packetName(id))}</h3>${entries.length ? entries.map((entry, index) => `<pre>${lines ? lines.map((line) => (line.changed ? `<mark>${e(line.text)}</mark>` : e(line.text))).join("") : `${entries.length > 1 ? `Source ${index + 1}\n` : ""}${e(entry.text)}`}</pre>`).join("") : '<p class="muted">Not supplied in this packet.</p>'}</section>`
      )
      .join("");
    return `<details class="encounter-compare-row"><summary>${e(row.label)} <span class="muted">${compareLabel[row.state]}</span></summary><div class="encounter-compare-columns">${columns}</div></details>`;
  };
  return `<details class="encounter-review" data-encounter-review ${ui.open ? "open" : ""}>
    <summary>Visit checklist <span class="muted">${items.length ? `${openCount} to check · ${items.length} saved` : "Reminders to check during this encounter"}</span></summary>
    <div class="encounter-review-body">
      <p>Keep chart reminders here, such as “Was the repeat test done?” or “Is the patient still taking this medication?”</p>
      <p class="muted">Record answers for <strong>${e(packetName(packetId))}</strong>. This checklist does not insert text into your draft; use the draft’s Pull buttons to copy note sections.</p>
      <div class="button-row encounter-review-tabs" role="group" aria-label="Encounter review tools">
        ${[
          ["items", "Checklist"],
          ["sources", "Add from chart"],
          ["compare", "Compare saved notes"]
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="button--quiet" data-action="encounter-tab" data-tab="${id}" aria-pressed="${ui.tab === id}">${label}</button>`
          )
          .join("")}
        <button type="button" class="button--secondary" data-action="encounter-copy" ${!items.length ? "disabled" : ""}>Copy checklist</button>
      </div>
      <p class="encounter-feedback" role="status">${e(ui.message || "")}</p>
      ${
        ui.tab === "items"
          ? `<div class="encounter-items">
        ${items.length ? `<label class="encounter-filter">Show<select data-encounter-filter><option value="all" ${ui.filter !== "attention" ? "selected" : ""}>All reminders</option><option value="attention" ${ui.filter === "attention" ? "selected" : ""}>Still to check</option></select></label>` : ""}
        ${
          !items.length
            ? `<p>Start with <strong>Add from chart</strong>. Highlight one action or fact you want to check, then choose Check a prior plan, Clarify with patient, or Confirm history.</p>`
            : !visibleItems.length
              ? "<p>Nothing left to check here. Choose All reminders to see recorded answers.</p>"
              : visibleItems
                  .map((item) => {
                    const state = reviewItemState(patient, item, packetId);
                    const valid = state.valid;
                    return `<article class="encounter-item" data-review-item="${e(item.id)}">
            <div class="encounter-item-heading"><strong>${itemQuestions[item.kind]}</strong><button class="button--quiet" type="button" data-action="encounter-remove" data-item-id="${e(item.id)}">Remove</button></div>
            <blockquote aria-label="Selected chart reminder">${e(item.source.quote)}</blockquote>
            <button type="button" class="button--quiet encounter-source-link" data-action="encounter-source" data-item-id="${e(item.id)}">${e(packetName(item.source.packetId))} · ${e(state.source.source?.label || "Source unavailable")} · View source</button>
            ${!valid ? `<p class="encounter-warning">${e(!state.source.valid ? state.source.reason : state.evidence?.reason)}. This item is excluded from the copied brief until reviewed. Remove and reselect a changed source.</p>` : ""}
            <label>Your answer for ${e(packetName(packetId))}<select data-encounter-status="${e(item.id)}" ${!state.source.valid || ui.saving ? "disabled" : ""}>
              ${Object.entries(REVIEW_STATUSES[item.kind])
                .map(([id, label]) => `<option value="${id}" ${id === state.status ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select></label>
            ${state.current ? `<p class="muted">Saved for ${e(packetName(packetId))}.</p>` : `<p class="muted">Choose an answer after checking.${state.prior ? ` Previously ${e(REVIEW_STATUSES[item.kind][state.prior.status]).toLowerCase()} in ${e(packetName(state.prior.packetId))}; check again for this encounter.` : ""}</p>`}
            <details class="encounter-item-details"><summary>Evidence &amp; history (optional)</summary>
            ${state.current?.evidence ? `<details><summary>Supporting passage</summary><blockquote>${e(state.current.evidence.quote)}</blockquote><button type="button" class="button--quiet" data-action="encounter-evidence-source" data-item-id="${e(item.id)}">${e(packetName(state.current.evidence.packetId))} · View source</button></details>` : ""}
            ${state.previouslyClosed ? `<p class="muted">Previously closed; hidden from Still to check. Choose Pending to reopen this reminder.</p>` : ""}
            <button type="button" class="button--quiet" data-action="encounter-choose-evidence" data-item-id="${e(item.id)}" ${!state.source.valid ? "disabled" : ""}>${state.current?.evidence ? "Replace linked result or note" : "Link a chart result or note"}</button>
            ${
              item.reviews.length
                ? `<details class="encounter-history"><summary>Previous answers (${item.reviews.length})</summary><ol>${[...item.reviews]
                    .reverse()
                    .map(
                      (review) =>
                        `<li>${e(packetName(review.packetId))}: ${e(REVIEW_STATUSES[item.kind][review.status])}${review.evidence ? " · supporting passage recorded" : ""}</li>`
                    )
                    .join("")}</ol></details>`
                : ""
            }
            </details>
          </article>`;
                  })
                  .join("")
        }
      </div>`
          : ""
      }
      ${
        ui.tab === "sources"
          ? `<div class="encounter-source-browser">
        <div class="encounter-source-controls"><label>Chart from<select data-encounter-source-packet>${optionList(ui.sourcePacketId)}</select></label>
          <label>Note or result<select data-encounter-source-id>${sources.length ? sources.map((entry) => `<option value="${e(entry.id)}" ${entry.id === ui.sourceId ? "selected" : ""}>${e(entry.label)}</option>`).join("") : '<option value="">No saved sources</option>'}</select></label></div>
        ${
          source
            ? `<label>Highlight one action or fact in ${e(source.label)}<textarea data-encounter-source-text readonly rows="9" spellcheck="false">${e(source.text)}</textarea></label>
          ${source.warnings.length || source.skipped ? '<p class="encounter-warning">Finish privacy review in the source workspace before tracking this source.</p>' : ""}
          <p class="muted">Select only the reminder you want to check, rather than a whole plan. Your selection is saved with a link back to these exact words.</p>
          ${
            planPassages(source).length && !source.warnings.length
              ? `<details class="encounter-plan-passages"><summary>Or choose a line from the plan</summary>${planPassages(source)
                  .map(
                    (passage) =>
                      `<div><span>${e(passage.text)}</span><button type="button" class="button--quiet" data-action="encounter-track-line" data-start="${passage.start}" data-end="${passage.end}" ${ui.saving ? "disabled" : ""}>Check this plan</button></div>`
                  )
                  .join("")}</details>`
              : ""
          }
          <div class="button-row">${Object.entries(REVIEW_KINDS)
            .map(
              ([kind]) =>
                `<button type="button" class="button--secondary" data-action="encounter-add" data-kind="${kind}" ${ui.saving || source.warnings.length || source.skipped ? "disabled" : ""}>${addLabels[kind]}</button>`
            )
            .join("")}
          ${ui.evidenceItemId ? `<button type="button" data-action="encounter-attach" data-item-id="${e(ui.evidenceItemId)}" ${ui.saving || source.warnings.length || source.skipped ? "disabled" : ""}>Attach selected passage</button><button type="button" class="button--quiet" data-action="encounter-cancel-evidence">Cancel attachment</button>` : ""}</div>`
            : '<p class="muted">Save a note or chart source in this packet first. Unsaved imports are never used here.</p>'
        }
      </div>`
          : ""
      }
      ${
        ui.tab === "compare"
          ? `<div class="encounter-comparison"><label>Compare selected packet with<select data-encounter-compare>${optionList(ui.comparePacketId, true)}</select></label>
        <p class="muted">Exact text comparison of saved sources. Different text does not establish a clinical change; absent text does not establish resolution.</p>
        ${ui.comparePacketId === packetId ? "<p>Choose a different packet.</p>" : comparisons.length ? `<p>${differentCount} source group${differentCount === 1 ? "" : "s"} differ · ${comparisons.length - differentCount} unchanged. Highlighted lines differ.</p>${comparisons.map(compareRow).join("")}` : "<p>Choose a comparison packet. Sources are grouped only by their saved section or matching source type and label.</p>"}
      </div>`
          : ""
      }
    </div>
  </details>`;
}
