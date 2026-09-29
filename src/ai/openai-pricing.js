// OpenAI API pricing for the AI Chat cost tracker.
//
// Rates verified 2026-09-29 against OpenAI's published pricing (per-million
// tokens, standard tier):
//   - GPT-5.6 Sol / Terra / Luna: current OpenAI pricing page — Sol $4.00 in /
//     $20.00 out, Terra $2.00 / $12.00, Luna $0.20 / $1.20 (short context,
//     <=272K input tokens); long-context (>272K) doubles input and multiplies
//     output by 1.5. Cached-input rates: Sol $0.40, Terra $0.20, Luna $0.02.
//   - GPT-5.4 family: $2.50 / $15.00 (full), $0.75 / $4.50 (mini),
//     $0.20 / $1.25 (nano); long-context tier applies to the full model.
//   - web_search tool: $10 per 1,000 calls ($0.01 per call) plus search-content
//     tokens, which arrive inside the normal input-token count.
// Context windows: GPT-5.6 family 1.05M tokens; GPT-5.4 family 400K tokens.
//
// Pure module: no DOM, no storage, no network. When OpenAI changes prices,
// update PRICING_AS_OF and the table below — the cost tracker reads this
// single source of truth.

// Long-context pricing kicks in above this many input tokens on one request.
export const LONG_CONTEXT_THRESHOLD = 272000;

// $ per web_search tool call (Responses API built-in tool pricing).
export const WEB_SEARCH_COST_PER_CALL = 0.01;

export const PRICING_AS_OF = "2026-09-29";

// Per 1M tokens. Rates verified 2026-09-29 against the official OpenAI docs:
//   https://developers.openai.com/api/docs/pricing (web search $10/1k calls;
//     GPT-5.6 Sol promo $4/$20 through at least 2026-11-21)
//   https://developers.openai.com/api/docs/models/gpt-5.6-terra
//   https://developers.openai.com/api/docs/models/gpt-5.6-luna
//   https://developers.openai.com/api/docs/models/gpt-5.4 (1.05M window)
//   https://developers.openai.com/api/docs/models/gpt-5.4-mini
//   https://developers.openai.com/api/docs/models/gpt-5.4-nano
// Long-context rule (official): prompts with >272K input tokens are priced
// at 2x input and 1.5x output for the full request. cachedInputPerMillion is
// null only when OpenAI publishes no cached-input rate — cached tokens then
// bill at the input rate.
export const OPENAI_MODEL_PRICING = {
  "gpt-5.6": {
    label: "GPT-5.6 Sol",
    contextWindow: 1050000,
    inputPerMillion: 4.0,
    outputPerMillion: 20.0,
    cachedInputPerMillion: 0.4,
    longInputPerMillion: 8.0,
    longOutputPerMillion: 30.0,
    longCachedInputPerMillion: 0.8
  },
  "gpt-5.6-terra": {
    label: "GPT-5.6 Terra",
    contextWindow: 1050000,
    inputPerMillion: 2.0,
    outputPerMillion: 12.0,
    cachedInputPerMillion: 0.2,
    longInputPerMillion: 4.0,
    longOutputPerMillion: 18.0,
    longCachedInputPerMillion: 0.4
  },
  "gpt-5.6-luna": {
    label: "GPT-5.6 Luna",
    contextWindow: 1050000,
    inputPerMillion: 0.2,
    outputPerMillion: 1.2,
    cachedInputPerMillion: 0.02,
    longInputPerMillion: 0.4,
    longOutputPerMillion: 1.8,
    longCachedInputPerMillion: 0.04
  },
  "gpt-5.4": {
    label: "GPT-5.4",
    contextWindow: 1050000,
    inputPerMillion: 2.5,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.25,
    longInputPerMillion: 5.0,
    longOutputPerMillion: 22.5,
    longCachedInputPerMillion: 0.5
  },
  "gpt-5.4-mini": {
    label: "GPT-5.4 mini",
    contextWindow: 400000,
    inputPerMillion: 0.75,
    outputPerMillion: 4.5,
    cachedInputPerMillion: 0.075,
    longInputPerMillion: null,
    longOutputPerMillion: null
  },
  "gpt-5.4-nano": {
    label: "GPT-5.4 nano",
    contextWindow: 400000,
    inputPerMillion: 0.2,
    outputPerMillion: 1.25,
    cachedInputPerMillion: 0.02,
    longInputPerMillion: null,
    longOutputPerMillion: null
  }
};

export function pricingForModel(modelId) {
  const row = OPENAI_MODEL_PRICING[String(modelId || "").trim()];
  return row ? { ...row, model: String(modelId || "").trim() } : null;
}

// Cost of one Responses-API call from its usage block. `usage` mirrors what
// requestOpenAiChatWithUsage returns: { inputTokens, outputTokens,
// cachedInputTokens, webSearchCalls }. Returns null pricing/totalCost when the
// model has no published row — the caller should say "pricing unavailable"
// rather than invent a number.
export function costForUsage({ model, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, webSearchCalls = 0 } = {}) {
  const pricing = pricingForModel(model);
  if (!pricing) {
    return {
      pricing: null,
      longContext: false,
      inputCost: 0,
      cachedInputCost: 0,
      outputCost: 0,
      searchCost: 0,
      totalCost: 0,
      unknownPricing: true
    };
  }
  const input = Math.max(0, Math.floor(Number(inputTokens) || 0));
  const cached = Math.max(0, Math.min(Math.floor(Number(cachedInputTokens) || 0), input));
  const output = Math.max(0, Math.floor(Number(outputTokens) || 0));
  const searches = Math.max(0, Math.floor(Number(webSearchCalls) || 0));
  const longContext =
    input > LONG_CONTEXT_THRESHOLD &&
    pricing.longInputPerMillion != null &&
    pricing.longOutputPerMillion != null;
  const inRate = longContext ? pricing.longInputPerMillion : pricing.inputPerMillion;
  const outRate = longContext ? pricing.longOutputPerMillion : pricing.outputPerMillion;
  // Long-context requests bill cached input at the long-context cached rate
  // when published; otherwise cached tokens fall back to the input rate.
  const cachedRate = longContext && pricing.longCachedInputPerMillion != null
    ? pricing.longCachedInputPerMillion
    : (pricing.cachedInputPerMillion != null ? pricing.cachedInputPerMillion : inRate);
  const inputCost = ((input - cached) / 1e6) * inRate;
  const cachedInputCost = (cached / 1e6) * cachedRate;
  const outputCost = (output / 1e6) * outRate;
  const searchCost = searches * WEB_SEARCH_COST_PER_CALL;
  return {
    pricing,
    longContext,
    inputCost,
    cachedInputCost,
    outputCost,
    searchCost,
    totalCost: inputCost + cachedInputCost + outputCost + searchCost,
    unknownPricing: false
  };
}

// Compact money formatting: $0.0042 for sub-cent amounts, $1.24 above.
export function formatUsd(amount) {
  const value = Number(amount) || 0;
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

// Compact token counts: 12.4K, 1.05M.
export function formatTokens(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
