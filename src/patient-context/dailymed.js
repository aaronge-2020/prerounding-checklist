// On-demand DailyMed SPL label retrieval for the per-problem consult flow.
//
// Design constraints (static app, no server):
// - RxCUI -> DailyMed SetID mapping is bundled offline
//   (dailymed-setids.data.js, built from NLM DailyMed SPL metadata).
// - Label sections are fetched on demand from the public DailyMed API
//   (https://dailymed.nlm.nih.gov/dailymed/services/v2/) — no API key needed.
// - Retrieved sections are cached in localStorage so repeat lookups work
//   offline. The cache never throws and degrades gracefully.
// - Only TARGETED sections are extracted (Boxed Warning, Contraindications,
//   Warnings, Drug Interactions, Use in Specific Populations, Adverse
//   Reactions) — never full-label dumps.
//
// SAFETY — PHI BOUNDARY (read carefully):
// - The ONLY values that ever leave the device toward DailyMed are (a) a
//   numeric RxCUI resolved from the bundled RxNorm asset, or (b) a sanitized
//   ingredient name validated by sanitizeDrugName(). Raw order text, clinical
//   notes, MAR exports, patient context, and any other clinical text MUST
//   NEVER be passed to this module. sanitizeDrugName() rejects anything that
//   does not look like a bare drug name; fetchLabelSections() validates its
//   inputs and refuses to construct a request otherwise.
// - This module never reads patient data stores. Callers resolve medications
//   to RxCUIs first (via rxnorm-resolve.js) and pass only the coded concepts.

import {
  DAILYMED_RXCUI_SETIDS,
  DAILYMED_SETID_COUNT
} from "./dailymed-setids.data.js?v=20260929-dailymed-v1";

export const DAILYMED_TAG = "20260929-dailymed-v1";

/** Number of RxCUI -> SetID mappings in the bundled index. */
export function dailyMedIndexSize() {
  return DAILYMED_SETID_COUNT;
}

// LOINC codes identifying SPL sections (HL7 Structured Product Label).
export const DAILYMED_SECTION_LOINC = {
  BOXED_WARNING: "34066-1",
  CONTRAINDICATIONS: "34070-3",
  WARNINGS: "34071-1",
  ADVERSE_REACTIONS: "34072-9",
  DRUG_INTERACTIONS: "34073-7",
  USE_IN_SPECIFIC_POPULATIONS: "34074-5"
};

// Default sections extracted for consult use, in display order.
export const DAILYMED_DEFAULT_SECTIONS = [
  DAILYMED_SECTION_LOINC.BOXED_WARNING,
  DAILYMED_SECTION_LOINC.CONTRAINDICATIONS,
  DAILYMED_SECTION_LOINC.WARNINGS,
  DAILYMED_SECTION_LOINC.DRUG_INTERACTIONS,
  DAILYMED_SECTION_LOINC.USE_IN_SPECIFIC_POPULATIONS
];

const SECTION_TITLES = {
  "34066-1": "Boxed Warning",
  "34070-3": "Contraindications",
  "34071-1": "Warnings and Precautions",
  "34072-9": "Adverse Reactions",
  "34073-7": "Drug Interactions",
  "34074-5": "Use in Specific Populations"
};

/** Human-readable section title for a LOINC code. */
export function dailyMedSectionTitle(loinc) {
  return SECTION_TITLES[String(loinc)] || String(loinc);
}

/**
 * Look up the DailyMed SPL SetID for an RxCUI. Returns the SetID string,
 * or null when the RxCUI has no indexed label. Pure; never throws.
 *
 * The bundled index covers product-level RxCUIs (SCD/SBD/PSN/SY) directly.
 * Ingredient-level RxCUIs (IN/PIN) are bridged at fetch time via
 * resolveIngredientSetId() — see fetchLabelSections().
 */
export function getSetIdForRxcui(rxcui) {
  try {
    const key = String(rxcui || "").trim();
    if (!/^\d+$/.test(key)) return null;
    return DAILYMED_RXCUI_SETIDS[key] || null;
  } catch {
    return null;
  }
}

/** DailyMed SPL XML endpoint for a SetID. */
export function buildSplXmlUrl(setid) {
  return `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setid}.xml`;
}

