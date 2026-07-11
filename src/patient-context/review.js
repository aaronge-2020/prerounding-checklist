function normalizedLabel(value) {
  return String(value || "PHI").replace(/\s+/g, " ").trim() || "PHI";
}

function reviewPlaceholder(entity, label) {
  return String(entity?.renderedPlaceholder || entity?.placeholder || `[${label}]`);
}

function reviewEntitySpecificity(entity, output = "") {
  const label = normalizedLabel(entity?.label).toUpperCase();
  const placeholder = reviewPlaceholder(entity, label).toUpperCase();
  const source = String(entity?.source || "").toLowerCase();
  let score = 0;
  // Prefer the most specific presentation when multiple detectors identify
  // precisely the same source characters. This changes only the active-tab
  // review queue; the model result and stored de-identified output are left
  // untouched.
  if (label.includes("PATIENT NAME") || placeholder.includes("PATIENT NAME")) score += 40;
  else if (label.includes("FULL NAME") || placeholder.includes("FULL NAME")) score += 30;
  else if (label.includes("NAME") || placeholder.includes("NAME")) score += 20;
  if (label !== "PHI") score += 5;
  if (source.includes("manual")) score += 3;
  if (entity?.renderedPlaceholder) score += 1;
  // A result can occasionally carry duplicate detector metadata while its
  // rendered text already has just one of their possible placeholders. Keep
  // the representation that actually appears in the safe output.
  if (placeholder && String(output || "").toUpperCase().includes(placeholder)) score += 100;
  return score;
}

