// Contract tests for the MDCalc-style guide content (one entry per
// calculator): required fields, valid evidence URLs, and nextSteps band
// keys that resolve against each definition's real interpret() bands.
import assert from "node:assert/strict";
import { listScoreDefinitions } from "../src/clinical-scores/index.js";
import { SCORE_GUIDES } from "../src/clinical-scores/guide-content.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    throw error;
  }
}

// Complete band sets observed from each definition's interpret() function.
const BANDS = {
  "bishop": ["favorable", "intermediate", "unfavorable"],
  "apgar": ["reassuring", "moderately-abnormal", "low"],
  "vbac-flamm": ["high", "moderate", "lower"],
  "vbac-mfmu": ["higher", "lower"],
  "due-dates": ["calculated"],
  "chadsvasc": ["low", "moderate", "high"],
  "hasbled": ["low", "moderate", "high", "very-high"],
  "heart": ["low", "moderate", "high"],
  "timi": ["low", "moderate", "high"],
  "grace": ["low", "moderate", "high"],
  "wells-dvt": ["unlikely", "moderate", "likely"],
  "wells-pe": ["low", "moderate", "high"],
  "perc": ["negative", "positive"],
  "curb65": ["low", "moderate", "high"],
  "qsofa": ["negative", "positive"],
  "sofa": ["calculated"],
  "meldna": ["very-low", "low", "moderate", "high", "very-high"],
  "child-pugh": ["compensated", "significant dysfunction", "decompensated"],
  "fib4": ["low", "indeterminate", "high"],
  "fena": ["low", "indeterminate", "high"],
  "lights": ["exudative", "transudative"],
  "anion-gap": ["calculated", "high-gap-with-alkalosis", "pure-high-gap", "mixed-or-normal-gap"],
  "corrected-calcium": ["low", "normal", "high"],
  "crcl": ["estimate"],
  "blatchford": ["low-risk", "admit"]
};

const definitions = listScoreDefinitions();

test("every calculator has a guide entry", () => {
  assert.equal(Object.keys(SCORE_GUIDES).length, 25, "25 guide entries");
  for (const definition of definitions) {
    assert.ok(SCORE_GUIDES[definition.id], `guide for ${definition.id}`);
  }
});

test("every guide has all required fields with real content", () => {
  const required = ["description", "instructions", "whenToUse", "pearlsPitfalls", "whyUse", "nextSteps", "evidence", "creator"];
  for (const definition of definitions) {
    const guide = SCORE_GUIDES[definition.id];
    for (const field of required) {
      assert.ok(field in guide, `${definition.id} has ${field}`);
    }
    assert.ok(String(guide.description).trim().length > 20, `${definition.id} description non-trivial`);
    assert.ok(String(guide.instructions).trim().length > 20, `${definition.id} instructions non-trivial`);
    assert.ok(Array.isArray(guide.whenToUse) && guide.whenToUse.length >= 2, `${definition.id} whenToUse bullets`);
    assert.ok(Array.isArray(guide.pearlsPitfalls) && guide.pearlsPitfalls.length >= 2, `${definition.id} pearls bullets`);
    assert.ok(String(guide.whyUse).trim().length > 20, `${definition.id} whyUse non-trivial`);
    assert.ok(String(guide.creator).trim().length > 10, `${definition.id} creator non-trivial`);
  }
});

test("nextSteps keys resolve against real interpret bands", () => {
  for (const definition of definitions) {
    const guide = SCORE_GUIDES[definition.id];
    const ns = guide.nextSteps;
    assert.ok(ns && typeof ns === "object", `${definition.id} nextSteps is an object`);
    assert.ok(typeof ns.default === "string" && ns.default.trim().length > 10, `${definition.id} nextSteps.default`);
    const allowed = new Set([...(BANDS[definition.id] || []), "default", "incomplete"]);
    for (const key of Object.keys(ns)) {
      assert.ok(allowed.has(key), `${definition.id} nextSteps key "${key}" is a real band`);
      assert.ok(String(ns[key]).trim().length > 10, `${definition.id} nextSteps["${key}"] non-trivial`);
    }
  }
});

test("evidence entries carry real https URLs", () => {
  for (const definition of definitions) {
    const guide = SCORE_GUIDES[definition.id];
    assert.ok(Array.isArray(guide.evidence) && guide.evidence.length >= 2, `${definition.id} has >=2 evidence entries`);
    for (const entry of guide.evidence) {
      assert.ok(typeof entry.url === "string" && entry.url.startsWith("https://"), `${definition.id} evidence URL is https`);
      assert.ok(String(entry.label || "").trim().length > 0, `${definition.id} evidence label present`);
    }
    assert.ok(
      guide.evidence.some((entry) => entry.url.includes("mdcalc.com")),
      `${definition.id} evidence links its MDCalc page`
    );
  }
});

test("guide text is plain prose (no markup artifacts)", () => {
  const seen = [];
  for (const definition of definitions) {
    const guide = SCORE_GUIDES[definition.id];
    seen.push(
      guide.description, guide.instructions, guide.whyUse, guide.creator,
      ...(Array.isArray(guide.whenToUse) ? guide.whenToUse : []),
      ...(Array.isArray(guide.pearlsPitfalls) ? guide.pearlsPitfalls : []),
      ...Object.values(guide.nextSteps)
    );
  }
  for (const text of seen) {
    const str = String(text);
    assert.ok(!/<[a-z][^>]*>/i.test(str), `no HTML tags in guide text: ${str.slice(0, 60)}`);
    assert.ok(!str.includes("�"), "no mojibake in guide text");
  }
});

console.log("score guide contract tests passed");
