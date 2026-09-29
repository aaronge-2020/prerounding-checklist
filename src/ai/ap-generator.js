// Pure Assessment & Plan generation: prompt assembly, response schema,
// validation, and HTML rendering for plan insertion. No DOM, no storage,
// no fetch — the UI edge (see src/ui/openai-ap-api.js) owns the network call.
//
// Privacy: the caller must supply ONLY de-identified text. This module never
// sees raw chart data; it formats whatever context strings it is given.

import { resolveMedicationConcepts } from "../patient-context/rxnorm-resolve.js?v=20260929-rxnorm-mar-v1";

export const AP_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["differentials", "diagnosticPlan", "therapeuticPlan", "references"],
  properties: {
    differentials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["diagnosis", "reasoning", "likelihood"],
        properties: {
          diagnosis: { type: "string" },
          reasoning: { type: "string" },
          likelihood: { type: "string", enum: ["most likely", "likely", "possible", "less likely"] }
        }
      }
    },
    diagnosticPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "indication", "citationIds"],
        properties: {
          order: { type: "string" },
          indication: { type: "string" },
          citationIds: { type: "array", items: { type: "integer" } }
        }
      }
    },
    therapeuticPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "details", "rationale", "citationIds"],
        properties: {
          order: { type: "string" },
          details: { type: "string" },
          rationale: { type: "string" },
          citationIds: { type: "array", items: { type: "integer" } }
        }
      }
    },
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "authors", "journal", "year", "url"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          authors: { type: "string" },
          journal: { type: "string" },
          year: { type: "string" },
          url: { type: "string" }
        }
      }
    }
  }
};

const LIKELIHOOD_ORDER = { "most likely": 0, likely: 1, possible: 2, "less likely": 3 };

function clean(value, limit = 2000) {
  return String(value || "").trim().slice(0, limit);
}

function cleanUrl(value) {
  const url = String(value || "").trim().slice(0, 500);
  return /^https?:\/\//i.test(url) ? url : "";
}

// Assemble the de-identified clinical context sent to the model.
// Every field here must already be de-identified by the caller.
export function buildApContextText({ oneLiner, hpi, pastMedicalHistory, medications, allergies, vitals, keyLabs, assessment } = {}) {
  const blocks = [];
  const add = (label, value) => {
    const text = clean(value, 3000);
    if (text) blocks.push(`${label}: ${text}`);
  };
  add("One-liner", oneLiner);
  add("History of present illness", hpi);
  add("Past medical history", pastMedicalHistory);
  add("Home medications", medications);
  add("Allergies", allergies);
  add("Vitals", vitals);
  add("Key labs / diagnostics", keyLabs);
  add("Assessment synthesis", assessment);
  return blocks.join("\n");
}

