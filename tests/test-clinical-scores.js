// Parity tests for the native clinical score calculators.
// Each assertion is checked against the MDCalc calculator it mirrors:
//   Bishop      -> MDCalc calc 3320 (5 components, 0-13, >=8 favorable / <=5 unfavorable)
//   APGAR       -> MDCalc calc 23   (5 components 0-2, 0-10; 7-10 / 4-6 / 0-3 bands)
//   VBAC Flamm  -> MDCalc calc 3317 (0-10 points -> 49/60/67/77/89/93/95% table)
//   VBAC MFMU   -> MDCalc calc 10433 (Grobman 2021 logistic model, no race/ethnicity)
//   Due dates   -> MDCalc calc 423   (Naegele + cycle-length adjustment, 5 entry modes)
import assert from "node:assert/strict";
import { calculateBishop } from "../src/clinical-scores/bishop.js";
import { APGAR_INPUTS, calculateApgar } from "../src/clinical-scores/apgar.js";
import { calculateFlamm, flammProbabilityPercent } from "../src/clinical-scores/vbac-flamm.js";
import { calculateVbacMfmu, formatMfmuPercent } from "../src/clinical-scores/vbac-mfmu.js";
import { calculateDueDates, formatEgaLong, formatLongDate } from "../src/clinical-scores/due-dates.js";
import {
  latestVitalValue,
  parseAgeYears,
  parseEgaParts,
  parseLmpISO,
  resolveScoreBindings
} from "../src/clinical-scores/patient-bindings.js";

// ---- Bishop (MDCalc 3320) ----
{
  const max = calculateBishop({ dilation: 3, effacement: 3, station: 3, position: 2, consistency: 2 });
  assert.equal(max.complete, true);
  assert.equal(max.score, 13);
  assert.equal(max.interpretation.band, "favorable");

  const min = calculateBishop({ dilation: 0, effacement: 0, station: 0, position: 0, consistency: 0 });
  assert.equal(min.score, 0);
  assert.equal(min.interpretation.band, "unfavorable");

  assert.equal(calculateBishop({ dilation: 3, effacement: 3, station: 2, position: 0, consistency: 0 }).interpretation.band, "favorable"); // 8
  assert.equal(calculateBishop({ dilation: 2, effacement: 2, station: 1, position: 0, consistency: 0 }).interpretation.band, "unfavorable"); // 5
  assert.equal(calculateBishop({ dilation: 2, effacement: 2, station: 2, position: 0, consistency: 0 }).interpretation.band, "intermediate"); // 6

  const partial = calculateBishop({ dilation: 3, effacement: 3, position: 2, consistency: 2 });
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ["Station"]);
}

// ---- Bishop result display matches MDCalc verbatim (verified live 2026-09-26) ----
{
  const fav = calculateBishop({ dilation: 3, effacement: 3, station: 3, position: 2, consistency: 2 });
  assert.equal(fav.interpretation.headline, "13 points");
  assert.match(fav.interpretation.detail, /Scores \u2265 8 suggest spontaneous vaginal delivery is more likely/);

  const unfav = calculateBishop({ dilation: 0, effacement: 0, station: 0, position: 0, consistency: 0 });
  assert.equal(unfav.interpretation.headline, "0 points");
  assert.match(unfav.interpretation.detail, /Scores \u2264 5 suggest an unfavorable cervix/);
}

// ---- APGAR (MDCalc 23) ----
{
  const max = calculateApgar({ appearance: 2, pulse: 2, grimace: 2, activity: 2, respiration: 2 });
  assert.equal(max.score, 10);
  assert.equal(max.interpretation.band, "reassuring");

  const min = calculateApgar({ appearance: 0, pulse: 0, grimace: 0, activity: 0, respiration: 0 });
  assert.equal(min.score, 0);
  assert.equal(min.interpretation.band, "low");

  const mid = calculateApgar({ appearance: 2, pulse: 2, grimace: 1, activity: 0, respiration: 0 });
  assert.equal(mid.score, 5);
  assert.equal(mid.interpretation.band, "moderately-abnormal");

  const partial = calculateApgar({ appearance: 2, pulse: 2 });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes("Grimace"));
}

