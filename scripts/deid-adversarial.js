import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

export function countNeedle(text, needle) {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function allOccurrences(text, needle) {
  const ranges = [];
  if (!needle) {
    return ranges;
  }
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    ranges.push({ start: index, end: index + needle.length });
    start = index + needle.length;
  }
  return ranges;
}

export function hasMalformedPreview(text) {
  const patterns = [
    /Patient Name:\s*\[[^\]]+\]\s*:\s*\[/i,
    /\b(?:DOB|MRN|CSN|Phone|Email|Address|Facility|Room|Unit|Provider|Referring provider|Primary endocrinologist|Emergency contact)\s*:\s*\[[A-Z ]+\]\s*:\s*\[/i,
    /Emergency contact:\s*\[PROVIDER NAME\]/i,
    /Primary endocrinologist:\s*\[CONTACT NAME\]/i,
    /Facility:\s*\[ROOM\]/i,
    /Patient Name:\s*\[DOB\]/i,
    /\[\s*\]/,
    /\[[A-Z ]+\n[A-Z ]+\]/
  ];
  return patterns.some((pattern) => pattern.test(text));
}

export function validateAdversarialCase(caseItem, seenIds = new Set()) {
  assert.ok(caseItem && typeof caseItem === "object", "case must be an object");
  assert.ok(caseItem.id && typeof caseItem.id === "string", "case must have a string id");
  assert.ok(!seenIds.has(caseItem.id), `duplicate case id: ${caseItem.id}`);
  seenIds.add(caseItem.id);
  assert.ok(caseItem.text && typeof caseItem.text === "string", `${caseItem.id} must have text`);

  for (const field of ["mustRedact", "mustPreserve", "forbiddenWarningSnippets", "expectedPlaceholders", "tags"]) {
    assert.ok(Array.isArray(caseItem[field]), `${caseItem.id} ${field} must be an array`);
  }

  for (const value of [...caseItem.mustRedact, ...caseItem.mustPreserve]) {
    assert.ok(value && typeof value === "string", `${caseItem.id} has an empty case value`);
    assert.ok(caseItem.text.includes(value), `${caseItem.id} text does not contain required value: ${value}`);
  }

  return caseItem;
}

export function scoreDeidCase(caseItem, result) {
  const failures = [];
  const redactedText = result.text || "";
  const residualWarnings = result.residualWarnings || [];
  const entities = result.entities || [];

  for (const value of caseItem.mustRedact || []) {
    const count = countNeedle(redactedText, value);
    if (count) {
      failures.push({
        type: "identifier-leak",
        value,
        detail: `${count} forbidden occurrence${count === 1 ? "" : "s"} remained`
      });
    }
  }

  for (const value of caseItem.mustPreserve || []) {
    if (!redactedText.includes(value)) {
      failures.push({
        type: "protected-term-redacted",
        value,
        detail: "protected clinical text is missing from output"
      });
    }

    const sourceRanges = allOccurrences(caseItem.text, value);
    const overlappingEntity = entities.find((entity) => sourceRanges.some((range) => rangesOverlap(entity, range)));
    if (overlappingEntity) {
      failures.push({
        type: "protected-term-entity-overlap",
        value,
        detail: `${overlappingEntity.label} entity overlapped protected clinical text`
      });
    }
  }

  for (const value of caseItem.forbiddenWarningSnippets || []) {
    const warning = residualWarnings.find((candidate) => (
      candidate.snippet && candidate.snippet.toLowerCase().includes(value.toLowerCase())
    ));
    if (warning) {
      failures.push({
        type: "protected-term-warning",
        value,
        detail: `${warning.severity} ${warning.type} warning: ${warning.snippet}`
      });
    }
  }

  for (const snippet of caseItem.expectedPlaceholders || []) {
    if (!redactedText.includes(snippet)) {
      failures.push({
        type: "placeholder-mismatch",
        value: snippet,
        detail: "expected placeholder text was not found"
      });
    }
  }

  if (hasMalformedPreview(redactedText)) {
    failures.push({
      type: "malformed-preview",
      value: "",
      detail: "output contains malformed or nested redaction placeholders"
    });
  }

  return {
    id: caseItem.id,
    tags: caseItem.tags || [],
    clean: failures.length === 0,
    failures
  };
}

export function failureRootCause(type) {
  if (type === "identifier-leak") {
    return "structured miss or alias graph miss";
  }
  if (type === "protected-term-redacted" || type === "protected-term-entity-overlap") {
    return "model false positive, residual promotion false positive, or clinical guard gap";
  }
  if (type === "protected-term-warning") {
    return "residual warning false positive";
  }
  if (type === "placeholder-mismatch" || type === "malformed-preview") {
    return "output corruption or label precedence issue";
  }
  return "unclassified";
}

export function assertDeidCase(caseItem, result) {
  const score = scoreDeidCase(caseItem, result);
  assert.deepEqual(
    score.failures,
    [],
    `${caseItem.id} failed: ${score.failures.map((failure) => `${failure.type} (${failureRootCause(failure.type)}): ${failure.value || failure.detail}`).join("; ")}`
  );
  return score;
}

export function writeFailureReport(path, failures) {
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    failures
  }, null, 2)}\n`, "utf8");
}
