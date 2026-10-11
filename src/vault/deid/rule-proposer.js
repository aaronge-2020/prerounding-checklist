// Automatic rule proposer: separate-and-conquer rule learning.
//
// Ports the Python divide-and-conquer engine (deid-models/auto_rule_proposer.py)
// to browser JavaScript. Learns interpretable regex rules from the clinician's
// own corrections, entirely on-device.
//
// Algorithm (Fürnkranz 1999, separate-and-conquer):
//   1. Find the single pattern covering the most corrections
//   2. Create a rule for it
//   3. Remove covered corrections ("conquered")
//   4. Repeat until no pattern covers enough remaining corrections
//
// Privacy: rules are regex patterns (no PHI). Corrections with PHI stay
// in the session-only adaptive store and are never persisted.

import { extractFeatures } from "./feature-extract.js";

// Minimum corrections sharing a pattern before a rule is proposed.
// With 2-3 corrections per note, common patterns hit this within days.
export const MIN_SUPPORT = 3;

// Candidate rules must achieve this precision on the full note set
// before being proposed. Prevents overfitting on small samples.
export const PRECISION_GATE = 0.7;

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a candidate regex from before-context strings.
 *
 * 5-step procedure (frankenstein-architecture.md §3.3):
 *   1. Tokenize: lowercase, split on [^a-z0-9]+, track correction indices
 *   2. Select: token in >= minSupport corrections, rank by coverage
 *   3. Build: stem + case generalization + suffix (escape, \s*, optional punct, $)
 *   4. Coverage re-check: must match >= minSupport inputs
 *   5. Fallback: return null if no good candidate
 *
 * @param {string[]} contexts - before_30_chars strings
 * @param {number} minSupport
 * @returns {string|null} regex source, or null
 */
