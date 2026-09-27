// Dynamic context-window monitoring and prompt assembly for Local AI chat.
//
// The on-device models have small context windows (4096 tokens; see
// contextWindow in models.js). Every send ships the system prompt
// (guidelines + patient context) plus the full conversation history, so
// after a few exchanges the prompt silently exceeds the window and the
// engine fails with "Prompt tokens exceed context window size".
//
// Instead of guessing, this module MEASURES the prompt before each send
// and compacts it to fit inside the model's real window:
//
//   budget = contextWindow - maxTokens - TOKEN_SAFETY_MARGIN
//
// Compaction order (cheapest information loss first):
//   1. Drop the oldest history messages until the prompt fits. The latest
//      message — the one being answered — is always kept.
//   2. Only if the system content alone exceeds the budget, truncate it.
//
// Token estimation is a documented heuristic, not a tokenizer call:
// English text averages ~3.6-4 chars per token for these models, and the
// estimate is deliberately conservative (3.6) and paired with a 256-token
// safety margin so we stay under the real limit. Pure module: no DOM,
// no storage, no network.

export const TOKEN_SAFETY_MARGIN = 256;

// Conservative chars-per-token for Qwen chat text (English clinical prose
// with numbers/abbreviations tokenizes a little denser than plain prose).
export const CHARS_PER_TOKEN = 3.6;

export function estimateTokens(text) {
  const chars = String(text ?? "").length;
  if (chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function messageTokens(message) {
  return estimateTokens(message?.content ?? message?.text ?? "");
}

function normalizeMessage(message) {
  const role = message?.role === "user" ? "user" : "assistant";
  return { role, content: String(message?.content ?? message?.text ?? "") };
}

// Assemble the final engine message list inside the model's context
// window. `messages` is the conversation history in chronological order
// (the last entry is the message being answered). Returns the trimmed
// list with the system message first, plus usage stats for the UI's
// context meter.
export function buildChatMessages({
  systemContent = "",
  messages = [],
  contextWindow = 4096,
  maxTokens = 1024
} = {}) {
  const windowSize = Math.max(1024, Math.floor(Number(contextWindow) || 4096));
  const reserve = Math.max(64, Math.floor(Number(maxTokens) || 1024)) + TOKEN_SAFETY_MARGIN;
  const budget = Math.max(512, windowSize - reserve);

  let system = String(systemContent ?? "");
  let systemTruncated = false;
  if (estimateTokens(system) > budget) {
    const keepChars = Math.max(200, Math.floor(budget * CHARS_PER_TOKEN));
    system = `${system.slice(0, keepChars).trimEnd()}… [truncated to fit the model's context window]`;
    systemTruncated = true;
  }

  // Newest-first so budget pressure drops the oldest exchanges. The
  // latest message is always kept — it is the one being answered.
  const normalized = messages.map(normalizeMessage);
  const kept = [];
  let droppedMessages = 0;
  let used = estimateTokens(system);
  for (let i = normalized.length - 1; i >= 0; i--) {
    const message = normalized[i];
    const isLatest = i === normalized.length - 1;
    if (!isLatest && used + messageTokens(message) > budget) {
      droppedMessages++;
      continue;
    }
    kept.push(message);
    used += messageTokens(message);
  }
  kept.reverse();

  return {
    messages: [{ role: "system", content: system }, ...kept],
    promptTokens: used,
    contextWindow: windowSize,
    budget,
    droppedMessages,
    systemTruncated
  };
}