export function buildApPrompt({ problem, keyContext, existingDifferentials, contextText } = {}) {
  const problemName = clean(problem, 300) || "(problem not named)";
  const context = clean(keyContext, 1500);
  const existing = (Array.isArray(existingDifferentials) ? existingDifferentials : [])
    .map((d) => clean(d, 200))
    .filter(Boolean);
  const patient = clean(contextText, 6000) || "(no additional patient context provided)";

  return `You are an expert clinical assistant helping a medical student draft the assessment and plan for ONE clinical problem. All patient context below is DE-IDENTIFIED. Base every statement on the context given; do not invent patient data.

PROBLEM: ${problemName}
KEY CONTEXT FOR THIS PROBLEM: ${context || "(none provided)"}
${existing.length ? `STUDENT'S EXISTING DIFFERENTIAL (refine, reorder, or extend as warranted):\n- ${existing.join("\n- ")}` : "NO DIFFERENTIAL WRITTEN YET — generate one."}

DE-IDENTIFIED PATIENT CONTEXT:
${patient}

TASK — produce four sections:

1. RANKED DIFFERENTIAL DIAGNOSIS: most likely first. Each entry: the diagnosis, 1-2 sentences of reasoning tied to THIS patient's findings, and a likelihood (most likely / likely / possible / less likely).

2. DIAGNOSTIC PLAN: specific orders with a brief indication for each. Name the exact test (e.g. "CT angiography of the chest, PE protocol", not "imaging"). Include labs with the clinical question each answers.

3. THERAPEUTIC PLAN: ORDER-LEVEL SPECIFICITY. For EVERY medication give drug name, dose, route (PO / IV / IM / SC), frequency, and duration or course — exactly as it would be entered in Epic. Examples of the required granularity: "Apixaban 5 mg PO BID", "Norepinephrine infusion starting at 5 mcg/min IV, titrate to MAP > 65 mmHg", "Vancomycin per pharmacy dosing protocol (goal trough 15-20)". For non-medication orders (consults, diet, activity, monitoring, procedures) state exactly what to order. Where dosing depends on data not provided (renal function, weight, allergy), say so explicitly in the details.

4. REFERENCES: EVERY diagnostic and therapeutic recommendation MUST cite at least one primary source. Prefer the ORIGINAL clinical trial paper that established the benefit (e.g. PARADIGM-HF for sacubitril-valsartan in HFrEF — cite the trial, not a review article). Major society guidelines (ACC/AHA, KDIGO, IDSA, ASH, etc.) are acceptable when no single trial applies. Use web search to verify each citation exists and to obtain its canonical URL (PubMed, journal page, or DOI link). NEVER invent a citation: if you cannot verify a source, either omit the recommendation or support it with a major guideline you can verify.

RULES:
- Flag assumptions explicitly (e.g. "assumes eGFR > 30; if lower, dose-reduce...").
- Keep language concise and suitable for a clinical note.
- Output STRICT JSON matching the required schema. No markdown fences, no prose outside the JSON.`;
}

// Validate and normalize the model's JSON reply. Throws on shape violations.
export function parseApResult(json) {
  if (!json || typeof json !== "object") throw new Error("The AI reply was empty or malformed.");
  const refById = new Map();
  const references = Array.isArray(json.references) ? json.references : [];
  for (const ref of references) {
    const id = Number(ref?.id);
    if (!Number.isInteger(id)) continue;
    refById.set(id, {
      id,
      title: clean(ref.title, 300),
      authors: clean(ref.authors, 300),
      journal: clean(ref.journal, 200),
      year: clean(ref.year, 20),
      url: cleanUrl(ref.url)
    });
  }
  const cite = (ids) => (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && refById.has(id));

  const differentials = (Array.isArray(json.differentials) ? json.differentials : [])
    .map((d) => ({
      diagnosis: clean(d?.diagnosis, 300),
      reasoning: clean(d?.reasoning, 800),
      cluesFor: clean(d?.reasoning, 800),
      cluesAgainst: "",
      likelihood: LIKELIHOOD_ORDER[d?.likelihood] !== undefined ? d.likelihood : "possible"
    }))
    .filter((d) => d.diagnosis)
    .sort((a, b) => LIKELIHOOD_ORDER[a.likelihood] - LIKELIHOOD_ORDER[b.likelihood]);

  const diagnosticPlan = (Array.isArray(json.diagnosticPlan) ? json.diagnosticPlan : [])
    .map((d) => ({
      order: clean(d?.order, 400),
      indication: clean(d?.indication, 600),
      citationIds: cite(d?.citationIds)
    }))
    .filter((d) => d.order);

  const therapeuticPlan = (Array.isArray(json.therapeuticPlan) ? json.therapeuticPlan : [])
    .map((t) => ({
      order: clean(t?.order, 400),
      details: clean(t?.details, 600),
      rationale: clean(t?.rationale, 600),
      citationIds: cite(t?.citationIds)
    }))
    .filter((t) => t.order);

  if (!differentials.length && !diagnosticPlan.length && !therapeuticPlan.length) {
    throw new Error("The AI reply contained no usable differential, diagnostic, or therapeutic content.");
  }
  return { differentials, diagnosticPlan, therapeuticPlan, references: [...refById.values()] };
}

// Per-problem Assessment & Plan generation now works as a SUGGESTED-EDITS
// flow: instead of drafting the whole plan from scratch, the model proposes
// targeted revisions (add / revise / remove) against the student's CURRENT
// plan for one problem, and the student approves or rejects each
// suggestion individually, Google-Docs style.
export const AP_SUGGESTION_TARGETS = Object.freeze(["differential", "diagnostic_plan", "therapeutic_plan"]);
export const AP_SUGGESTION_ACTIONS = Object.freeze(["add", "revise", "remove"]);

export const AP_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions", "references"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "target", "action", "anchor", "suggested", "rationale", "likelihood", "citationIds"],
        properties: {
          id: { type: "integer" },
          target: { type: "string", enum: ["differential", "diagnostic_plan", "therapeutic_plan"] },
          action: { type: "string", enum: ["add", "revise", "remove"] },
          // Exact existing text this suggestion revises or removes. Required
          // for revise/remove; empty string for add.
          anchor: { type: "string" },
          // The proposed new text. Required for add/revise; empty string for remove.
          suggested: { type: "string" },
          rationale: { type: "string" },
          // For differential adds/revises: where this diagnosis ranks.
          // Empty string for plan suggestions.
          likelihood: { type: "string" },
          citationIds: { type: "array", items: { type: "integer" } }
        }
      }
    },
    references: AP_RESPONSE_SCHEMA.properties.references
  }
};

function planLines(text) {
  return clean(text, 4000)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Assemble the revision prompt for ONE problem. The prompt carries only this
// problem's own assessment content (its current differential and plans) plus
// the note-level assessment and compact objective data — never other
// problems, never the full draft. The whole prompt is shown to the student
// in an editable textarea before anything is sent.
// Deterministic medication context for the per-problem consult.
// Resolves each medication order string to RxNorm concepts (ingredient-level
// RxCUIs via src/patient-context/rxnorm-resolve.js — offline, never throws)
// and renders one line per concept:
//
//   MEDICATION CONTEXT (RxNorm-coded, deterministic):
//   - Lipitor 20 mg PO daily → atorvastatin (RxCUI 83367) — 20 mg, PO
//
// Combination products emit one line per ingredient. Medications that do not
// resolve are skipped silently; when nothing resolves the block is omitted
// entirely so the consult prompt is never broken by a lookup miss.
// The block contains only coded concepts and public terminology (no PHI), and
// it is injected into the prompt BEFORE the student reviews the exact outbound
// text in the confirm modal — the existing review gate stays authoritative.
//
// EXTENSION CONTRACT (append-only; no dead code shipped):
// - Interaction flags (DDInter bundle, download in progress) append under an
//   "INTERACTION FLAGS:" subheader as:
//     ! <severity>: <drug A> + <drug B> — <mechanism / management>
// - DailyMed label excerpts (label lookup migration pending) append under a
//   "LABEL EXCERPTS:" subheader as:
//     \u2022 <ingredient>: <section> — <excerpt> (<citation>)
export function buildMedicationContextBlock(medications = []) {
  const seen = new Set();
  const lines = [];
  const list = Array.isArray(medications) ? medications : [];
  for (const entry of list) {
    const text = typeof entry === "string" ? entry : String(entry?.orderText ?? entry?.name ?? "");
    if (!text.trim()) continue;
    let concepts = [];
    try {
      concepts = resolveMedicationConcepts(text) || [];
    } catch {
      concepts = [];
    }
    for (const concept of concepts) {
      const rxcui = String(concept?.rxcui || "").trim();
      const name = String(concept?.name || "").trim();
      if (!rxcui || !name) continue;
      const detail = [concept?.strength, concept?.doseForm, concept?.route]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(", ");
      const dedupeKey = `${rxcui}|${detail}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      lines.push(`- ${clean(text, 120)} \u2192 ${name} (RxCUI ${rxcui})${detail ? ` \u2014 ${detail}` : ""}`);
    }
  }
  if (!lines.length) return "";
  return clean(`MEDICATION CONTEXT (RxNorm-coded, deterministic):\n${lines.join("\n")}`, 4000);
}

