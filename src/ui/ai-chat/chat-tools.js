// Clinical tool set for AI Chat's ChatGPT mode, built on the Vercel AI SDK's
// tool() with Zod v4 schemas — the same established, validated tool-loop
// framework Agent mode uses (src/ai/agent-tools.js), scoped to the clinical
// computation tools:
//
//   list_clinical_calculators / run_clinical_calculator — 25 MDCalc-parity
//   list_ai_models / run_ai_model — 7 native on-device AI/ML models
//
// Every tool executes LOCALLY in this browser. No tool sends anything to
// OpenAI or any remote service — only the model's own messages go to OpenAI,
// and only after the HIPAA review gate approves the de-identified payload.
//
// "Never invent missing inputs" is enforced structurally: the run_* tools
// return { complete: false, missing: [...] } instead of guessing, and the
// system prompt built by buildChatToolsSystemPrompt() instructs the model to
// ask the student for exactly those values and wait.

import { tool } from "../../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import { z } from "../../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import {
  CLINICAL_SCORES,
  getScoreDefinition
} from "../../clinical-scores/index.js";
import {
  AI_MODELS,
  getAiModelDefinition
} from "../../ai-models/index.js";

export const CHAT_TOOLS_TAG = "20260929-chat-tools-v1";
// Matches Agent mode's bound: at most 8 tool-calling steps per reply.
export const CHAT_MAX_STEPS = 8;