/** Human-readable DailyMed label page for a SetID (citation link). */
export function buildDailyMedLabelUrl(setid) {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}`;
}

/**
 * Validate that a string is a bare drug/ingredient name safe to send to
 * DailyMed as a query term. Rejects anything containing digits-heavy dosing,
 * punctuation typical of clinical prose, or excessive length — the goal is
 * to make it structurally impossible to smuggle a clinical note through
 * this module. Returns the trimmed name, or null when rejected.
 */
export function sanitizeDrugName(name) {
  try {
    const text = String(name || "").trim();
    if (!text || text.length > 80) return null;
    // Bare names only: letters, spaces, hyphens, slashes (for combos).
    if (!/^[a-z][a-z \-\\/]*[a-z]$/i.test(text)) return null;
    // Reject anything that looks like dosing or clinical shorthand.
    if (/\b\d+\s*(mg|mcg|g|ml|units?|iu|meq|tab|caps?|po|iv|im|sc|qd|bid|tid|qid|prn)\b/i.test(text))
      return null;
    // Reject sentence-like content (multiple clauses).
    if (/[.,;:!?()]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

/** Strip XML/HTML tags, decode common entities, normalize whitespace. */
function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|paragraph|item|tr|li|h\d)>/gi, "\n")
    .replace(/<(p|paragraph|item|li|h\d)[\s>]/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanText(text, maxLen) {
  const stripped = stripTags(text);
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Extract top-level SPL <section> elements from raw SPL XML, keeping only
 * sections whose LOINC code is in wantedLoincCodes. Handles nested
 * subsections via depth counting so a parent section is never truncated at
 * a nested </section>. Pure; never throws.
 *
 * Returns [{ loinc, title, text }] in document order.
 */
export function extractSectionsFromSplXml(xmlText, wantedLoincCodes) {
  const out = [];
  try {
    const xml = String(xmlText || "");
    if (!xml) return out;
    const wanted = new Set((wantedLoincCodes || []).map(String));

    // Collect top-level <section> extents with depth counting.
    const topSections = [];
    let pos = 0;
    let depth = 0;
    let curStart = -1;
    let curOpenEnd = -1;
    const CLOSE_LEN = "</section>".length;
    while (pos < xml.length) {
      const nextOpen = xml.indexOf("<section", pos);
      const nextClose = xml.indexOf("</section>", pos);
      if (nextOpen === -1 && nextClose === -1) break;
      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        if (depth === 0) {
          curStart = nextOpen;
          curOpenEnd = xml.indexOf(">", nextOpen) + 1;
        }
        depth++;
        pos = nextOpen + 8;
      } else {
        depth--;
        if (depth === 0 && curStart !== -1) {
          topSections.push({
            body: xml.slice(curOpenEnd, nextClose)
          });
          curStart = -1;
        } else if (depth < 0) {
          depth = 0; // tolerate malformed closers
        }
        pos = nextClose + CLOSE_LEN;
      }
    }

    for (const section of topSections) {
      const body = section.body;
      // The LOINC <code> sits near the top of the section, before nested
      // subsections — only scan the head to avoid matching a child's code.
      const head = body.slice(0, 3000);
      const codeMatch = /<code\b[^>]*\bcode="([0-9-]+)"/i.exec(head);
      if (!codeMatch || !wanted.has(codeMatch[1])) continue;
      const loinc = codeMatch[1];
      const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
      const title = titleMatch
        ? cleanText(titleMatch[1], 120)
        : dailyMedSectionTitle(loinc);
      const textMatch = /<text\b[^>]*>([\s\S]*?)<\/text>/i.exec(body);
      const text = textMatch ? cleanText(textMatch[1], 1500) : "";
      if (!text) continue;
      out.push({ loinc, title, text });
    }
  } catch {
    // fall through with whatever was collected
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cache (localStorage, browser only). Never throws; silently degrades when
// storage is unavailable (private mode, quota, non-browser runtimes).
// ---------------------------------------------------------------------------

const CACHE_KEY = "dailymed.labelCache.v1";
const CACHE_MAX_BYTES = 1_500_000; // ~1.5 MB cap; LRU eviction beyond it.

function storageAvailable() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function readCache() {
  try {
    if (!storageAvailable()) return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    if (!storageAvailable()) return;
    let serialized = JSON.stringify(cache);
    // LRU eviction: drop oldest entries until under the cap.
    if (serialized.length > CACHE_MAX_BYTES) {
      const entries = Object.entries(cache).sort(
        (a, b) => (a[1]?.cachedAt || 0) - (b[1]?.cachedAt || 0)
      );
      const trimmed = {};
      for (const [key, value] of entries) {
        trimmed[key] = value;
        if (JSON.stringify(trimmed).length > CACHE_MAX_BYTES * 0.8) break;
      }
      // Always keep at least the newest entry.
      if (!Object.keys(trimmed).length && entries.length) {
        const [key, value] = entries[entries.length - 1];
        trimmed[key] = value;
      }
      cache = trimmed;
      serialized = JSON.stringify(cache);
    }
    localStorage.setItem(CACHE_KEY, serialized);
  } catch {
    // Quota or serialization failure: drop the cache rather than throw.
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Read cached label sections for an RxCUI without any network access.
 * Returns { setid, sections, cachedAt } or null. Pure; never throws.
 */
export function getCachedLabelSections(rxcui) {
  try {
    const setid = getSetIdForRxcui(rxcui);
    if (!setid) return null;
    const cache = readCache();
    const entry = cache[setid];
    if (!entry || !Array.isArray(entry.sections)) return null;
    // Touch for LRU ordering.
    entry.cachedAt = Date.now();
    writeCache(cache);
    return { setid, sections: entry.sections, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

/** Remove all cached DailyMed label sections. Never throws. */
export function clearLabelCache() {
  try {
    if (storageAvailable()) localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

// ---------------------------------------------------------------------------
// Ingredient bridge: IN/PIN RxCUIs -> SetID via product lookup.
// The bundled index is keyed by product-level RxCUIs (SCD/SBD). When the
// caller has an ingredient-level RxCUI (the common case from rxnorm-resolve),
// we ask RxNav for that ingredient's products, keep the ones present in the
// bundled index, and cache the derived IN->SetID mapping for offline reuse.
// Only the numeric RxCUI ever leaves the device (to rxnav.nlm.nih.gov).
// ---------------------------------------------------------------------------

const BRIDGE_CACHE_KEY = "dailymed.bridgeCache.v1";

function readBridgeCache() {
  try {
    if (!storageAvailable()) return {};
    const raw = localStorage.getItem(BRIDGE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBridgeCache(cache) {
  try {
    if (!storageAvailable()) return;
    localStorage.setItem(BRIDGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

/**
 * Resolve an ingredient-level RxCUI (IN/PIN) to a DailyMed SetID by finding
 * the ingredient's products in the bundled index. Checks the bridge cache
 * first (offline), then queries RxNav (online) and caches the result.
 * Returns the SetID string or null. Never throws.
 */
export async function resolveIngredientSetId(rxcui, opts = {}) {
  try {
    const key = String(rxcui || "").trim();
    if (!/^\d+$/.test(key)) return null;
    // Direct hit: already in the bundled index.
    const direct = getSetIdForRxcui(key);
    if (direct) return direct;
    // Bridge cache hit (offline).
    const bridgeCache = readBridgeCache();
    if (bridgeCache[key]) return bridgeCache[key];
    if (opts.offlineOnly) return null;

    const fetchFn =
      opts.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchFn) return null;

    // Ask RxNav for this ingredient's products (SCD/SBD only).
    const url =
      `https://rxnav.nlm.nih.gov/REST/rxcui/${key}/related.json?tty=SCD+SBD`;
    const response = await fetchFn(url, { headers: { Accept: "application/json" } });
    if (!response || !response.ok) return null;
    const data = await response.json();
    const groups = data?.relatedGroup?.conceptGroup || [];
    const candidates = [];
    for (const group of groups) {
      const tty = String(group?.tty || "");
      if (tty !== "SCD" && tty !== "SBD") continue;
      for (const prop of group?.conceptProperties || []) {
        const scd = String(prop?.rxcui || "");
        const setid = getSetIdForRxcui(scd);
        if (setid) candidates.push({ setid, tty, scd });
      }
    }
    if (!candidates.length) return null;
    // Prefer SBD (brand labels tend to be most maintained), then lowest SCD.
    candidates.sort((a, b) => {
      if (a.tty !== b.tty) return a.tty === "SBD" ? -1 : 1;
      return a.scd < b.scd ? -1 : 1;
    });
    const best = candidates[0].setid;
    bridgeCache[key] = best;
    writeBridgeCache(bridgeCache);
    return best;
  } catch {
    return null;
  }
}