// ---- APGAR order, labels, and result display match MDCalc (verified live 2026-09-26) ----
{
  assert.deepEqual(
    APGAR_INPUTS.map((input) => input.label),
    ["Activity/muscle tone", "Pulse", "Grimace", "Appearance/color", "Respirations"]
  );
  const activity = APGAR_INPUTS[0];
  assert.deepEqual(activity.options.map((o) => o.label), ["Limp", "Some extremity flexion", "Active"]);

  const normal = calculateApgar({ activity: 2, pulse: 2, grimace: 2, appearance: 2, respiration: 2 });
  assert.equal(normal.interpretation.headline, "10 points");
  assert.match(normal.interpretation.detail, /Scores \u22657 are typically "normal" for neonates/);

  const low = calculateApgar({ activity: 0, pulse: 0, grimace: 0, appearance: 0, respiration: 0 });
  assert.equal(low.interpretation.headline, "0 points");
  assert.match(low.interpretation.detail, /Scores <7 suggest potential need for medical intervention/);
}

// ---- VBAC Flamm (MDCalc 3317) ----
{
  // MDCalc score -> % table: 0-2:49, 3:60, 4:67, 5:77, 6:89, 7:93, 8-10:95
  assert.equal(flammProbabilityPercent(0), 49);
  assert.equal(flammProbabilityPercent(2), 49);
  assert.equal(flammProbabilityPercent(3), 60);
  assert.equal(flammProbabilityPercent(4), 67);
  assert.equal(flammProbabilityPercent(5), 77);
  assert.equal(flammProbabilityPercent(6), 89);
  assert.equal(flammProbabilityPercent(7), 93);
  assert.equal(flammProbabilityPercent(8), 95);
  assert.equal(flammProbabilityPercent(10), 95);

  const max = calculateFlamm({ ageUnder40: 2, vaginalBirthHistory: 4, reasonNotFailureToProgress: 1, effacement: 2, dilationAtLeast4cm: 1 });
  assert.equal(max.score, 10);
  assert.equal(max.probabilityPercent, 95);

  const min = calculateFlamm({ ageUnder40: 0, vaginalBirthHistory: 0, reasonNotFailureToProgress: 0, effacement: 0, dilationAtLeast4cm: 0 });
  assert.equal(min.score, 0);
  assert.equal(min.probabilityPercent, 49);
  assert.match(min.interpretation.detail, /does not predict failure/);

  const five = calculateFlamm({ ageUnder40: 2, vaginalBirthHistory: 1, reasonNotFailureToProgress: 0, effacement: 2, dilationAtLeast4cm: 0 });
  assert.equal(five.score, 5);
  assert.equal(five.probabilityPercent, 77);

  const partial = calculateFlamm({ ageUnder40: 2 });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.length === 4);
}

// ---- Flamm result display matches MDCalc wording (verified live 2026-09-26) ----
{
  const max = calculateFlamm({ ageUnder40: 2, vaginalBirthHistory: 4, reasonNotFailureToProgress: 1, effacement: 2, dilationAtLeast4cm: 1 });
  assert.equal(max.interpretation.headline, "95% of women with successful VBAC");
  const min = calculateFlamm({ ageUnder40: 0, vaginalBirthHistory: 0, reasonNotFailureToProgress: 0, effacement: 0, dilationAtLeast4cm: 0 });
  assert.equal(min.interpretation.headline, "49% of women with successful VBAC");
}

// ---- VBAC MFMU / Grobman 2021 (MDCalc 10433) ----
// w = -5.952 - 0.023*age - 0.024*wtKg + 0.056*htCm - 0.597*arrest
//     + 0.868*vagBefore + 1.869*vbac - 0.966*htn ; p = e^w/(1+e^w)*100
{
  // Reference case, hand-computed: w = -5.952-0.69-1.68+9.24 = 0.918 -> 71.5%
  const ref = calculateVbacMfmu({
    ageYears: 30, prepregnancyWeight: 70, prepregnancyWeightUnit: "kg",
    height: 165, heightUnit: "cm",
    arrestDisorder: 0, obstetricHistory: 0, treatedChronicHypertension: 0
  });
  assert.equal(ref.complete, true);
  assert.equal(ref.probabilityPercent, 71.5);

  // Same patient in imperial units: 154.3 lb ~= 70 kg, 65 in = 165.1 cm.
  const imperial = calculateVbacMfmu({
    ageYears: 30, prepregnancyWeight: 154.3, prepregnancyWeightUnit: "lb",
    height: 65, heightUnit: "in",
    arrestDisorder: 0, obstetricHistory: 0, treatedChronicHypertension: 0
  });
  assert.ok(Math.abs(imperial.probabilityPercent - 71.5) < 0.3);

  // Prior VBAC adds 1.869 to w: w = 2.787 -> 94.2%
  const vbac = calculateVbacMfmu({
    ageYears: 30, prepregnancyWeight: 70, prepregnancyWeightUnit: "kg",
    height: 165, heightUnit: "cm",
    arrestDisorder: 0, obstetricHistory: 2, treatedChronicHypertension: 0
  });
  assert.equal(vbac.probabilityPercent, 94.2);

  // Treated chronic HTN subtracts 0.966: w = -0.048 -> 48.8%
  const htn = calculateVbacMfmu({
    ageYears: 30, prepregnancyWeight: 70, prepregnancyWeightUnit: "kg",
    height: 165, heightUnit: "cm",
    arrestDisorder: 0, obstetricHistory: 0, treatedChronicHypertension: 1
  });
  assert.equal(htn.probabilityPercent, 48.8);

  const partial = calculateVbacMfmu({ ageYears: 30 });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes("Pre-pregnancy weight"));
}

