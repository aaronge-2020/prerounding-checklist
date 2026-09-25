// Patient-entered laboratory baselines (pure, no DOM or storage).
//
// A baseline is the patient's known steady-state value for an analyte —
// e.g. creatinine 0.9 mg/dL from September 2024 — recorded so the review
// sheet and the final note can show the current result next to it. Baselines
// are keyed by the canonical analyte key from laboratory-panels.js, so
// "Creatinine", "creatinine", and "Creat" all resolve to the same entry.

import { laboratoryAnalyteKey } from "./laboratory-panels.js?v=20260925-blood-gas-v1";

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLabBaselines(value) {
  const entries = value && typeof value === "object" ? Object.entries(value) : [];
  const next = {};
  for (const [key, entry] of entries) {
    if (!entry || typeof entry !== "object") continue;
    const canonicalKey = laboratoryAnalyteKey(key);
    const baseline = normalizeLabBaseline(entry, canonicalKey);
    if (baseline) next[canonicalKey] = baseline;
  }
  return next;
}

export function normalizeLabBaseline(entry, analyteKey = "") {
  const value = clean(entry?.value);
  if (!value) return null;
  return {
    analyteKey: String(analyteKey || laboratoryAnalyteKey(entry?.analyteName || "")),
    analyteName: clean(entry?.analyteName),
    value,
    unit: clean(entry?.unit),
    dateLabel: clean(entry?.dateLabel),
    note: clean(entry?.note)
  };
}

export function getLabBaseline(baselines, analyteName) {
  const normalized = normalizeLabBaselines(baselines);
  return normalized[laboratoryAnalyteKey(analyteName)] || null;
}

export function setLabBaseline(baselines, analyteName, { value, unit, dateLabel, note } = {}) {
  const normalized = normalizeLabBaselines(baselines);
  const key = laboratoryAnalyteKey(analyteName);
  const baseline = normalizeLabBaseline(
    { analyteName: clean(analyteName), value, unit, dateLabel, note },
    key
  );
  if (!baseline) return normalized;
  return { ...normalized, [key]: baseline };
}

export function clearLabBaseline(baselines, analyteName) {
  const normalized = normalizeLabBaselines(baselines);
  const key = laboratoryAnalyteKey(analyteName);
  if (!(key in normalized)) return normalized;
  const next = { ...normalized };
  delete next[key];
  return next;
}

// "0.9 mg/dL · Sep 2024" — compact display for the review sheet and notes.
export function baselineDisplayText(baseline) {
  if (!baseline) return "";
  const value = clean(baseline.value);
  if (!value) return "";
  const unit = clean(baseline.unit);
  const when = clean(baseline.dateLabel);
  const text = unit ? `${value} ${unit}` : value;
  return when ? `${text} · ${when}` : text;
}

