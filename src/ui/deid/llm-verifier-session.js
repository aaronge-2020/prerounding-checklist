// Optional local LLM verification stage for Quick De-ID.
// Runs after the deterministic first pass: the selected local model rereads
// the note and flags PHI spans the first pass missed. Novel spans are merged
// into the result up front as pending redactions, so the existing
// confirm/reject/copy review flow works unchanged. Everything fails soft:
// any problem keeps the first pass and returns an honest status note.

import {
  localLlmModelByKey,
  readLocalLlmSettings,
  sharedLocalLlmClient
} from "../../local-llm/client.js?v=20260928-local-llm-v1";
import {
  dedupeVerifierEntities,
  runLlmVerifier
} from "../../local-llm/verifier.js?v=20261001-local-llm-v5";
import { redactFromEntities } from "../../vault/deid.js?v=20260929-deid-r2";

export function selectedLlmVerifierModel() {
  const key = readLocalLlmSettings().selectedModelKey || "";
  if (!key) return null;
  return { key, label: localLlmModelByKey(key)?.label || "Local model" };
}

// Mutates result in place when the verifier finds novel spans (entities are
// appended and the redacted text is rebuilt with them applied). Returns a
// status note: empty when verification ran cleanly with nothing new, honest
// about what happened otherwise.
export async function runQuickDeidLlmVerification({ sourceText, result, currentDate, onStatus }) {
  const selected = selectedLlmVerifierModel();
  if (!selected) {
    return "Local AI verification skipped: no local model selected. Choose one in the Local AI view first. First pass results kept.";
  }
  try {
    const client = sharedLocalLlmClient();
    await client.ensureReady(selected.key, {
      onProgress: ({ text } = {}) => {
        if (text) onStatus?.(text);
      }
    });
    onStatus?.(`Verifying with ${selected.label}...`);
    const { entities, stats } = await runLlmVerifier(client.chat.bind(client), sourceText);
    if (stats.error || stats.parseFailed) {
      const reason = stats.error || "the model response could not be parsed";
      return `Local AI verification produced no usable output (${reason}). First pass results kept.`;
    }
    const truncatedNote = stats.truncated
      ? " The note was truncated to fit the model context, so only the first part was verified."
      : "";
    const novel = dedupeVerifierEntities(result.entities, entities);
    if (!novel.length) {
      return `Verified with ${selected.label}: no additional spans flagged.${truncatedNote}`;
    }
    result.entities = [...(result.entities || []), ...novel];
    result.text = redactFromEntities(sourceText, result.entities, currentDate || null, {
      relativeDate: currentDate || null
    });
    const spanWord = novel.length === 1 ? "span" : "spans";
    return `Verified with ${selected.label}: ${novel.length} additional ${spanWord} flagged for review.${truncatedNote}`;
  } catch (error) {
    return `Local AI verification unavailable (${error?.message || "unknown error"}). First pass results kept.`;
  }
}