// ---- MFMU result display: one decimal + space + % (verified live 2026-09-26) ----
{
  assert.equal(formatMfmuPercent(85.6436), "85.6 %");
  assert.equal(formatMfmuPercent(16.9524), "17.0 %");
  assert.equal(formatMfmuPercent(96.8385), "96.8 %");

  const ref = calculateVbacMfmu({
    ageYears: 30, prepregnancyWeight: 70, prepregnancyWeightUnit: "kg",
    height: 165, heightUnit: "cm",
    arrestDisorder: 1, obstetricHistory: 0, treatedChronicHypertension: 0
  });
  assert.equal(ref.interpretation.headline, formatMfmuPercent(ref.probabilityPercent));
  assert.match(ref.interpretation.detail, /Chance of successful vaginal birth after cesarean delivery/);
}

// ---- Due dates (MDCalc 423) ----
{
  const lmp = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "2026-01-01", todayISO: "2026-09-26" });
  assert.equal(lmp.complete, true);
  assert.equal(lmp.eddISO, "2026-10-08");
  assert.equal(lmp.lmpISO, "2026-01-01");
  assert.equal(lmp.conceptionISO, "2026-01-15");
  assert.deepEqual([lmp.egaToday.weeks, lmp.egaToday.days], [38, 2]); // 268 days

  const long = calculateDueDates({ mode: "lmp", cycleLength: 35, dateISO: "2026-01-01", todayISO: "2026-09-26" });
  assert.equal(long.eddISO, "2026-10-15"); // +7 days for the longer cycle

  const egaToday = calculateDueDates({ mode: "ega-today", cycleLength: 28, egaWeeks: 39, egaDays: 2, todayISO: "2026-09-26" });
  assert.equal(egaToday.lmpISO, "2025-12-25");
  assert.equal(egaToday.eddISO, "2026-10-01");

  const conception = calculateDueDates({ mode: "conception", cycleLength: 28, dateISO: "2026-01-15", todayISO: "2026-09-26" });
  assert.equal(conception.lmpISO, "2026-01-01");
  assert.equal(conception.eddISO, "2026-10-08");

  const edd = calculateDueDates({ mode: "edd", cycleLength: 28, dateISO: "2026-10-08", todayISO: "2026-09-26" });
  assert.equal(edd.lmpISO, "2026-01-01");
  assert.equal(edd.eddISO, "2026-10-08");

  const egaDate = calculateDueDates({ mode: "ega-on-date", cycleLength: 28, egaWeeks: 32, egaDays: 0, egaDateISO: "2026-08-01", todayISO: "2026-09-26" });
  assert.equal(egaDate.lmpISO, "2025-12-20");
  assert.equal(egaDate.eddISO, "2026-09-26");

  const missing = calculateDueDates({ mode: "lmp", cycleLength: 28, todayISO: "2026-09-26" });
  assert.equal(missing.complete, false);

  const badDate = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "not-a-date", todayISO: "2026-09-26" });
  assert.equal(badDate.complete, false);

  const impossible = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "2026-02-30", todayISO: "2026-09-26" });
  assert.equal(impossible.complete, false, "impossible calendar date rejected");
  const malformed = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "2026-1-1", todayISO: "2026-09-26" });
  assert.equal(malformed.complete, false, "non-padded ISO rejected");

  const leap = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "2024-02-29", todayISO: "2024-09-26" });
  assert.equal(leap.complete, true);
  assert.equal(leap.eddISO, "2024-12-05", "leap-day LMP handled");

  const shortCycle = calculateDueDates({ mode: "lmp", cycleLength: 20, dateISO: "2026-01-01", todayISO: "2026-09-26" });
  assert.equal(shortCycle.eddISO, "2026-09-30", "short cycle subtracts days");
}

