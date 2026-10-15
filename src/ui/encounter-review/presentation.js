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
    <summary>Prepare &amp; follow-up <span class="muted">${items.length ? `${openCount} need attention · ${items.length} tracked` : "Review sources and track what needs checking"}</span></summary>
    <div class="encounter-review-body">
      <p class="muted">Reviewing <strong>${e(packetName(packetId))}</strong>. Decisions apply to this packet only. Prior chart statements remain historical.</p>
      <div class="button-row encounter-review-tabs" role="group" aria-label="Encounter review tools">
        ${[
          ["items", "Follow-up"],
          ["sources", "Find a source"],
          ["compare", "Compare packets"]
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="button--quiet" data-action="encounter-tab" data-tab="${id}" aria-pressed="${ui.tab === id}">${label}</button>`
          )
          .join("")}
        <button type="button" class="button--secondary" data-action="encounter-copy" ${!items.length ? "disabled" : ""}>Copy review brief</button>
      </div>
      <p class="encounter-feedback" role="status">${e(ui.message || "")}</p>
      ${
        ui.tab === "items"
          ? `<div class="encounter-items">
        ${items.length ? `<label class="encounter-filter">Show items<select data-encounter-filter><option value="all" ${ui.filter !== "attention" ? "selected" : ""}>All tracked items</option><option value="attention" ${ui.filter === "attention" ? "selected" : ""}>Needs attention in this packet</option></select></label>` : ""}
        ${
          !items.length
            ? `<p>No items tracked. Open <strong>Find a source</strong>, select a passage from a saved note or result, then track a follow-up, clarification, or fact to verify.</p>`
            : !visibleItems.length
              ? "<p>No items need attention in this packet. Choose All tracked items to inspect recorded decisions.</p>"
              : visibleItems
                  .map((item) => {
                    const state = reviewItemState(patient, item, packetId);
                    const valid = state.valid;
                    return `<article class="encounter-item" data-review-item="${e(item.id)}">
            <div class="encounter-item-heading"><strong>${REVIEW_KINDS[item.kind]}</strong><button class="button--quiet" type="button" data-action="encounter-remove" data-item-id="${e(item.id)}">Remove</button></div>
            <blockquote>${e(item.source.quote)}</blockquote>
            <button type="button" class="button--quiet encounter-source-link" data-action="encounter-source" data-item-id="${e(item.id)}">${e(packetName(item.source.packetId))} · ${e(state.source.source?.label || "Source unavailable")} · View source</button>
            ${!valid ? `<p class="encounter-warning">${e(!state.source.valid ? state.source.reason : state.evidence?.reason)}. This item is excluded from the copied brief until reviewed. Remove and reselect a changed source.</p>` : ""}
            <label>Status in ${e(packetName(packetId))}<select data-encounter-status="${e(item.id)}" ${!state.source.valid || ui.saving ? "disabled" : ""}>
              ${Object.entries(REVIEW_STATUSES[item.kind])
                .map(([id, label]) => `<option value="${id}" ${id === state.status ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select></label>
            ${state.current ? `<p class="muted">Clinician-recorded in this packet.${state.current.evidence ? " Supporting passage attached." : " No supporting passage attached."}</p>` : `<p class="muted">No decision recorded for this packet.${state.prior ? ` Last recorded in ${e(packetName(state.prior.packetId))}: ${e(REVIEW_STATUSES[item.kind][state.prior.status])}; not carried forward.` : ""}</p>`}
            ${state.current?.evidence ? `<details><summary>Supporting passage</summary><blockquote>${e(state.current.evidence.quote)}</blockquote><button type="button" class="button--quiet" data-action="encounter-evidence-source" data-item-id="${e(item.id)}">${e(packetName(state.current.evidence.packetId))} · View source</button></details>` : ""}
            ${state.previouslyClosed ? `<p class="muted">Previously closed follow-up; excluded from Needs attention. Record Pending to reopen it. No current finding is implied.</p>` : ""}
            <button type="button" class="button--quiet" data-action="encounter-choose-evidence" data-item-id="${e(item.id)}" ${!state.source.valid ? "disabled" : ""}>${state.current?.evidence ? "Replace supporting passage" : "Attach supporting passage"}</button>
            ${
              item.reviews.length
                ? `<details class="encounter-history"><summary>Decision history (${item.reviews.length})</summary><ol>${[...item.reviews]
                    .reverse()
                    .map(
                      (review) =>
                        `<li>${e(packetName(review.packetId))}: ${e(REVIEW_STATUSES[item.kind][review.status])}${review.evidence ? " · supporting passage recorded" : ""}</li>`
                    )
                    .join("")}</ol></details>`
                : ""
            }
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
        <div class="encounter-source-controls"><label>Source packet<select data-encounter-source-packet>${optionList(ui.sourcePacketId)}</select></label>
          <label>Saved source<select data-encounter-source-id>${sources.length ? sources.map((entry) => `<option value="${e(entry.id)}" ${entry.id === ui.sourceId ? "selected" : ""}>${e(entry.label)}</option>`).join("") : '<option value="">No saved sources</option>'}</select></label></div>
        ${
          source
            ? `<label>${e(source.label)} — select an exact passage<textarea data-encounter-source-text readonly rows="9" spellcheck="false">${e(source.text)}</textarea></label>
          ${source.warnings.length || source.skipped ? '<p class="encounter-warning">Finish privacy review in the source workspace before tracking this source.</p>' : ""}
          <p class="muted">Select the relevant words or lines. The full source remains available; the selected passage is quoted exactly.</p>
          ${
            planPassages(source).length && !source.warnings.length
              ? `<details class="encounter-plan-passages"><summary>Track a prior plan passage</summary>${planPassages(source)
                  .map(
                    (passage) =>
                      `<div><span>${e(passage.text)}</span><button type="button" class="button--quiet" data-action="encounter-track-line" data-start="${passage.start}" data-end="${passage.end}" ${ui.saving ? "disabled" : ""}>Track follow-up</button></div>`
                  )
                  .join("")}</details>`
              : ""
          }
          <div class="button-row">${Object.entries(REVIEW_KINDS)
            .map(
              ([kind, label]) =>
                `<button type="button" class="button--secondary" data-action="encounter-add" data-kind="${kind}" ${ui.saving || source.warnings.length || source.skipped ? "disabled" : ""}>${label}</button>`
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