/**
 * Fetch targeted label sections for an RxCUI, using the cache when possible.
 *
 * - rxcui: numeric RxCUI string (validated). This is the ONLY clinical
 *   identifier this function accepts — never order text, never notes.
 *   Ingredient-level RxCUIs (IN/PIN) are bridged to product labels via
 *   resolveIngredientSetId().
 * - opts.sections: LOINC codes to extract (default DAILYMED_DEFAULT_SECTIONS).
 * - opts.fetchFn: fetch implementation (default global fetch). Injected for tests.
 * - opts.offlineOnly: when true, never touch the network; cache only.
 *
 * Returns { setid, sections, fromCache } or null when the label cannot be
 * retrieved. Never throws.
 */
export async function fetchLabelSections(rxcui, opts = {}) {
  try {
    const key = String(rxcui || "").trim();
    if (!/^\d+$/.test(key)) return null;

    const fetchFn =
      opts.fetchFn || (typeof fetch !== "undefined" ? fetch : null);

    // Resolve SetID: direct index hit, bridge-cache hit, or RxNav bridge.
    // getCachedLabelSections needs the SetID, so resolve first.
    let setid = getSetIdForRxcui(key);
    if (!setid && !opts.offlineOnly && fetchFn) {
      setid = await resolveIngredientSetId(key, opts);
    } else if (!setid && opts.offlineOnly) {
      // Offline: also check the bridge cache for a previously derived mapping.
      const bridgeCache = readBridgeCache();
      setid = bridgeCache[key] || null;
    }
    if (!setid) return null;

    const cached = getCachedLabelSectionsBySetid(setid);
    if (cached) return { ...cached, fromCache: true };
    if (opts.offlineOnly || !fetchFn) return null;

    const sections = Array.isArray(opts.sections) && opts.sections.length
      ? opts.sections
      : DAILYMED_DEFAULT_SECTIONS;

    const response = await fetchFn(buildSplXmlUrl(setid), {
      headers: { Accept: "application/xml" }
    });
    if (!response || !response.ok) return null;
    const xmlText = await response.text();
    const extracted = extractSectionsFromSplXml(xmlText, sections);
    if (!extracted.length) return null;

    const cache = readCache();
    cache[setid] = {
      sections: extracted,
      cachedAt: Date.now(),
      rxcui: key
    };
    writeCache(cache);
    return { setid, sections: extracted, cachedAt: Date.now(), fromCache: false };
  } catch {
    return null;
  }
}