export function buildApRevisionPrompt({
  problem,
  keyContext,
  etiologyStatus,
  knownEtiology,
  differentials,
  diagnosticPlan,
  therapeuticPlan,
  assessment,
  vitals,
  keyLabs,
  medications
} = {}) {
  const problemName = clean(problem, 300) || "(problem not named)";
  const context = clean(keyContext, 1500);
  const etiology = etiologyStatus === "known"
    ? `Known etiology: ${clean(knownEtiology, 1000) || "(not specified)"}`
    : "Etiology: unknown (student is working up the differential)";
  const diffList = (Array.isArray(differentials) ? differentials : [])
    .map((d) => {
      const dx = clean(typeof d === "string" ? d : d?.diagnosis, 300);
      if (!dx) return "";
      const like = clean(typeof d === "string" ? "" : d?.likelihood, 30);
      const clues = clean(typeof d === "string" ? "" : (d?.cluesFor || d?.reasoning), 400);
      return `- ${dx}${like ? ` (${like})` : ""}${clues ? ` — ${clues}` : ""}`;
    })
    .filter(Boolean);
  const dxLines = planLines(diagnosticPlan);
  const txLines = planLines(therapeuticPlan);
  const assessmentText = clean(assessment, 3000);
  const objectiveBits = [];
  if (clean(vitals, 1500)) objectiveBits.push(`Vitals: ${clean(vitals, 1500)}`);
  if (clean(keyLabs, 3000)) objectiveBits.push(`Key labs / diagnostics: ${clean(keyLabs, 3000)}`);
  const medicationBlock = buildMedicationContextBlock(medications);

  return `You are an expert clinical assistant helping a medical student refine the assessment and plan for ONE clinical problem. All patient context below is DE-IDENTIFIED. Base every suggestion on the context given; do not invent patient data.

IMPORTANT — SUGGESTED EDITS, NOT A REWRITE: do NOT generate a whole new plan. The student already has a current plan below. Propose TARGETED REVISIONS to it: individual suggestions the student will approve or reject one by one. Prefer a small number of high-value suggestions over an exhaustive list. If the current plan is already solid, say so with an empty suggestions array rather than inventing changes.

PROBLEM: ${problemName}
KEY CONTEXT FOR THIS PROBLEM: ${context || "(none provided)"}
${etiology}

STUDENT'S CURRENT DIFFERENTIAL:
${diffList.length ? diffList.join("\n") : "(none written yet)"}

STUDENT'S CURRENT DIAGNOSTIC PLAN:
${dxLines.length ? dxLines.map((line) => `- ${line}`).join("\n") : "(none written yet)"}

STUDENT'S CURRENT THERAPEUTIC PLAN:
${txLines.length ? txLines.map((line) => `- ${line}`).join("\n") : "(none written yet)"}

STUDENT'S ASSESSMENT SYNTHESIS (note-level):
${assessmentText || "(none written yet)"}
${objectiveBits.length ? `\nDE-IDENTIFIED OBJECTIVE DATA:\n${objectiveBits.join("\n")}\n` : ""}
${medicationBlock ? `\n${medicationBlock}\n` : ""}
TASK — return suggestions as a JSON object with a "suggestions" array. Each suggestion revises ONE thing:

- "target": one of "differential", "diagnostic_plan", "therapeutic_plan".
- "action": "add" (new item), "revise" (change existing text), or "remove" (delete something wrong or duplicative).
- "anchor": for revise/remove, the EXACT existing text being changed (copy it verbatim from the current plan above). Empty string for add.
- "suggested": the proposed new text. For "add" to a plan, write the full line as it should appear (order-level specificity: drug name, dose, route, frequency, duration — e.g. "Furosemide 40 mg IV BID"). For "add" to the differential, the diagnosis name. Empty string for remove.
- "rationale": 1-2 sentences tied to THIS patient's findings.
- "likelihood": for differential add/revise — most likely / likely / possible / less likely. Empty string for plan suggestions.
- "citationIds": ids into "references" supporting this suggestion. Empty array when none apply.

4. REFERENCES: every diagnostic and therapeutic suggestion MUST cite at least one primary source. Prefer the ORIGINAL clinical trial paper that established the benefit (e.g. PARADIGM-HF for sacubitril-valsartan in HFrEF — cite the trial, not a review article). Major society guidelines (ACC/AHA, KDIGO, IDSA, ASH, etc.) are acceptable when no single trial applies. Use web search to verify each citation exists and to obtain its canonical URL (PubMed, journal page, or DOI link). NEVER invent a citation: if you cannot verify a source, either omit the suggestion or support it with a major guideline you can verify.

RULES:
- Flag assumptions explicitly (e.g. "assumes eGFR > 30; if lower, dose-reduce...").
- Keep language concise and suitable for a clinical note.
- Output STRICT JSON matching the required schema. No markdown fences, no prose outside the JSON.`;
}

