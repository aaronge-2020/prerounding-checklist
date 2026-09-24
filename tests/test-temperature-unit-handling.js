import assert from "node:assert/strict";
import { buildClinicalReviewIndex } from "../src/review-data/index.js";

function patientWithVitals(text) {
  return {
    contextSections: [
      { id: "src-vitals", sourceKind: "vital_signs", label: "Vitals", deidentifiedText: text },
    ],
  };
}

// 1. An unmarked temperature is never assigned a unit and is flagged.
{
  const index = buildClinicalReviewIndex(patientWithVitals("Vitals\nTemp 98.6; HR 112"));
  const temp = index.vitals.find((candidate) => /temperature/i.test(candidate.name));
  assert.ok(temp, "temperature candidate exists");
  assert.equal(temp.unit, "", `unmarked temp carries no unit, got: ${JSON.stringify(temp.unit)}`);
  assert.equal(temp.unitUnmarked, true, "unmarked temp is flagged unitUnmarked");
  assert.ok(!/°C|°F/.test(temp.insertionText), `no unit fabricated into insertion text: ${temp.insertionText}`);
  const hr = index.vitals.find((candidate) => /heart rate|pulse/i.test(candidate.name));
  assert.equal(hr.unitUnmarked, false, "HR is not flagged");
}

// 2. Explicit units are preserved verbatim.
{
  const index = buildClinicalReviewIndex(patientWithVitals("Vitals\nTemp 37 °C; HR 112"));
  const temp = index.vitals.find((candidate) => /temperature/i.test(candidate.name));
  assert.equal(temp.unit, "°C");
  assert.equal(temp.unitUnmarked, false);
  assert.ok(/37 °C/.test(temp.insertionText), `explicit unit in insertion text: ${temp.insertionText}`);
}

// 3. Confirming a unit via temperatureUnits override resolves the candidate:
// unit attached, flag cleared, fingerprint rotated, stable id retained.
{
  const before = buildClinicalReviewIndex(patientWithVitals("Vitals\nTemp 98.6"));
  const tempBefore = before.vitals.find((candidate) => /temperature/i.test(candidate.name));
  const after = buildClinicalReviewIndex(patientWithVitals("Vitals\nTemp 98.6"), {
    temperatureUnits: { [tempBefore.id]: "°F" },
  });
  const tempAfter = after.vitals.find((candidate) => /temperature/i.test(candidate.name));
  assert.equal(tempAfter.id, tempBefore.id, "candidate id is stable across confirmation");
  assert.equal(tempAfter.unit, "°F");
  assert.equal(tempAfter.unitUnmarked, false);
  assert.ok(/98\.6 °F/.test(tempAfter.insertionText), `confirmed unit in insertion text: ${tempAfter.insertionText}`);
  assert.notEqual(tempAfter.fingerprint, tempBefore.fingerprint, "fingerprint rotates after unit confirmation");
}

// 4. An override for an unknown candidate id changes nothing.
{
  const index = buildClinicalReviewIndex(patientWithVitals("Vitals\nTemp 98.6"), {
    temperatureUnits: { vital_temperature_bogus: "°C" },
  });
  const temp = index.vitals.find((candidate) => /temperature/i.test(candidate.name));
  assert.equal(temp.unitUnmarked, true, "unrelated override leaves the temperature unmarked");
}

console.log("temperature unit handling: OK");