/** Cached label sections by SetID (used after bridge resolution). */
function getCachedLabelSectionsBySetid(setid) {
  try {
    if (!setid) return null;
    const cache = readCache();
    const entry = cache[setid];
    if (!entry || !Array.isArray(entry.sections)) return null;
    entry.cachedAt = Date.now();
    writeCache(cache);
    return { setid, sections: entry.sections, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

/**
 * Build the deterministic "LABEL EXCERPTS:" block for the per-problem
 * consult prompt from already-retrieved label data (no network here).
 *
 * labelData: array of { rxcui, ingredientName, sections: [{ loinc, title, text }] }
 *   — ingredientName must already be a de-identified RxNorm concept name.
 *
 * Renders one bullet per section, per the ap-generator extension contract:
 *   • <ingredient>: <section> — <excerpt> (DailyMed label)
 */
export function buildLabelExcerptsBlock(labelData = []) {
  try {
    const list = Array.isArray(labelData) ? labelData : [];
    const bullets = [];
    const seen = new Set();
    for (const entry of list) {
      const ingredient = String(entry?.ingredientName || "").trim();
      const rxcui = String(entry?.rxcui || "").trim();
      if (!ingredient || !/^\d+$/.test(rxcui)) continue;
      const sections = Array.isArray(entry.sections) ? entry.sections : [];
      for (const section of sections) {
        const loinc = String(section?.loinc || "").trim();
        const text = String(section?.text || "").trim();
        if (!loinc || !text) continue;
        const dedupeKey = `${rxcui}|${loinc}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const title = dailyMedSectionTitle(loinc);
        const excerpt = text.length > 400 ? text.slice(0, 399).trimEnd() + "…" : text;
        const labelUrl = buildDailyMedLabelUrl(getSetIdForRxcui(rxcui) || "");
        bullets.push(
          `• ${ingredient}: ${title} — ${excerpt} (DailyMed label: ${labelUrl})`
        );
      }
    }
    if (!bullets.length) return "";
    const joined = bullets.join("\n");
    const capped = joined.length > 3000 ? joined.slice(0, 2999) + "…" : joined;
    return `LABEL EXCERPTS (DailyMed, deterministic):\n${capped}`;
  } catch {
    return "";
  }
}
