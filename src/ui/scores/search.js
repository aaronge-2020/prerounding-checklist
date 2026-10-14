// Pure search for the Calculators home list. No DOM, no storage, no
// network — safe to run in plain node. Mirrors the Cheat Sheets search
// treatment (src/ui/cheat-sheets/search.js): the controller owns the
// query, typing filters the list live, and only the results region is
// re-rendered so the search input keeps focus.
//
// Expected definition shape (src/clinical-scores/, src/ai-models/):
//   { id, title, subtitle, kind }

export function normalizeScoreQuery(query) {
  return String(query ?? "").trim().toLowerCase();
}

function definitionMatches(definition, normalizedQuery) {
  if (!normalizedQuery) return true;
  const title = String(definition?.title ?? "").toLowerCase();
  const subtitle = String(definition?.subtitle ?? "").toLowerCase();
  const id = String(definition?.id ?? "").toLowerCase();
  return title.includes(normalizedQuery) || subtitle.includes(normalizedQuery) || id.includes(normalizedQuery);
}

export function filterScoreDefinitions(definitions, query) {
  const normalized = normalizeScoreQuery(query);
  return (definitions || []).filter((definition) => definitionMatches(definition, normalized));
}

// The two browser-local LLM entries are literal cards on the home list,
// not score definitions. They carry the same title/text the cards show
// so the same query filters them too. Ids match the data-score-open
// values the controller routes on.
export const LOCAL_LLM_CARDS = Object.freeze([
  Object.freeze({
    id: "__local_llm__",
    title: "Qwen chat (browser-local)",
    heading: "Qwen chat (browser-local)",
    text: "Chat directly with a Qwen model running in this browser via WebLLM. Download a model, then test its capabilities — no data leaves the device.",
    ariaLabel: "Open local LLM chat"
  }),
  Object.freeze({
    id: "__local_llm_parser__",
    title: "Note parser (local LLM)",
    heading: "Note parser (local LLM)",
    text: "Parse pasted primary-team notes with the local model instead of the deterministic parser. Enable it from the Local AI tab.",
    ariaLabel: "Open local LLM note parser"
  })
]);

export function filterLocalLlmCards(query) {
  const normalized = normalizeScoreQuery(query);
  if (!normalized) return [...LOCAL_LLM_CARDS];
  return LOCAL_LLM_CARDS.filter((card) =>
    card.title.toLowerCase().includes(normalized) || card.text.toLowerCase().includes(normalized));
}