// ---- Due-date result display matches MDCalc format (verified live 2026-09-26) ----
{
  assert.equal(formatLongDate("2026-10-08"), "Thursday, Oct 8, 2026");
  assert.equal(formatLongDate("2025-12-25"), "Thursday, Dec 25, 2025");
  assert.equal(formatEgaLong({ weeks: 38, days: 2 }), "38 weeks & 2 days");

  const lmp = calculateDueDates({ mode: "lmp", cycleLength: 28, dateISO: "2026-01-01", todayISO: "2026-09-26" });
  assert.equal(lmp.interpretation.headline, "Due date: Thursday, Oct 8, 2026");
  assert.match(lmp.interpretation.detail, /Last menstrual period: Thursday, Jan 1, 2026/);
  assert.match(lmp.interpretation.detail, /Date of conception: Thursday, Jan 15, 2026/);
  assert.match(lmp.interpretation.detail, /Gestational age: 38 weeks & 2 days/);

  // MDCalc omits the gestational-age row when EGA is the entered input.
  const egaToday = calculateDueDates({ mode: "ega-today", cycleLength: 28, egaWeeks: 39, egaDays: 2, todayISO: "2026-09-26" });
  assert.ok(!egaToday.interpretation.detail.includes("Gestational age:"));
  assert.equal(egaToday.interpretation.headline, "Due date: Thursday, Oct 1, 2026");
}

// ---- Patient bindings ----
{
  assert.equal(parseAgeYears("28-year-old G3P2 at 39w2d"), 28);
  assert.equal(parseAgeYears("Age: 34, admitted for induction"), 34);
  assert.equal(parseAgeYears("no age here"), null);

  assert.deepEqual(parseEgaParts("EGA 39w2d"), { weeks: 39, days: 2 });
  assert.deepEqual(parseEgaParts("39 2/7 weeks gestation"), { weeks: 39, days: 2 });
  assert.equal(parseEgaParts("nothing"), null);

  assert.equal(parseLmpISO("LMP 1/15/26"), "2026-01-15");
  assert.equal(parseLmpISO("LMP: 01-15-2026"), "2026-01-15");
  assert.equal(parseLmpISO("no lmp"), null);

  const sources = [
    { sourceKind: "vital_signs", text: "Vitals\n@ 09/26 08:00: Weight 70 kg", label: "Admission \u2014 Vitals" },
    { sourceKind: "history_present_illness", text: "32-year-old, Height 165 cm noted.", label: "Admission \u2014 HPI" }
  ];
  const weight = latestVitalValue(sources, [/weight/i]);
  assert.equal(weight.value, 70);
  assert.equal(weight.unit, "kg");
  const height = latestVitalValue(sources, [/height/i]);
  assert.equal(height.value, 165);
  assert.equal(height.unit, "cm");
  assert.equal(latestVitalValue(sources, [/platelets/i]), null);

  const patient = {
    contextSections: [
      { sourceKind: "history_present_illness", label: "HPI", deidentifiedText: "28-year-old G3P2 at 39w2d. LMP 1/2/26." },
      { sourceKind: "vital_signs", label: "Vitals", deidentifiedText: "Vitals\n@ 09/26 08:00: Weight 70 kg" }
    ],
    days: []
  };
  const bindings = resolveScoreBindings(patient, "");
  assert.equal(bindings["vbac-mfmu"].ageYears.value, 28);
  assert.equal(bindings["vbac-mfmu"].prepregnancyWeight.value, 70);
  assert.equal(bindings["vbac-mfmu"].prepregnancyWeight.unit, "kg");
  assert.equal(bindings["vbac-flamm"].ageUnder40.value, 2);
  assert.equal(bindings["due-dates"].dateISO.value, "2026-01-02");
  assert.equal(bindings["due-dates"].egaWeeks.value, 39);
  assert.equal(bindings["due-dates"].egaDays.value, 2);
  assert.deepEqual(resolveScoreBindings(null, ""), {});

  // Temperature pulls honor preferUnit "°C": °F converts, unmarked stays manual.
  const tempPatient = (text) => ({
    contextSections: [{ sourceKind: "vital_signs", label: "Vitals", deidentifiedText: text }],
    days: []
  });
  const fBindings = resolveScoreBindings(tempPatient("Vitals\nTemp 98.6°F"), "");
  assert.equal(fBindings["autoscore-mortality"].temperature.value, 37);
  assert.equal(fBindings["autoscore-mortality"].temperature.unit, "°C");
  assert.equal(fBindings["easp-sepsis"].temp.value, 37);
  const cBindings = resolveScoreBindings(tempPatient("Vitals\nTemp 37.2 °C"), "");
  assert.equal(cBindings["autoscore-mortality"].temperature.value, 37.2);
  const unmarkedBindings = resolveScoreBindings(tempPatient("Vitals\nTemp 37.0"), "");
  assert.equal(unmarkedBindings["autoscore-mortality"]?.temperature, undefined, "unmarked temp is not guessed");
}

console.log("clinical score parity tests passed");
