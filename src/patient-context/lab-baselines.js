// Patient-entered laboratory baselines (pure, no DOM or storage).
//
// A baseline is the patient's known steady-state value for an analyte —
// e.g. creatinine 0.9 mg/dL from September 2024 — recorded so the review
// sheet and the final note can show the current result next to it. Baselines
// are keyed by the canonical analyte key from laboratory-panels.js, so
// "Creatinine", "creatinine", and "Creat" all resolve to the same entry.

import { laboratoryAnalyteKey } from "./laboratory-panels.js?v=20260921-medication-card-v4";

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