// Validate and normalize the model's suggestion reply. Throws on shape violations.
export function parseApSuggestions(json) {
  if (!json || typeof json !== "object") throw new Error("The AI reply was empty or malformed.");
  const refById = new Map();
  const references = Array.isArray(json.references) ? json.references : [];
  for (const ref of references) {
    const id = Number(ref?.id);
    if (!Number.isInteger(id)) continue;
    refById.set(id, {
      id,
      title: clean(ref.title, 300),
      authors: clean(ref.authors, 300),
      journal: clean(ref.journal, 200),
      year: clean(ref.year, 20),
      url: cleanUrl(ref.url)
    });
  }
  const cite = (ids) => (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && refById.has(id));

  const suggestions = (Array.isArray(json.suggestions) ? json.suggestions : [])
    .map((s, index) => {
      const target = AP_SUGGESTION_TARGETS.includes(s?.target) ? s.target : "";
      const action = AP_SUGGESTION_ACTIONS.includes(s?.action) ? s.action : "";
      return {
        id: Number.isInteger(s?.id) ? s.id : index + 1,
        target,
        action,
        anchor: clean(s?.anchor, 800),
        suggested: clean(s?.suggested, 1200),
        rationale: clean(s?.rationale, 1200),
        likelihood: LIKELIHOOD_ORDER[s?.likelihood] !== undefined ? s.likelihood : "",
        citationIds: cite(s?.citationIds)
      };
    })
    .filter((s) => s.target && s.action && (s.suggested || s.action === "remove") && (s.action === "add" || s.anchor));
  return { suggestions, references: [...refById.values()] };
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function citationSuperscripts(ids, references) {
  const valid = ids.filter((id) => references.some((r) => r.id === id));
  if (!valid.length) return "";
  return `<sup class="ap-cite">${valid.map((id) => {
    const ref = references.find((r) => r.id === id);
    const label = `[${id}]`;
    return ref?.url
      ? `<a href="${escapeHtmlText(ref.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  }).join("")}</sup>`;
}

function referencesHtml(references) {
  const cited = references.filter((r) => r.title || r.url);
  if (!cited.length) return "";
  const items = cited.map((r) => {
    const parts = [r.authors, r.title ? `<em>${escapeHtmlText(r.title)}</em>` : "", r.journal, r.year]
      .filter(Boolean).join(". ");
    const body = r.url
      ? `<a href="${escapeHtmlText(r.url)}" target="_blank" rel="noopener noreferrer">${parts || escapeHtmlText(r.url)}</a>`
      : parts;
    return `<li value="${r.id}">${body}</li>`;
  }).join("");
  return `<p class="ap-refs-head">References</p><ol class="ap-refs">${items}</ol>`;
}

// Render the AI result as HTML for insertion into the plan editors.
// Pure string building — the controller decides where it goes.
export function apResultToHtml(result) {
  const references = result.references || [];
  const diagnosticPlanHtml = result.diagnosticPlan.length
    ? `<ul class="ap-plan-list">${result.diagnosticPlan.map((d) =>
      `<li><strong>${escapeHtmlText(d.order)}</strong>${d.indication ? ` — ${escapeHtmlText(d.indication)}` : ""}${citationSuperscripts(d.citationIds, references)}</li>`
    ).join("")}</ul>${referencesHtml(references)}`
    : "";
  const therapeuticPlanHtml = result.therapeuticPlan.length
    ? `<ul class="ap-plan-list">${result.therapeuticPlan.map((t) =>
      `<li><strong>${escapeHtmlText(t.order)}</strong>${t.details ? ` — ${escapeHtmlText(t.details)}` : ""}${t.rationale ? ` <span class="ap-rationale">(${escapeHtmlText(t.rationale)})</span>` : ""}${citationSuperscripts(t.citationIds, references)}</li>`
    ).join("")}</ul>${referencesHtml(references)}`
    : "";
  return { diagnosticPlanHtml, therapeuticPlanHtml };
}