function uniqueReviewEntities(source, entities = [], output = "") {
  const bySourceRange = new Map();
  (entities || []).forEach((entity, sourceIndex) => {
    const start = Number(entity?.start);
    const end = Number(entity?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const original = source.slice(start, end);
    if (!original) return;
    const candidate = {
      sourceIndex,
      start,
      end,
      label: normalizedLabel(entity.label),
      source: String(entity.source || "local de-identification"),
      original,
      placeholder: reviewPlaceholder(entity, normalizedLabel(entity.label))
    };
    const key = `${start}:${end}`;
    const existing = bySourceRange.get(key);
    if (!existing || reviewEntitySpecificity(entity, output) > reviewEntitySpecificity(entities[existing.sourceIndex], output)) {
      bySourceRange.set(key, candidate);
    }
  });
  const candidates = [...bySourceRange.values()]
    .sort((left, right) => left.start - right.start || left.end - right.end || left.sourceIndex - right.sourceIndex);
  // Several model heads can report nested spans for one source value (for
  // example `Ortiz`, `Ms. Ortiz`, and the same token-classifier span). A human
  // should review that once, not once per overlapping detector result. Keep
  // distinct occurrences at distinct character ranges.
  return candidates.reduce((selected, candidate) => {
    const overlapIndex = selected.findIndex((entry) => candidate.start < entry.end && candidate.end > entry.start);
    if (overlapIndex < 0) return [...selected, candidate];
    const existing = selected[overlapIndex];
    const existingEntity = entities[existing.sourceIndex];
    const candidateEntity = entities[candidate.sourceIndex];
    if (reviewEntitySpecificity(candidateEntity, output) > reviewEntitySpecificity(existingEntity, output)) {
      const next = [...selected];
      next[overlapIndex] = candidate;
      return next.sort((left, right) => left.start - right.start || left.end - right.end || left.sourceIndex - right.sourceIndex);
    }
    return selected;
  }, []);
}

export function sanitizeResidualWarningMetadata(warnings = []) {
  return (warnings || []).map((warning) => {
    if (!warning || typeof warning !== "object") {
      return {
        severity: "review",
        type: "Potential residual PHI",
        reason: "Reprocess the source text in this tab to inspect the flagged value."
      };
    }
    return {
      severity: String(warning.severity || "review"),
      type: String(warning.type || "Potential residual PHI"),
      reason: String(warning.reason || "Reprocess the source text in this tab to inspect the flagged value.")
    };
  });
}

export function createEphemeralRedactionReview(rawText, result = {}) {
  const source = String(rawText || "");
  const redactions = uniqueReviewEntities(source, result.entities, result.text)
    .map((redaction, index, entries) => {
      // Dates can be normalized into relative text (for example, "2 days ago
      // at 05:30") rather than a bracket token. Preserve the exact rendered
      // replacement so the active-tab review can put the source and its
      // replacement next to each other in one annotated document.
      const placeholder = redaction.placeholder;
      const occurrence = entries
        .slice(0, index)
        .filter((entry) => entry.placeholder === placeholder)
        .length;
      return {
        ...redaction,
        id: `redaction_${index}`,
        placeholder,
        occurrence,
        state: "pending"
      };
    });

  const review = {
    source,
    redactions,
    warnings: Array.isArray(result.residualWarnings) ? result.residualWarnings : [],
    dismissedWarningIndexes: new Set(),
    inspectedRedactionIndex: null,
    activeWarningIndex: null,
    approvedRedactionIndexes: new Set()
  };
  return synchronizeReviewPlaceholders(review, result.text || "");
}

// Older active-tab reviews may have recorded a generic [DATE] token while the
// final output already contains a relative date such as "2 days ago at 05:30".
// Align untouched source fragments with the de-identified result to recover the
// visible replacement. This stays in memory and makes existing review sessions
// render and center their active change correctly after an app update.
export function synchronizeReviewPlaceholders(review, outputText) {
  if (!review?.source || !Array.isArray(review.redactions)) return review;
  const source = String(review.source || "");
  const output = String(outputText || "");
  const ordered = review.redactions
    .map((redaction, index) => ({ redaction, index }))
    .filter(({ redaction }) => Number.isFinite(redaction?.start) && Number.isFinite(redaction?.end))
    .sort((left, right) => left.redaction.start - right.redaction.start || left.index - right.index);
  let outputCursor = 0;

  ordered.forEach(({ redaction }, orderIndex) => {
    const priorEnd = orderIndex ? ordered[orderIndex - 1].redaction.end : 0;
    const before = source.slice(priorEnd, redaction.start);
    if (before) {
      const beforeIndex = output.indexOf(before, outputCursor);
      if (beforeIndex >= 0) outputCursor = beforeIndex + before.length;
    }

    const next = ordered[orderIndex + 1]?.redaction;
    const boundary = source.slice(redaction.end, next?.start ?? source.length);
    const boundaryIndex = boundary ? output.indexOf(boundary, outputCursor) : -1;
    const replacement = boundaryIndex >= outputCursor
      ? output.slice(outputCursor, boundaryIndex)
      : next ? "" : output.slice(outputCursor);
    const current = String(redaction.placeholder || "");
    const currentPosition = current ? output.indexOf(current, outputCursor) : -1;
    if (replacement && replacement !== redaction.original && (currentPosition < 0 || /^\[DATE\]$/i.test(current))) {
      redaction.placeholder = replacement;
    }
    const resolved = String(redaction.placeholder || "");
    const resolvedPosition = resolved ? output.indexOf(resolved, outputCursor) : -1;
    if (resolvedPosition >= outputCursor) outputCursor = resolvedPosition + resolved.length;
  });

  return review;
}

export function reviewKey(scope, sectionId) {
  return `${String(scope || "context")}:${String(sectionId || "")}`;
}

// The review UI owns the mutable review objects, while this module owns the
// deterministic traversal rules.  Keeping the cursor calculation pure makes
// it possible to advance from one admission field to the next without tying
// ordering to a DOM position or a rendered list of buttons.
export function pendingReviewTargets(sectionEntries = []) {
  return (sectionEntries || []).flatMap((entry, sectionIndex) =>
    (entry?.review?.redactions || [])
      .map((redaction, redactionIndex) => ({
        scope: String(entry?.scope || "context"),
        sectionId: String(entry?.sectionId || ""),
        sectionIndex,
        redactionIndex,
        redaction
      }))
      .filter((target) => target.sectionId && target.redaction?.state === "pending")
  );
}

// Return the next remaining review target in document order.  If a clinician
// manually opens a later item, wrapping makes sure earlier unreviewed fields
// are not silently skipped.
export function nextPendingReviewTarget(targets = [], current = null) {
  const ordered = [...(targets || [])].sort((left, right) => (
    left.sectionIndex - right.sectionIndex || left.redactionIndex - right.redactionIndex
  ));
  if (!ordered.length) return null;
  if (!current) return ordered[0];
  return ordered.find((target) => (
    target.sectionIndex > current.sectionIndex
    || (target.sectionIndex === current.sectionIndex && target.redactionIndex > current.redactionIndex)
  )) || ordered[0];
}
