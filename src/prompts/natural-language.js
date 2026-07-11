export function naturalLanguagePrompt(value) {
  return String(value || "")
    .replace(/[\[\]{}<>()]/g, "")
    .replace(/`/g, "")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+])\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/@([a-z][a-z0-9_-]*)/gi, (_, token) => token.replace(/[-_]+/g, " "))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
