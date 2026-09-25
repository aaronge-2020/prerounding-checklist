// Pure Assessment & Plan generation: prompt assembly, response schema,
// validation, and HTML rendering for plan insertion. No DOM, no storage,
// no fetch — the UI edge (see src/ui/openai-ap-api.js) owns the network call.
//
// Privacy: the caller must supply ONLY de-identified text. This module never
// sees raw chart data; it formats whatever context strings it is given.

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