/** Tool names in a stable order (for UI display and tests). */
export const CHAT_TOOL_NAMES = [
  "list_clinical_calculators",
  "run_clinical_calculator",
  "list_ai_models",
  "run_ai_model"
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keep a value JSON-safe and bounded for the deterministic audit payload. */
function jsonSafe(value, depth = 0) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string") return value.length > 500 ? value.slice(0, 500) : value;
  if (t === "number") return Number.isFinite(value) ? value : String(value);
  if (t === "boolean") return value;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => jsonSafe(v, depth + 1));
  if (t === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 30)) {
      if (typeof v === "function") continue;
      out[k] = jsonSafe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function inputOptionList(def) {
  return (def.inputs || []).map((inp) => ({
    key: inp.key,
    label: inp.label,
    type: inp.type,
    unit: inp.unit || "",
    options: (inp.options || []).map((o) => ({ value: o.value, label: o.label }))
  }));
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Build the four clinical-computation chat tools. Pure/local — deps are
 * reserved for future test seams; every tool validates its inputs and never
 * throws, returning structured error/incomplete objects the model can
 * report honestly.
 */
export function createChatTools(/* deps = {} */) {
  // --- 1. list_clinical_calculators --------------------------------------
  const listClinicalCalculators = tool({
    description:
      "List the clinical calculators available to run locally " +
      "(25 MDCalc-parity calculators: cardiac, OB, renal, liver, pulmonary, etc.). " +
      "Call this first when the student asks for a risk score, then run_clinical_calculator with the right id.",
    inputSchema: z.object({
      filter: z.string().optional().describe("Optional keyword to filter by title, e.g. 'cardiac', 'bleeding', 'pregnancy'")
    }),
    execute: async ({ filter } = {}) => {
      const q = String(filter || "").trim().toLowerCase();
      const list = CLINICAL_SCORES
        .filter((d) => !q || `${d.title} ${d.subtitle} ${d.id}`.toLowerCase().includes(q))
        .map((d) => ({ id: d.id, title: d.title, subtitle: d.subtitle || "", inputs: inputOptionList(d) }));
      const text = list.length
        ? `Available calculators (${list.length}):\n` +
          list.map((d) => `• ${d.id}: ${d.title}${d.subtitle ? ` — ${d.subtitle}` : ""}`).join("\n")
        : `No calculators match "${filter}".`;
      return {
        text,
        deterministic: {
          kind: "calculator-list",
          count: list.length,
          calculators: list.map((d) => ({ id: d.id, title: d.title }))
        }
      };
    }
  });

  // --- 2. run_clinical_calculator -----------------------------------------
  const runClinicalCalculator = tool({
    description:
      "Run a clinical calculator LOCALLY — computation never leaves this browser " +
      "and patient data is never sent to MDCalc or any remote service. " +
      "Provide every input the calculator needs; missing inputs return an " +
      "explicit incomplete result listing what is missing — ask the student " +
      "for those values, never invent them. " +
      "Input values: use the option 'value' numbers from list_clinical_calculators " +
      "(e.g. age '<65' = 0, '65-74' = 1, '≥75' = 2).",
    inputSchema: z.object({
      calculatorId: z.string().min(1).describe("Calculator id from list_clinical_calculators, e.g. 'chadsvasc'"),
      inputs: z.record(z.string(), z.union([z.string(), z.number()])).describe(
        "Input values keyed by the calculator's input keys"
      )
    }),
    execute: async ({ calculatorId, inputs }) => {
      const def = getScoreDefinition(String(calculatorId || ""));
      if (!def) {
        const ids = CLINICAL_SCORES.map((d) => d.id).join(", ");
        return {
          text: `Unknown calculator "${calculatorId}". Available: ${ids}.`,
          deterministic: { kind: "calculator-run", calculatorId: String(calculatorId), found: false }
        };
      }
      let result;
      try {
        result = def.calculate(inputs || {});
      } catch (err) {
        return {
          text: `Calculator "${def.title}" failed: ${err?.message || "unknown error"}.`,
          deterministic: { kind: "calculator-run", calculatorId: def.id, found: true, error: String(err?.message || "") }
        };
      }
      if (!result || !result.complete) {
        const missing = Array.isArray(result?.missing) ? result.missing : [];
        return {
          text: `${def.title}: incomplete — missing: ${missing.join(", ") || "unknown"}. ` +
            `Ask the student for these values; do not invent them.`,
          deterministic: {
            kind: "calculator-run",
            calculatorId: def.id,
            title: def.title,
            complete: false,
            missing
          }
        };
      }
      const interp = result.interpretation || {};
      const text =
        `${def.title}: ${interp.headline || `${result.score} points`}\n` +
        (interp.detail ? `${interp.detail}` : "");
      return {
        text,
        deterministic: {
          kind: "calculator-run",
          calculatorId: def.id,
          title: def.title,
          complete: true,
          score: jsonSafe(result.score),
          headline: interp.headline || "",
          detail: interp.detail || "",
          band: interp.band || "",
          verifiedOn: def.verifiedOn || null,
          mdcalcUrl: def.mdcalcUrl || ""
        }
      };
    }
  });

  // --- 3. list_ai_models ----------------------------------------------------
  const listAiModels = tool({
    description:
      "List the native on-device AI/ML clinical risk models available to run " +
      "locally (7 models: QRISK3, ISARIC 4C, AutoScore, RECODe, perioperative " +
      "XGBoost, EASP sepsis, COVID-GRAM). These are NOT MDCalc calculators — " +
      "they are ported peer-reviewed (or preprint) ML models. " +
      "Call this first when the student asks for an AI-model risk estimate, " +
      "then run_ai_model with the right id.",
    inputSchema: z.object({
      filter: z.string().optional().describe("Optional keyword to filter by title, e.g. 'cardiac', 'sepsis', 'mortality'")
    }),
    execute: async ({ filter } = {}) => {
      const q = String(filter || "").trim().toLowerCase();
      const list = AI_MODELS
        .filter((d) => !q || `${d.title} ${d.subtitle} ${d.id}`.toLowerCase().includes(q))
        .map((d) => ({
          id: d.id,
          title: d.title,
          subtitle: d.subtitle || "",
          inputs: inputOptionList(d),
          peerReviewed: !!d.verifiedOn,
          validationNote: d.validationNote || "",
          reference: d.reference || ""
        }));
      const text = list.length
        ? `Available AI models (${list.length}):\n` +
          list.map((d) =>
            `• ${d.id}: ${d.title}${d.subtitle ? ` — ${d.subtitle}` : ""}` +
            (d.peerReviewed ? "" : " [PREPRINT — not peer-reviewed]")
          ).join("\n")
        : `No AI models match "${filter}".`;
      return {
        text,
        deterministic: {
          kind: "ai-model-list",
          count: list.length,
          models: list.map((d) => ({ id: d.id, title: d.title, peerReviewed: d.peerReviewed }))
        }
      };
    }
  });

  // --- 4. run_ai_model --------------------------------------------------------
  const runAiModel = tool({
    description:
      "Run a native AI/ML clinical model LOCALLY — computation never leaves " +
      "this browser. Provide every input the model needs; missing inputs " +
      "return an explicit incomplete result listing what is missing — ask " +
      "the student for those values, never invent them. " +
      "Surface any validation warning from the result with the number " +
      "(e.g. preprint / uncalibrated output). These models are NOT MDCalc " +
      "calculators — never claim MDCalc parity for them.",
    inputSchema: z.object({
      modelId: z.string().min(1).describe("Model id from list_ai_models, e.g. 'qrisk3', 'isaric4c'"),
      inputs: z.record(z.string(), z.union([z.string(), z.number()])).describe(
        "Input values keyed by the model's input keys"
      )
    }),
    execute: async ({ modelId, inputs }) => {
      const def = getAiModelDefinition(String(modelId || ""));
      if (!def) {
        const ids = AI_MODELS.map((d) => d.id).join(", ");
        return {
          text: `Unknown AI model "${modelId}". Available: ${ids}.`,
          deterministic: { kind: "ai-model-run", modelId: String(modelId), found: false }
        };
      }
      let result;
      try {
        result = def.calculate(inputs || {});
      } catch (err) {
        return {
          text: `Model "${def.title}" failed: ${err?.message || "unknown error"}.`,
          deterministic: { kind: "ai-model-run", modelId: def.id, found: true, error: String(err?.message || "") }
        };
      }
      const peerReviewed = !!def.verifiedOn;
      if (!result || !result.complete) {
        const missing = Array.isArray(result?.missing) ? result.missing : [];
        const detail = result?.interpretation?.detail || "";
        return {
          text: `${def.title}: incomplete — missing: ${missing.join(", ") || "unknown"}.` +
            (detail ? ` ${detail}` : "") +
            ` Ask the student for these values; do not invent them.`,
          deterministic: {
            kind: "ai-model-run",
            modelId: def.id,
            title: def.title,
            complete: false,
            missing,
            peerReviewed
          }
        };
      }
      const interp = result.interpretation || {};
      const text =
        `${def.title}: ${interp.headline || "complete"}\n` +
        (interp.detail ? `${interp.detail}\n` : "") +
        (peerReviewed ? "" : `WARNING: ${def.validationNote || "preprint — not peer-reviewed."}\n`) +
        `Reference: ${def.reference || "n/a"}`;
      return {
        text,
        deterministic: {
          kind: "ai-model-run",
          modelId: def.id,
          title: def.title,
          complete: true,
          result: jsonSafe({ ...result, interpretation: undefined }),
          headline: interp.headline || "",
          detail: interp.detail || "",
          band: interp.band || "",
          peerReviewed,
          validationNote: def.validationNote || "",
          reference: def.reference || "",
          paperUrl: def.paperUrl || ""
        }
      };
    }
  });

  return {
    list_clinical_calculators: listClinicalCalculators,
    run_clinical_calculator: runClinicalCalculator,
    list_ai_models: listAiModels,
    run_ai_model: runAiModel
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Build the tool-mode system prompt: the student's already-reviewed base
 * prompt (service tailoring + custom instructions + citation rules) with the
 * clinical-tool instructions appended. The base prompt is passed through
 * unchanged — this only adds tool-use rules.
 */
export function buildChatToolsSystemPrompt(baseSystemPrompt) {
  const base = String(baseSystemPrompt || "").trim();
  return [
    base,
    "",
    "CLINICAL COMPUTATION TOOLS — use them instead of calculating or estimating in your head:",
    "- list_clinical_calculators: the 25 locally-computed MDCalc-parity clinical calculators and their inputs. Call first when a risk score or clinical calculation is needed.",
    "- run_clinical_calculator: run one LOCALLY with explicit input values. Computation never leaves this browser; patient data is never sent to MDCalc or any remote service.",
    "- list_ai_models: the 7 native on-device AI/ML risk models and their inputs. These are NOT MDCalc calculators — never claim MDCalc parity for them.",
    "- run_ai_model: run one LOCALLY with explicit input values. Computation never leaves this browser.",
    "",
    "RULES FOR TOOL USE:",
    "- Deterministic tool findings (scores, risk estimates, model outputs) are authoritative computed facts. Reference them in your answer and cite which tool produced each number. Never contradict, soften, or override them with general knowledge.",
    "- NEVER invent or assume missing inputs. If a tool reports incomplete/missing inputs, ask the student for exactly those values and wait — do not fill them with typical or guessed values.",
    "- If a model result carries a validation warning (e.g. preprint, uncalibrated output), surface that warning alongside the number.",
    "- All patient content you see is de-identified. Never ask for names, dates of birth, addresses, or other identifiers.",
    "- Keep answers concise and tutoring-oriented; you are an aid, not a substitute for clinical judgment.",
    `- At most ${CHAT_MAX_STEPS} tool-calling steps per reply; plan efficient tool use.`
  ].join("\n");
}
