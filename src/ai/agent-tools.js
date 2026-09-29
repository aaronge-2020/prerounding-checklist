// Agent-mode tool definitions for the pre-rounding app, built on the
// Vercel AI SDK's tool() with Zod v4 schemas.
//
// Five tools, each pure/local — no tool ever sends data to OpenAI or any
// remote service. The agent loop (agent-runner.js) calls these; only the
// LLM's own messages go to OpenAI, and only after the HIPAA review gate.
//
// Design notes:
// - createAgentTools(deps) is a factory so the runner can inject the
//   patient's RxNorm-coded medication list and test seams. Every tool
//   validates its inputs and never throws — failures return structured
//   error objects the model can report honestly.
// - Deterministic findings (interactions, calculator results) are returned
//   as structured `deterministic` payloads alongside human-readable text.
//   The runner captures these separately so the UI can pin them as
//   assertion chips the model's prose cannot override.
// - DDInter bundle is partial (see ddi-query.js): "no interaction found"
//   is reported as such, never as proof of safety.

import { tool } from "../../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import { z } from "../../vendor/ai-sdk/ai-sdk-bundle.mjs?v=20260929-agent-v1";
import { resolveMedicationConcepts } from "../patient-context/rxnorm-resolve.js?v=20260929-rxnorm-official-v3";
import {
  lookupInteraction,
  checkMedicationList,
  ddiBundleStatus
} from "../patient-context/ddi-query.js?v=20260929-ddi-query-v1";
import {
  fetchLabelSections,
  sanitizeDrugName,
  dailyMedSectionTitle,
  DAILYMED_DEFAULT_SECTIONS,
  buildDailyMedLabelUrl,
  getSetIdForRxcui
} from "../patient-context/dailymed.js?v=20260929-dailymed-v1";
import {
  CLINICAL_SCORES,
  getScoreDefinition
} from "../clinical-scores/index.js";

export const AGENT_TOOLS_TAG = "20260929-agent-tools-v1";
export const AGENT_MAX_STEPS = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a drug name to ingredient-level RxCUIs via the v3 resolver. */
function resolveToRxcuis(drugName) {
  const out = [];
  try {
    const concepts = resolveMedicationConcepts(String(drugName || ""));
    const seen = new Set();
    for (const c of concepts || []) {
      const rxcui = String(c?.rxcui || "").trim();
      if (/^\d+$/.test(rxcui) && !seen.has(rxcui)) {
        seen.add(rxcui);
        out.push({ rxcui, name: String(c.name || ""), tty: String(c.tty || "") });
      }
    }
  } catch {
    // fall through with whatever resolved
  }
  return out;
}

