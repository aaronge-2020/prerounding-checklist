import { createEphemeralRedactionReview } from "../patient-context/review.js?v=20261012-safety";

// Exact, session-only editing of model-detected spans. No identifier detection
// or clinical-token allowlist lives here; every restoration is a human choice.
export function createDraftPrivacyReview(source, result) {
  const review = createEphemeralRedactionReview(source, result);
  const safeText = String(result.text || "");
  const changes = review.redactions.map(change => ({ ...change }));
  const ordered = changes.slice().sort((a, b) => a.start - b.start);
  let sourceCursor = 0, outputCursor = 0, mapped = true;
  const pieces = [];
  for (const change of ordered) {
    const before = String(source).slice(sourceCursor, change.start);
    if (safeText.slice(outputCursor, outputCursor + before.length) !== before) { mapped = false; break; }
    pieces.push(safeText.slice(outputCursor, outputCursor + before.length)); outputCursor += before.length;
    if (!safeText.startsWith(change.placeholder, outputCursor)) { mapped = false; break; }
    pieces.push(change); outputCursor += change.placeholder.length; sourceCursor = change.end;
  }
  if (mapped && safeText.slice(outputCursor) !== String(source).slice(sourceCursor)) mapped = false;
  if (mapped) pieces.push(safeText.slice(outputCursor));
  return { changes, mapped, safeText, pieces: mapped ? pieces : [], warnings: review.warnings };
}
export function draftPrivacyText(state) {
  return state.mapped ? state.pieces.map(piece => typeof piece === "string" ? piece : piece.state === "restored" ? piece.original : piece.placeholder).join("") : state.safeText;
}
export function decideDraftPrivacyChange(state, index, decision) {
  if (!["confirmed", "restored", "pending"].includes(decision) || !state.changes[index]) throw new Error("Choose an existing privacy change.");
  if (decision === "restored" && !state.mapped) throw new Error("This change could not be mapped exactly. Edit the source and regenerate instead.");
  state.changes[index].state = decision;
  return draftPrivacyText(state);
}
