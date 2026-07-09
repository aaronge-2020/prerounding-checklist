import assert from "node:assert/strict";
import { screenMedicationSafety } from "../src/clinical/medication-safety.js";

const excessiveInsulin = screenMedicationSafety("Insulin Glargine 180 units qHS");
assert.ok(
  excessiveInsulin.flags.some((flag) => flag.type === "dose_range" && flag.medication === "insulin_glargine"),
  "insulin glargine doses above the screening single-dose range should be flagged"
);

const allergy = screenMedicationSafety("Acetaminophen 650 mg q6h PRN", { allergies: "acetaminophen" });
assert.ok(
  allergy.flags.some((flag) => flag.type === "allergy" && flag.medication === "acetaminophen"),
  "listed medication allergies should be flagged"
);

const interaction = screenMedicationSafety("Warfarin 5 mg daily\nIbuprofen 600 mg TID PRN pain");
assert.ok(
  interaction.flags.some((flag) => flag.type === "interaction" && flag.severity === "high"),
  "warfarin plus NSAID should be flagged for bleeding-risk review"
);

const normal = screenMedicationSafety("Levothyroxine 75 mcg daily");
assert.equal(normal.flags.length, 0, "ordinary levothyroxine dose should not be flagged");

console.log("Medication safety tests passed.");
