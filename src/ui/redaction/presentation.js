import { sectionWarningSummary } from "../../patient-context/sections.js?v=20260711-functional-remediation-19";

export function redactionPosition(text, redaction) {
  const source = String(text || "");
  const placeholder = String(redaction?.placeholder || "");
  if (!placeholder) return -1;
  let cursor = 0;
  for (let occurrence = 0; occurrence <= Number(redaction?.occurrence || 0); occurrence += 1) {
    const position = source.indexOf(placeholder, cursor);
    if (position < 0) return -1;
    if (occurrence === Number(redaction?.occurrence || 0)) return position;
    cursor = position + placeholder.length;
  }
  return -1;
}

export function warningDescription(warning) {
  if (typeof warning === "string") return warning;
  if (!warning || typeof warning !== "object") return "Potential residual PHI";
  const type = String(warning.type || "Potential residual PHI");
  const snippet = String(warning.snippet || "").trim();
  return snippet ? `${type}: ${snippet}` : type;
}

export function warningSnippet(warning) {
  if (!warning || typeof warning !== "object") return "";
  return String(warning.snippet || "").trim();
}

// This module has no app-state or DOM dependency. It accepts prepared reviews
// and returns markup only, keeping the sensitive review interactions at the UI
// edge that owns the active-tab session.
export function createRedactionPresentation({ escapeHtml, icon }) {
  function nextReviewSection(sections = [], sectionId, reviewFor) {
    const currentIndex = sections.findIndex((section) => section.id === sectionId);
    return currentIndex < 0 ? null : sections.slice(currentIndex + 1).find((section) => reviewFor(section.id)) || null;
  }

  function renderRedactionDocument(text, review, { id = "", scope = "", sectionId = "", action = "inspect-redaction", label = "De-identified text review" } = {}) {
    const output = String(text || "");
    const attributes = [
      scope ? `data-scope="${escapeHtml(scope)}"` : "",
      sectionId ? `data-section-id="${escapeHtml(sectionId)}"` : ""
    ].filter(Boolean).join(" ");
    const resolved = (review?.redactions || [])
      .map((redaction, index) => ({ redaction, index, position: redactionPosition(output, redaction) }))
      .filter(({ redaction, position }) => redaction.state !== "restored" && position >= 0)
      .sort((left, right) => left.position - right.position || left.index - right.index);

    let cursor = 0;
    let markup = "";
    for (const { redaction, index, position } of resolved) {
      if (position < cursor) continue;
      const before = output.slice(cursor, position);
      if (before) {
        markup += `<span class="redaction-document-text" data-output-start="${cursor}" data-output-end="${position}">${escapeHtml(before)}</span>`;
      }
      const replacementEnd = position + String(redaction.placeholder || "").length;
      const inspected = review?.inspectedRedactionIndex === index ? "is-inspected" : "";
      if (redaction.state === "confirmed") {
        markup += `<button type="button" class="redaction-change redaction-change--confirmed ${inspected}" data-action="${escapeHtml(action)}" ${attributes} data-redaction-index="${index}" title="Accepted redaction. Click to review or undo it." aria-label="Review accepted redaction ${escapeHtml(redaction.placeholder)}"><mark>${escapeHtml(redaction.placeholder)}</mark></button>`;
      } else {
        markup += `<button type="button" class="redaction-change ${inspected}" data-action="${escapeHtml(action)}" ${attributes} data-redaction-index="${index}" data-original="${escapeHtml(redaction.original)}" title="Original in this active tab: ${escapeHtml(redaction.original)}" aria-label="Review replacement ${escapeHtml(redaction.placeholder)}"><del>${escapeHtml(redaction.original)}</del><span class="redaction-change-arrow" aria-hidden="true">→</span><ins>${escapeHtml(redaction.placeholder)}</ins></button>`;
      }
      cursor = replacementEnd;
    }
    const remainder = output.slice(cursor);
    if (remainder) {
      markup += `<span class="redaction-document-text" data-output-start="${cursor}" data-output-end="${output.length}">${escapeHtml(remainder)}</span>`;
    }
    if (!markup) markup = `<span class="redaction-document-text" data-output-start="0" data-output-end="${output.length}">${escapeHtml(output || "No de-identified text yet.")}</span>`;
    return `<div${id ? ` id="${escapeHtml(id)}"` : ""} class="redaction-document" data-redaction-document role="textbox" aria-readonly="true" aria-multiline="true" tabindex="0" aria-label="${escapeHtml(label)}">${markup}</div>`;
  }

  function renderSectionReview({ section, scope, review, nextSectionLabel = "" }) {
    if (!review) return "";
    const inspected = review.redactions[review.inspectedRedactionIndex] || null;
    const inspectedIsConfirmed = inspected?.state === "confirmed";
    const pending = review.redactions.filter((redaction) => redaction.state === "pending").length;
    const hasNextSection = Boolean(nextSectionLabel);
    return `
      <div class="redaction-review" data-redaction-review data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">
        <div class="redaction-review-heading">
          <div>
            <strong>${pending ? `${pending} change${pending === 1 ? "" : "s"} to review` : hasNextSection ? "Field complete" : "Review complete"}</strong>
            <span class="muted">${pending ? "Click a crossed-out value in the document below. The original stays only in this tab." : hasNextSection ? "There are no more redactions to decide in this field." : "Click a crossed-out value in the document below. The original stays only in this tab."}</span>
          </div>
          ${pending ? `<button class="button--quiet" type="button" data-action="confirm-all-section-redactions" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Confirm rest (${pending})</button><button class="button--quiet" type="button" data-action="reject-all-section-redactions" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Reject rest (${pending})</button>` : ""}
        </div>
        ${inspected ? `
          <div class="redaction-inspector redaction-inline-actions">
            <div>
              <strong>${inspectedIsConfirmed ? "Accepted redaction" : `Review ${escapeHtml(inspected.placeholder)}`}</strong>
              <span>${inspectedIsConfirmed ? "The document shows only the safe replacement. Undo brings back the original in this tab." : "Choose whether to keep the replacement or restore the original in this tab."}</span>
            </div>
            <div class="button-row">
              ${inspectedIsConfirmed ? "" : `<button class="button--secondary" type="button" data-action="keep-reviewed-redaction" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Accept redaction</button>`}
              <button class="button--quiet" type="button" data-action="allow-reviewed-non-phi" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-redaction-index="${review.inspectedRedactionIndex}">${inspectedIsConfirmed ? "Undo redaction" : "Reject — restore original"}</button>
            </div>
            <small>${inspectedIsConfirmed ? "Undo only if this value isn't identifying — it will be restored in the de-identified text for the next save." : "Reject only if this value isn't identifying — the original will be restored in the de-identified text for the next save."}</small>
          </div>` : ""}
        ${!pending && hasNextSection ? `
          <div class="review-next-step" data-review-next-step>
            <div>
              <strong>Next: review ${escapeHtml(nextSectionLabel)}</strong>
              <span class="muted">This field is complete. Continue to the next saved field.</span>
            </div>
            <button class="button--secondary" type="button" data-action="continue-section-review" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">Continue to next field</button>
          </div>` : ""}
      </div>
    `;
  }

  function renderSectionSurface({ section, scope, review, editing, draftText, sections = [], reviewFor = () => null }) {
    const documentId = `sectionRedactionDocument-${section.id}`;
    const nextSectionLabel = nextReviewSection(sections, section.id, reviewFor)?.label || "";
    return `
      <div class="section-review-surface" data-section-review-surface>
        ${review && !editing
          ? `<input class="section-text" type="hidden" value="${escapeHtml(draftText)}">${renderRedactionDocument(draftText, review, { id: documentId, scope, sectionId: section.id, label: `${section.label} redaction review` })}`
          : `<textarea class="section-text" rows="5" spellcheck="false">${escapeHtml(draftText)}</textarea>`}
        <div class="section-review-tools">
          ${review ? `<button class="button--quiet" type="button" data-action="${editing ? "resume-section-review" : "edit-section-text"}" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">${editing ? "Return to redaction review" : "Edit field text"}</button>` : ""}
          <button class="button--quiet" type="button" data-action="manual-redact-selection" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}">${icon("wand")} Redact selected text</button>
          <span class="muted">${review && !editing ? "Review changes here, or edit the text without leaving Hospital Stay." : "Edit this de-identified field, then save to re-run the local review."}</span>
        </div>
        ${review && !editing ? renderSectionReview({ section: { ...section, deidentifiedText: draftText }, scope, review, nextSectionLabel }) : ""}
      </div>
    `;
  }

  function renderSectionEditor({ section, scope, editing, pendingFocus, review, draftText, sections = [], reviewFor = () => null }) {
    const characterCount = draftText?.length || 0;
    const draftMarker = draftText !== section.deidentifiedText ? " · draft" : "";
    const nextSectionLabel = nextReviewSection(sections, section.id, reviewFor)?.label || "";
    const isInitialReviewTarget = pendingFocus?.scope === scope && pendingFocus.sectionId === section.id;
    const isExpanded = editing || isInitialReviewTarget;
    return `
      <article class="section-editor ${isExpanded ? "is-expanded" : ""}" data-section-id="${escapeHtml(section.id)}" data-section-scope="${escapeHtml(scope)}" data-created-at="${escapeHtml(section.createdAt)}">
        <div class="section-toolbar">
          <span class="section-grip section-drag-handle" draggable="true" title="Drag to reorder sections" aria-label="Drag to reorder sections" role="img">${icon("grip")}</span>
          <input class="section-label" value="${escapeHtml(section.label)}" aria-label="Section label">
          <span class="section-meta">${characterCount ? `${characterCount.toLocaleString()} chars${draftMarker}` : "Empty"}</span>
          <div class="button-row">
            <button class="icon-button" type="button" data-action="toggle-section-editor" title="Edit section" aria-label="Edit section" aria-expanded="false">${icon("edit")}</button>
            <button class="icon-button" type="button" data-action="move-section-up" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move up">↑</button>
            <button class="icon-button" type="button" data-action="move-section-down" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Move down">↓</button>
            <button class="icon-button" type="button" data-action="remove-section" data-scope="${scope}" data-section-id="${escapeHtml(section.id)}" title="Remove">${icon("trash")}</button>
          </div>
        </div>
        ${renderSectionSurface({ section, scope, review, editing, draftText, nextSectionLabel })}
      </article>
    `;
  }

  function renderWarnings({ sections, scope, reviewFor }) {
    const reviewedSections = (sections || [])
      .map((section) => ({ section, review: reviewFor(scope, section.id) }))
      .filter(({ review }) => review);
    const sessionWarnings = (sections || []).flatMap((section) => {
      const review = reviewFor(scope, section.id);
      if (!review) return [];
      return review.warnings
        .map((warning, warningIndex) => ({ section, warning, warningIndex, review }))
        .filter(({ warningIndex, review: currentReview }) => !currentReview.dismissedWarningIndexes.has(warningIndex));
    });
    if (sessionWarnings.length) {
      return `
        <div id="residualWarnings-${escapeHtml(scope)}" class="warning-box residual-review">
          <strong>Residual PHI review needed</strong>
          <span class="muted">These details are only available during this review. Decide whether to redact or dismiss each item before leaving Hospital Stay.</span>
          <div class="residual-warning-list">
            ${sessionWarnings.map(({ section, warning, warningIndex }) => `
              <div class="residual-warning-entry">
                <button type="button" class="residual-warning" data-action="review-section-warning" data-session-warning="true" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}" title="Open and select this flagged text">
                  <span>${escapeHtml(section.label)}</span>
                  <strong>${escapeHtml(warningDescription(warning))}</strong>
                </button>
                <div class="button-row">
                  <button class="button--quiet" type="button" data-action="redact-section-warning" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}">Redact</button>
                  <button class="button--quiet" type="button" data-action="dismiss-section-warning" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(section.id)}" data-warning-index="${warningIndex}">Not PHI</button>
                </div>
              </div>`).join("")}
          </div>
        </div>
      `;
    }
    if (reviewedSections.length) return "";
    const warnings = sectionWarningSummary(sections);
    if (!warnings.length) return `<div id="residualWarnings-${escapeHtml(scope)}" class="notice">No residual PHI warnings from the last save.</div>`;
    const warningSections = [...new Map(warnings.map((warning) => [warning.sectionId, warning.sectionLabel])).entries()];
    return `
      <div id="residualWarnings-${escapeHtml(scope)}" class="warning-box residual-review">
        <strong>Residual PHI review needed</strong>
        <div class="residual-warning-list">
          ${warnings.map((warning) => `
            <button type="button" class="residual-warning" data-action="review-section-warning" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(warning.sectionId)}" data-warning-index="${warning.warningIndex}" title="Open this field and select the flagged text">
              <span>${escapeHtml(warning.sectionLabel)}</span>
              <strong>${escapeHtml(warningDescription(warning.warning))}</strong>
            </button>
          `).join("")}
        </div>
        <div class="button-row residual-warning-bulk-actions">
          ${warningSections.map(([sectionId, sectionLabel]) => `<button class="button--quiet" type="button" data-action="dismiss-all-section-warnings" data-scope="${escapeHtml(scope)}" data-section-id="${escapeHtml(sectionId)}">Dismiss all warnings for ${escapeHtml(sectionLabel)} as not PHI</button>`).join("")}
        </div>
        <span class="muted">Detailed warning text isn’t kept after this tab’s review session.</span>
      </div>
    `;
  }

  return Object.freeze({ renderRedactionDocument, renderSectionEditor, renderSectionSurface, renderWarnings });
}
