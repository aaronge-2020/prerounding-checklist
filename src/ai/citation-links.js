// Clickable citations for the ChatGPT side of AI Chat.
//
// The model cites as [Source Name] (see the citation rule in
// src/ai/remote-chat.js). Web search, when on, returns the real source URLs
// as url_citation annotations; openai-client.js surfaces them as
// [{ url, title }]. This module turns every [bracket] citation into a
// clickable markdown link:
//
//   - matched against a web-search source  -> the real source URL
//   - no match                             -> a web search for the exact
//     citation text (honest fallback: it never invents a source URL)
//
// and appends a numbered Sources section listing every annotated source, so
// each claim can be checked against the page behind it.
//
// Pure module: no DOM, no network, no storage. Safe to unit-test.
//
// What is NOT linkified, by design:
//   - [text](url) markdown links (left untouched)
//   - de-identification placeholders like [Hospital Day 3], [DATE], [PERSON]
//   - bare numbers like [1]

const SEARCH_BASE = "https://www.google.com/search?q=";

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

// De-identification placeholders must never become links: the reply may echo
// redacted context (e.g. "on [Hospital Day 3]"), and those brackets are not
// citations.
const PLACEHOLDER_DENY = /^(hospital day|historical|date)\b/i;
const PHI_LABEL_DENY =
  /^(PERSON|PATIENT|PROVIDER|DOCTOR|NURSE|LOCATION|ADDRESS|CITY|STATE|COUNTRY|ZIP|PHONE|FAX|EMAIL|SSN|MRN|ACCOUNT|LICENSE|VEHICLE|DEVICE|BIOMETRIC|HEALTH PLAN|HOSPITAL|FACILITY|ORGANIZATION|NAME|DOB|ID|AGE)\b/;

function isLinkableCitation(label) {
  const text = String(label || "").trim();
  if (text.length < 2 || text.length > 140) return false;
  if (!/[a-z]/i.test(text)) return false; // [1], [10-20] — not a source citation
  if (PLACEHOLDER_DENY.test(text)) return false;
  if (PHI_LABEL_DENY.test(text)) return false;
  return true;
}

const STOP_WORDS = new Set(
  "the a an of and for in on to with no nos ed eds edition vol volume chapter ch pp guideline guidelines practice bulletin bulletins committee opinion opinions report reports statement statements update updated consensus".split(" ")
);

function significantTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

// Best-effort match of a [bracket] citation against the web-search sources:
// at least two significant tokens (or the single token, for short labels
// like [ACOG]) must appear in the source title or URL. First best wins.
export function matchCitationToSource(citationLabel, sources) {
  const wanted = significantTokens(citationLabel);
  if (!wanted.length || !Array.isArray(sources) || !sources.length) return null;
  const need = wanted.length === 1 ? 1 : 2;
  let best = null;
  let bestHits = 0;
  for (const source of sources) {
    if (!source || !isHttpUrl(source.url)) continue;
    const haystack = new Set(significantTokens(`${source.title || ""} ${source.url}`));
    let hits = 0;
    for (const token of wanted) if (haystack.has(token)) hits += 1;
    if (hits >= need && hits > bestHits) {
      best = source;
      bestHits = hits;
    }
  }
  return best;
}

// [citation] but not [text](url): the negative lookahead skips brackets that
// already carry a link target.
const BRACKET_RE = /\[([^\[\]\n]{2,140})\](?!\()/g;

export function linkifyCitations(text, sources) {
  const list = Array.isArray(sources) ? sources : [];
  return String(text || "").replace(BRACKET_RE, (match, inner, offset, full) => {
    const label = String(inner).trim();
    if (!isLinkableCitation(label)) return match;
    // Leave `per [Section]` chart citations alone: the section-citation
    // renderer owns those markers (it sentinelizes them before linkify runs).
    const before = String(full).slice(Math.max(0, offset - 4), offset);
    if (/per $/i.test(before)) return match;
    const source = matchCitationToSource(label, list);
    const url = source
      ? String(source.url).trim()
      : SEARCH_BASE + encodeURIComponent(`"${label}"`);
    return `[${label}](${url})`;
  });
}

// Numbered, deduped Sources section for the annotated web-search sources.
// Rendered through renderChatMarkdown, so each entry is a clickable link.
export function buildSourcesSection(sources) {
  const seen = new Set();
  const lines = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = String(source?.url || "").trim();
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    const title = String(source?.title || url).replace(/[\[\]]/g, "").trim().slice(0, 160) || url;
    lines.push(`${lines.length + 1}. [${title}](${url})`);
  }
  if (!lines.length) return "";
  return `\n\n**Sources**\n\n${lines.join("\n")}`;
}

// Full transform for one assistant reply: linkify its [bracket] citations,
// then append the Sources section. Idempotent per render because callers
// always start from the raw stored text. Error replies pass through.
export function withClickableCitations(text, sources) {
  const raw = String(text || "");
  if (/^\s*Error:/.test(raw)) return raw;
  return linkifyCitations(raw, sources) + buildSourcesSection(sources);
}