export function generateCandidateRegex(contexts, minSupport = MIN_SUPPORT) {
  if (contexts.length < minSupport) return null;

  // Step 1: Tokenize
  const tokenToIndices = new Map(); // token -> Set<correctionIdx>
  const tokenToSurfaces = new Map(); // token -> surface forms[]

  contexts.forEach((ctx, idx) => {
    const lowered = ctx.toLowerCase();
    const tokens = lowered.split(/[^a-z0-9]+/).filter(Boolean);
    const rawTokens = ctx.split(/[^A-Za-z0-9]+/).filter(Boolean);
    tokens.forEach((tok, i) => {
      if (!tokenToIndices.has(tok)) {
        tokenToIndices.set(tok, new Set());
        tokenToSurfaces.set(tok, []);
      }
      tokenToIndices.get(tok).add(idx);
      if (rawTokens[i]) tokenToSurfaces.get(tok).push(rawTokens[i]);
    });
  });

  // Step 2: Select candidates by coverage
  const candidates = [];
  for (const [tok, indices] of tokenToIndices) {
    if (indices.size >= minSupport) candidates.push([indices.size, tok]);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b[0] - a[0]);
  const bestToken = candidates[0][1];
  const bestIndices = tokenToIndices.get(bestToken);

  // Step 3: Build regex
  const surfaces = tokenToSurfaces.get(bestToken);
  const freq = new Map();
  for (const s of surfaces) freq.set(s, (freq.get(s) || 0) + 1);
  const stem = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Case generalization: [Xx] only if both cases observed
  const hasUpper = surfaces.some(s => s[0] && s[0] === s[0].toUpperCase() && /[a-zA-Z]/.test(s[0]));
  const hasLower = surfaces.some(s => s[0] && s[0] === s[0].toLowerCase() && /[a-zA-Z]/.test(s[0]));
  let stemPattern;
  if (hasUpper && hasLower && stem.length > 0) {
    const first = stem[0];
    stemPattern = `[${first.toUpperCase()}${first.toLowerCase()}]${escapeRegExp(stem.slice(1))}`;
  } else {
    stemPattern = escapeRegExp(stem);
  }

  // Suffix: most frequent raw right-context between token and span
  const suffixes = [];
  const stemRe = new RegExp(escapeRegExp(stem), "i");
  for (const idx of bestIndices) {
    const ctx = contexts[idx];
    const m = ctx.match(stemRe);
    if (m) suffixes.push(ctx.slice(m.index + m[0].length));
  }
  let suffixPattern = "";
  if (suffixes.length) {
    const sFreq = new Map();
    for (const s of suffixes) sFreq.set(s, (sFreq.get(s) || 0) + 1);
    const common = [...sFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const stripped = common.replace(/\s+$/, "");
    const trailingWs = common.length - stripped.length;

    if (stripped) {
      const last = stripped[stripped.length - 1];
      if (":,-.".includes(last)) {
        suffixPattern = escapeRegExp(stripped.slice(0, -1)) + escapeRegExp(last) + "?";
      } else {
        suffixPattern = escapeRegExp(stripped);
      }
    }
    if (trailingWs > 0) suffixPattern += "\\s*";
  }

  const regex = stemPattern + suffixPattern + "$";

  // Step 4: Coverage re-check
  try {
    const pattern = new RegExp(regex);
    const matched = contexts.filter(ctx => pattern.test(ctx)).length;
    if (matched < minSupport) return null;
  } catch {
    return null;
  }

  return regex;
}

/**
 * Generate a candidate regex from after-context strings.
 * Uses ^ anchor (start of after-context) instead of $.
 */
export function generateCandidateRegexAfter(contexts, minSupport = MIN_SUPPORT) {
  if (contexts.length < minSupport) return null;

  const tokenToIndices = new Map();
  const tokenToSurfaces = new Map();

  contexts.forEach((ctx, idx) => {
    const immediate = ctx.slice(0, 20);
    const lowered = immediate.toLowerCase();
    const tokens = lowered.split(/[^a-z0-9]+/).filter(Boolean);
    const rawTokens = immediate.split(/[^A-Za-z0-9]+/).filter(Boolean);
    tokens.forEach((tok, i) => {
      if (!tokenToIndices.has(tok)) {
        tokenToIndices.set(tok, new Set());
        tokenToSurfaces.set(tok, []);
      }
      tokenToIndices.get(tok).add(idx);
      if (rawTokens[i]) tokenToSurfaces.get(tok).push(rawTokens[i]);
    });
  });

  const candidates = [];
  for (const [tok, indices] of tokenToIndices) {
    if (indices.size >= minSupport) candidates.push([indices.size, tok]);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b[0] - a[0]);
  const bestToken = candidates[0][1];

  const surfaces = tokenToSurfaces.get(bestToken);
  const freq = new Map();
  for (const s of surfaces) freq.set(s, (freq.get(s) || 0) + 1);
  const stem = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const hasUpper = surfaces.some(s => s[0] && /[A-Z]/.test(s[0]));
  const hasLower = surfaces.some(s => s[0] && /[a-z]/.test(s[0]));
  let stemPattern;
  if (hasUpper && hasLower && stem.length > 0) {
    stemPattern = `[${stem[0].toUpperCase()}${stem[0].toLowerCase()}]${escapeRegExp(stem.slice(1))}`;
  } else {
    stemPattern = escapeRegExp(stem);
  }

  const regex = "^\\s*" + stemPattern;
  try {
    const pattern = new RegExp(regex);
    const matched = contexts.filter(ctx => pattern.test(ctx)).length;
    if (matched < minSupport) return null;
  } catch {
    return null;
  }
  return regex;
}

/**
 * Separate-and-conquer: mine rules from corrections.
 *
 * @param {Array} corrections - [{id, type: 'add'|'remove'|'relabel', features, ...}]
 * @param {Object} opts - {minSupport, precisionGate}
 * @returns {Array} proposed rules
 */
export function separateAndConquer(corrections, opts = {}) {
  const minSupport = opts.minSupport ?? MIN_SUPPORT;
  const proposed = [];

  // --- DETECTION rules from 'add' corrections ---
  const adds = corrections.filter(c => c.correctionType === "add");
  const byType = new Map();
  for (const c of adds) {
    const t = c.targetType;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(c);
  }

  for (const [targetType, corrs] of byType) {
    let uncovered = [...corrs];
    while (uncovered.length >= minSupport) {
      let contexts = uncovered.map(c => c.features.before_30_chars || "");
      let regex = generateCandidateRegex(contexts, minSupport);
      let field = "before_30_chars";

      if (!regex) {
        contexts = uncovered.map(c => c.features.after_30_chars || "");
        regex = generateCandidateRegexAfter(contexts, minSupport);
        field = "after_30_chars";
      }
      if (!regex) break;

      const pattern = new RegExp(regex);
      const covered = uncovered.filter(c => pattern.test(c.features[field] || ""));
      if (covered.length < minSupport) break;

      proposed.push({
        name: `auto_detect_${targetType.toLowerCase().replace(/\s+/g, "_")}_${proposed.length}`,
        action: "detect",
        pattern: regex,
        context: field,
        targetType,
        description: `Detects ${targetType} near "${regex}"`,
        coverage: covered.length,
        correctionIds: covered.map(c => c.id),
        examples: covered.slice(0, 3).map(c => c.features.span_text || ""),
        status: "proposed",
        createdAt: Date.now(),
      });
      const coveredIds = new Set(covered.map(c => c.id));
      uncovered = uncovered.filter(c => !coveredIds.has(c.id));
    }
  }

  // --- SUPPRESSION rules from 'remove' corrections ---
  const removes = corrections.filter(c => c.correctionType === "remove");
  const byPred = new Map();
  for (const c of removes) {
    const t = c.originalType;
    if (!byPred.has(t)) byPred.set(t, []);
    byPred.get(t).push(c);
  }

  for (const [predType, corrs] of byPred) {
    let uncovered = [...corrs];
    while (uncovered.length >= minSupport) {
      const contexts = uncovered.map(c => c.features.before_30_chars || "");
      const regex = generateCandidateRegex(contexts, minSupport);
      if (!regex) break;

      const pattern = new RegExp(regex);
      const covered = uncovered.filter(c => pattern.test(c.features.before_30_chars || ""));
      if (covered.length < minSupport) break;

      proposed.push({
        name: `auto_suppress_${predType.toLowerCase().replace(/\s+/g, "_")}_${proposed.length}`,
        action: "suppress",
        pattern: regex,
        targetType: predType,
        description: `Suppresses ${predType} predictions near "${regex}"`,
        coverage: covered.length,
        correctionIds: covered.map(c => c.id),
        examples: covered.slice(0, 3).map(c => c.features.span_text || ""),
        status: "proposed",
        createdAt: Date.now(),
      });
      const coveredIds = new Set(covered.map(c => c.id));
      uncovered = uncovered.filter(c => !coveredIds.has(c.id));
    }
  }

  // --- RELABEL rules from 'relabel' corrections ---
  const relabels = corrections.filter(c => c.correctionType === "relabel");
  const byRelabel = new Map();
  for (const c of relabels) {
    const key = `${c.originalType}→${c.targetType}`;
    if (!byRelabel.has(key)) byRelabel.set(key, []);
    byRelabel.get(key).push(c);
  }

  for (const [key, corrs] of byRelabel) {
    if (corrs.length < minSupport * 2) continue; // need more evidence for relabels
    const [origType, newType] = key.split("→");
    let uncovered = [...corrs];
    while (uncovered.length >= minSupport) {
      const contexts = uncovered.map(c => c.features.before_30_chars || "");
      const regex = generateCandidateRegex(contexts, minSupport);
      if (!regex) break;

      const pattern = new RegExp(regex);
      const covered = uncovered.filter(c => pattern.test(c.features.before_30_chars || ""));
      if (covered.length < minSupport) break;

      proposed.push({
        name: `auto_relabel_${origType.toLowerCase().replace(/\s+/g, "_")}_to_${newType.toLowerCase().replace(/\s+/g, "_")}_${proposed.length}`,
        action: "relabel",
        pattern: regex,
        targetType: origType,
        newType,
        description: `Relabels ${origType} → ${newType} near "${regex}"`,
        coverage: covered.length,
        correctionIds: covered.map(c => c.id),
        examples: covered.slice(0, 3).map(c => c.features.span_text || ""),
        status: "proposed",
        createdAt: Date.now(),
      });
      const coveredIds = new Set(covered.map(c => c.id));
      uncovered = uncovered.filter(c => !coveredIds.has(c.id));
    }
  }

  return proposed;
}

/**
 * Apply approved rules to entities.
 *
 * @param {string} text - note text
 * @param {Array} entities - [{start, end, label}]
 * @param {Array} rules - approved rules
 * @returns {Array} new entities
 */
export function applyProposedRules(text, entities, rules) {
  let next = entities.map(e => ({ ...e }));

  const suppress = rules.filter(r => r.action === "suppress" && r.status === "approved");
  const relabel = rules.filter(r => r.action === "relabel" && r.status === "approved");
  const detect = rules.filter(r => r.action === "detect" && r.status === "approved");

  // Suppress false positives first
  for (const rule of suppress) {
    let pattern;
    try { pattern = new RegExp(rule.pattern); } catch { continue; }
    next = next.filter(e => {
      if (e.label !== rule.targetType) return true;
      const before = text.slice(Math.max(0, e.start - 30), e.start);
      return !pattern.test(before);
    });
  }

  // Relabel in context
  for (const rule of relabel) {
    let pattern;
    try { pattern = new RegExp(rule.pattern); } catch { continue; }
    for (const e of next) {
      if (e.label !== rule.targetType) continue;
      const before = text.slice(Math.max(0, e.start - 30), e.start);
      if (pattern.test(before)) e.label = rule.newType;
    }
  }

  // Detect missed entities (conservative: only add, never overlap existing)
  // The pattern was trained on 30-char before-context windows, so test it
  // against a sliding window, not the full text.
  const existing = new Set(next.map(e => `${e.start}:${e.end}`));
  for (const rule of detect) {
    let pattern;
    try { pattern = new RegExp(rule.pattern); } catch { continue; }
    // Slide through the text; at each word boundary, test the preceding 30 chars.
    // Single-line only: use [ \t] instead of \s so spans never cross line breaks.
    const wordRe = /\b[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}\b/g;
    let wm;
    wordRe.lastIndex = 0;
    while ((wm = wordRe.exec(text)) !== null) {
      const sStart = wm.index;
      const sEnd = sStart + wm[0].length;
      if (existing.has(`${sStart}:${sEnd}`)) continue;
      if (next.some(e => sStart < e.end && sEnd > e.start)) continue;
      const before30 = text.slice(Math.max(0, sStart - 30), sStart);
      if (!pattern.test(before30)) continue;
      // Conservative: only fire for name/occupation-shaped spans
      next.push({ start: sStart, end: sEnd, label: rule.targetType, source: "auto-rule" });
      existing.add(`${sStart}:${sEnd}`);
    }
  }

  return next;
}
