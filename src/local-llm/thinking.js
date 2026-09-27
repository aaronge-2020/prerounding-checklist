// Pure helpers for Qwen3-style reasoning output. The local models wrap
// their chain-of-thought in <think>...</think> blocks; the chat UI shows
// that reasoning in a collapsed dropdown (hidden by default) and only the
// final answer as the visible message. This module guarantees no raw
// <think> tags ever reach the rendered chat: the split strips every tag,
// including stray closing tags and unclosed trailing blocks (which happen
// while a reply is still streaming).

const THINK_BLOCK_RE = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
const STRAY_CLOSE_RE = /<\/think>/gi;

export function splitThinking(raw) {
  const text = String(raw || "");
  const thoughts = [];
  let cleaned = "";
  let lastIndex = 0;
  THINK_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = THINK_BLOCK_RE.exec(text)) !== null) {
    cleaned += text.slice(lastIndex, match.index);
    thoughts.push(match[1]);
    lastIndex = match.index + match[0].length;
    // A zero-length match would loop forever; advance past it.
    if (match[0].length === 0) THINK_BLOCK_RE.lastIndex += 1;
  }
  cleaned += text.slice(lastIndex);
  // Belt and braces: no raw think tags survive, even unmatched closers.
  cleaned = cleaned.replace(STRAY_CLOSE_RE, "");
  const thinking = thoughts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("\n\n");
  const finalText = cleaned
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { thinking, text: finalText };
}

// Convenience for render paths that only need the visible answer.
export function stripThinking(raw) {
  return splitThinking(raw).text;
}