// ---------------------------------------------------------------------------
// Labs that benefit from a patient baseline, curated from primary sources.
// A baseline is the patient's own steady-state value; for these analytes the
// interpretation of an abnormal result depends on change-from-baseline, not
// just the reference range.
//
// SOURCES (verified 2026-09-25):
// - Creatinine / eGFR: KDIGO Clinical Practice Guideline for AKI (2012) — AKI
//   is defined as creatinine rise ≥0.3 mg/dL in 48h OR ≥1.5× baseline in 7
//   days; staging is entirely baseline-relative. KDIGO CKD guideline requires
//   eGFR <60 for ≥3 months (chronicity needs prior values).
// - Troponin I / T: Fourth Universal Definition of MI (Thygesen et al.,
//   Circulation/JACC/Eur Heart J 2018) — MI requires rise and/or fall with ≥1
//   value >99th percentile URL; ≥20% delta distinguishes acute from chronic
//   myocardial injury; type 4a (PCI-related) criteria explicitly reference
//   baseline values (>20% rise if baseline elevated).
// - Hemoglobin: acute blood loss anemia is defined by drop from the patient's
//   baseline (a ≥2 g/dL fall suggests acute bleeding); a "low" value means
//   something different at baseline 14 vs baseline 8 g/dL.
// - Platelets: HIT 4Ts score (ASH/CHEST guidance) — >50% fall from baseline
//   platelet count scores 2 points for thrombocytopenia; diagnosis is
//   baseline-relative.
// - BNP / NT-proBNP: heart failure management targets the patient's own
//   "dry" baseline; decongestion is judged by return toward it.
// - HbA1c: diabetes control is judged against the patient's prior value.
// - TSH: population reference ranges are wide; each patient has a narrow
//   individual set point.
// - PSA: prostate cancer screening uses PSA velocity/doubling time, which
//   requires serial baselines.
// - ALT / AST: drug-induced liver injury assessment (Hy's law) compares
//   against baseline when available.
export const BASELINE_PRIORITY_ANALYTES = Object.freeze([
  {
    key: "creatinine",
    names: Object.freeze(["Creatinine", "Creat", "Serum creatinine", "SCr"]),
    rationale: "KDIGO AKI is defined by rise from baseline (≥0.3 mg/dL in 48h or ≥1.5× in 7 days)",
    source: "KDIGO Clinical Practice Guideline for Acute Kidney Injury (2012)"
  },
  {
    key: "egfr",
    names: Object.freeze(["eGFR", "GFR", "Estimated GFR"]),
    rationale: "KDIGO CKD requires eGFR <60 for ≥3 months; AKI vs CKD needs prior values",
    source: "KDIGO Clinical Practice Guideline for CKD"
  },
  {
    key: "troponin i",
    names: Object.freeze(["Troponin I", "cTnI", "hs-TnI", "High-sensitivity troponin I"]),
    rationale: "MI needs rise/fall with ≥1 value >99th %ile; ≥20% delta separates acute from chronic injury",
    source: "Fourth Universal Definition of MI (Thygesen et al., 2018)"
  },
  {
    key: "troponin t",
    names: Object.freeze(["Troponin T", "cTnT", "hs-TnT", "High-sensitivity troponin T"]),
    rationale: "MI needs rise/fall with ≥1 value >99th %ile; ≥20% delta separates acute from chronic injury",
    source: "Fourth Universal Definition of MI (Thygesen et al., 2018)"
  },
  {
    key: "hs tni",
    names: Object.freeze(["hs-TnI", "High-sensitivity troponin I"]),
    rationale: "MI needs rise/fall with ≥1 value >99th %ile; ≥20% delta separates acute from chronic injury",
    source: "Fourth Universal Definition of MI (Thygesen et al., 2018)"
  },
  {
    key: "hs tnt",
    names: Object.freeze(["hs-TnT", "High-sensitivity troponin T"]),
    rationale: "MI needs rise/fall with ≥1 value >99th %ile; ≥20% delta separates acute from chronic injury",
    source: "Fourth Universal Definition of MI (Thygesen et al., 2018)"
  },
  {
    key: "troponin",
    names: Object.freeze(["Troponin"]),
    rationale: "MI needs rise/fall with ≥1 value >99th %ile; ≥20% delta separates acute from chronic injury",
    source: "Fourth Universal Definition of MI (Thygesen et al., 2018)"
  },
  {
    key: "hemoglobin",
    names: Object.freeze(["Hemoglobin", "Hgb", "Hb"]),
    rationale: "Acute blood loss anemia is a drop from the patient's own baseline (≥2 g/dL fall suggests acute bleeding)",
    source: "Standard clinical practice — anemia evaluation"
  },
  {
    key: "platelets",
    names: Object.freeze(["Platelets", "Platelet count", "Plt"]),
    rationale: "HIT 4Ts: >50% fall from baseline scores 2 points; diagnosis is baseline-relative",
    source: "ASH/CHEST HIT guidance — 4Ts score"
  },
  {
    key: "bnp",
    names: Object.freeze(["BNP", "B-type natriuretic peptide"]),
    rationale: "Heart failure decongestion is judged by return toward the patient's dry baseline",
    source: "Standard clinical practice — heart failure management"
  },
  {
    key: "nt probnp",
    names: Object.freeze(["NT-proBNP", "NT proBNP", "N-terminal proBNP"]),
    rationale: "Heart failure decongestion is judged by return toward the patient's dry baseline",
    source: "Standard clinical practice — heart failure management"
  },
  {
    key: "hba1c",
    names: Object.freeze(["HbA1c", "A1c", "Glycated hemoglobin", "Hemoglobin A1c"]),
    rationale: "Diabetes control is judged against the patient's prior value",
    source: "ADA Standards of Care — glycemic targets"
  },
  {
    key: "tsh",
    names: Object.freeze(["TSH", "Thyroid stimulating hormone"]),
    rationale: "Wide population range; each patient has a narrow individual set point",
    source: "Standard clinical practice — thyroid evaluation"
  },
  {
    key: "psa",
    names: Object.freeze(["PSA", "Prostate specific antigen"]),
    rationale: "PSA velocity and doubling time require serial baselines",
    source: "Standard clinical practice — prostate cancer screening"
  },
  {
    key: "alt",
    names: Object.freeze(["ALT", "Alanine aminotransferase", "SGPT"]),
    rationale: "Drug-induced liver injury assessment compares against baseline (Hy's law)",
    source: "FDA DILI guidance — Hy's law"
  },
  {
    key: "ast",
    names: Object.freeze(["AST", "Aspartate aminotransferase", "SGOT"]),
    rationale: "Drug-induced liver injury assessment compares against baseline (Hy's law)",
    source: "FDA DILI guidance — Hy's law"
  }
]);

// Returns the priority entry for an analyte name, or null when the analyte
// is not one where a baseline changes interpretation.
export function baselinePriorityFor(analyteName) {
  const key = laboratoryAnalyteKey(analyteName);
  return BASELINE_PRIORITY_ANALYTES.find((entry) => entry.key === key) || null;
}