function formatInteractionText(hit) {
  const names = hit.drugNames.length
    ? hit.drugNames.join(" + ")
    : `${hit.rxcuiA} + ${hit.rxcuiB}`;
  const mechs = hit.mechanisms.length ? ` (${hit.mechanisms.join(", ")})` : "";
  return `${names}: ${hit.severity}${mechs}`;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Build the five agent tools.
 *
 * deps:
 * - patientMedications: [{ rxcui, name }] — the active patient's
 *   RxNorm-coded medication list (from the de-identified context).
 * - fetchFn: fetch implementation for DailyMed (default global fetch).
 * - offlineOnly: when true, DailyMed never touches the network.
 */
export function createAgentTools(deps = {}) {
  const patientMeds = Array.isArray(deps.patientMedications)
    ? deps.patientMedications.filter((m) => m && /^\d+$/.test(String(m.rxcui)))
    : [];
  const fetchFn = deps.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
  const offlineOnly = !!deps.offlineOnly;

  // --- 1. check_patient_medication_interactions ---------------------------
  const checkPatientMedicationInteractions = tool({
    description:
      "Check the current patient's full medication list for drug-drug interactions " +
      "using the offline DDInter interaction bundle. Returns every interacting " +
      "pair with severity (Major/Moderate) and mechanisms. " +
      "NOTE: the bundle is partial — a pair with no recorded interaction is " +
      "'not in the bundle', never proof of safety.",
    inputSchema: z.object({}),
    execute: async () => {
      const rxcuis = patientMeds.map((m) => String(m.rxcui));
      if (!rxcuis.length) {
        return {
          text: "The patient has no RxNorm-coded medications to check.",
          deterministic: {
            kind: "interaction-check",
            medicationCount: 0,
            interactions: [],
            bundlePartial: ddiBundleStatus().partial
          }
        };
      }
      const result = checkMedicationList(rxcuis);
      const lines = result.interactions.map(formatInteractionText);
      const coverageNote = result.bundlePartial
        ? ` (DDInter bundle partial: ${result.groupsProcessed}/${result.groupsTotal} groups — absence of a pair here is not proof of safety)`
        : "";
      const text = result.interactions.length
        ? `Checked ${result.checkedPairs} pairs across ${result.medicationCount} medications. ` +
          `Found ${result.interactions.length} interaction(s)${coverageNote}:\n` +
          lines.map((l) => `• ${l}`).join("\n")
        : `Checked ${result.checkedPairs} pairs across ${result.medicationCount} medications. ` +
          `No interactions found in the DDInter bundle${coverageNote}.`;
      return {
        text,
        deterministic: {
          kind: "interaction-check",
          medicationCount: result.medicationCount,
          checkedPairs: result.checkedPairs,
          interactions: result.interactions.map((hit) => ({
            drugs: hit.drugNames,
            rxcuiA: hit.rxcuiA,
            rxcuiB: hit.rxcuiB,
            severity: hit.severity,
            mechanisms: hit.mechanisms
          })),
          bundlePartial: result.bundlePartial,
          bundleTag: result.bundleTag
        }
      };
    }
  });

  // --- 2. check_drug_pair_interactions ------------------------------------
  const checkDrugPairInteractions = tool({
    description:
      "Check two named drugs for a drug-drug interaction. Names are resolved " +
      "to RxNorm ingredients first, then looked up in the offline DDInter " +
      "bundle. Use for 'what if I add X?' questions.",
    inputSchema: z.object({
      drugA: z.string().min(1).max(80).describe("First drug name (generic or brand)"),
      drugB: z.string().min(1).max(80).describe("Second drug name (generic or brand)")
    }),
    execute: async ({ drugA, drugB }) => {
      const resolvedA = resolveToRxcuis(drugA);
      const resolvedB = resolveToRxcuis(drugB);
      if (!resolvedA.length || !resolvedB.length) {
        const missing = [
          !resolvedA.length ? `"${drugA}"` : null,
          !resolvedB.length ? `"${drugB}"` : null
        ].filter(Boolean).join(" and ");
        return {
          text: `Could not resolve ${missing} to an RxNorm concept — no interaction check was performed.`,
          deterministic: {
            kind: "pair-check",
            drugA: String(drugA),
            drugB: String(drugB),
            resolved: false,
            interactions: []
          }
        };
      }
      const interactions = [];
      for (const a of resolvedA) {
        for (const b of resolvedB) {
          const hit = lookupInteraction(a.rxcui, b.rxcui);
          if (hit) interactions.push(hit);
        }
      }
      const status = ddiBundleStatus();
      const coverageNote = status.partial
        ? " (DDInter bundle is partial — no recorded interaction is not proof of safety)"
        : "";
      const text = interactions.length
        ? `Interaction(s) between ${drugA} and ${drugB}${coverageNote}:\n` +
          interactions.map((h) => `• ${formatInteractionText(h)}`).join("\n")
        : `No interaction between ${drugA} and ${drugB} in the DDInter bundle${coverageNote}.`;
      return {
        text,
        deterministic: {
          kind: "pair-check",
          drugA: String(drugA),
          drugB: String(drugB),
          resolved: true,
          rxcuiA: resolvedA.map((r) => r.rxcui),
          rxcuiB: resolvedB.map((r) => r.rxcui),
          interactions: interactions.map((hit) => ({
            drugs: hit.drugNames,
            severity: hit.severity,
            mechanisms: hit.mechanisms
          })),
          bundlePartial: status.partial
        }
      };
    }
  });

  // --- 3. lookup_drug_label ------------------------------------------------
  const lookupDrugLabel = tool({
    description:
      "Look up targeted sections of a drug's FDA label via DailyMed " +
      "(Boxed Warning, Contraindications, Warnings, Drug Interactions, " +
      "Use in Specific Populations). Returns excerpts, never full labels. " +
      "Input must be a bare drug name — dosing or clinical text is rejected.",
    inputSchema: z.object({
      drugName: z.string().min(1).max(80).describe("Bare drug/ingredient name, e.g. 'nifedipine'"),
      sections: z.array(z.string()).optional().describe(
        "Optional LOINC section codes; defaults to Boxed Warning, Contraindications, Warnings, Drug Interactions, Use in Specific Populations"
      )
    }),
    execute: async ({ drugName, sections }) => {
      const clean = sanitizeDrugName(drugName);
      if (!clean) {
        return {
          text: `Rejected "${String(drugName).slice(0, 40)}": not a bare drug name. Provide just the ingredient or brand name.`,
          deterministic: { kind: "label-lookup", drugName: String(drugName), rejected: true, sections: [] }
        };
      }
      const resolved = resolveToRxcuis(clean);
      if (!resolved.length) {
        return {
          text: `Could not resolve "${clean}" to an RxNorm concept — no label retrieved.`,
          deterministic: { kind: "label-lookup", drugName: clean, resolved: false, sections: [] }
        };
      }
      const rxcui = resolved[0].rxcui;
      const wanted = Array.isArray(sections) && sections.length
        ? sections.filter((s) => /^[0-9-]+$/.test(String(s)))
        : DAILYMED_DEFAULT_SECTIONS;
      const result = await fetchLabelSections(rxcui, { sections: wanted, fetchFn, offlineOnly });
      if (!result || !result.sections?.length) {
        return {
          text: `No DailyMed label sections retrieved for "${clean}" (RxCUI ${rxcui}).` +
            (offlineOnly ? " Offline mode: only cached labels are available." : ""),
          deterministic: { kind: "label-lookup", drugName: clean, rxcui, resolved: true, sections: [] }
        };
      }
      const labelUrl = buildDailyMedLabelUrl(result.setid);
      const lines = result.sections.map(
        (s) => `• ${dailyMedSectionTitle(s.loinc)}: ${String(s.text).slice(0, 500)}`
      );
      return {
        text: `DailyMed label excerpts for ${clean} (RxCUI ${rxcui})${result.fromCache ? " [cached]" : ""}:\n` +
          lines.join("\n") + `\nFull label: ${labelUrl}`,
        deterministic: {
          kind: "label-lookup",
          drugName: clean,
          rxcui,
          resolved: true,
          setid: result.setid,
          fromCache: !!result.fromCache,
          sections: result.sections.map((s) => ({
            loinc: s.loinc,
            title: dailyMedSectionTitle(s.loinc),
            excerpt: String(s.text).slice(0, 500)
          }))
        }
      };
    }
  });

  // --- 4. list_clinical_calculators ----------------------------------------
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
        .map((d) => ({
          id: d.id,
          title: d.title,
          subtitle: d.subtitle || "",
          inputs: (d.inputs || []).map((inp) => ({
            key: inp.key,
            label: inp.label,
            type: inp.type,
            options: (inp.options || []).map((o) => ({ value: o.value, label: o.label }))
          }))
        }));
      const text = list.length
        ? `Available calculators (${list.length}):\n` +
          list.map((d) => `• ${d.id}: ${d.title}${d.subtitle ? ` — ${d.subtitle}` : ""}`).join("\n")
        : `No calculators match "${filter}".`;
      return {
        text,
        deterministic: { kind: "calculator-list", count: list.length, calculators: list.map((d) => ({ id: d.id, title: d.title })) }
      };
    }
  });

  // --- 5. run_clinical_calculator ------------------------------------------
  const runClinicalCalculator = tool({
    description:
      "Run a clinical calculator LOCALLY — computation never leaves this browser " +
      "and patient data is never sent to MDCalc or any remote service. " +
      "Provide every input the calculator needs; missing inputs return an " +
      "explicit incomplete result listing what is missing. " +
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
        const missing = Array.isArray(result?.missing) ? result.missing.join(", ") : "unknown";
        return {
          text: `${def.title}: incomplete — missing: ${missing}. Ask the student for these values.`,
          deterministic: {
            kind: "calculator-run",
            calculatorId: def.id,
            title: def.title,
            complete: false,
            missing: result?.missing || []
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
          score: result.score,
          headline: interp.headline || "",
          detail: interp.detail || "",
          band: interp.band || "",
          verifiedOn: def.verifiedOn || null,
          mdcalcUrl: def.mdcalcUrl || ""
        }
      };
    }
  });

  return {
    check_patient_medication_interactions: checkPatientMedicationInteractions,
    check_drug_pair_interactions: checkDrugPairInteractions,
    lookup_drug_label: lookupDrugLabel,
    list_clinical_calculators: listClinicalCalculators,
    run_clinical_calculator: runClinicalCalculator
  };
}

/** Tool names in a stable order (for UI display and tests). */
export const AGENT_TOOL_NAMES = [
  "check_patient_medication_interactions",
  "check_drug_pair_interactions",
  "lookup_drug_label",
  "list_clinical_calculators",
  "run_clinical_calculator"
];
