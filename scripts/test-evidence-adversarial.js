import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRecommendedExamChecklist,
  joinEvidenceCatalog,
  mergeLegacyPhysicalExamOverlay,
  parseCsv,
  rankEvidenceCandidates
} from "../evidence.js";

const baseRows = parseCsv(readFileSync("exam_technique_base.csv", "utf8"));
const overlayRows = parseCsv(readFileSync("exam_evidence_overlay.csv", "utf8"));
const legacyOverlayRows = parseCsv(readFileSync("physical_exam_evidence_overlay.csv", "utf8"));
const tagRows = parseCsv(readFileSync("retrieval_tag_dictionary.csv", "utf8"));
const sourceRows = parseCsv(readFileSync("source_registry.csv", "utf8"));
const catalog = joinEvidenceCatalog(
  baseRows,
  mergeLegacyPhysicalExamOverlay(baseRows, overlayRows, legacyOverlayRows),
  sourceRows
);

function rx(pattern) {
  return new RegExp(pattern, "i");
}

const adversarialCases = [
  {
    id: "adv_01_postop_pe",
    context: "Emergency admission: can't breathe after knee surgery with pleuritic pain, tachycardia, hypoxia, and one calf more swollen than the other.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|lateral lung sounds"), rx("heart sounds|jvp"), rx("lower extremity edema|dorsalis pedis|posterior tibial")],
    avoid: [rx("murphy|rebound|psoas|obturator"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_02_pneumonia_vs_pe",
    context: "Dyspnea with pleuritic chest pain, fever, productive cough, hypoxia, and asymmetric crackles.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|lateral lung sounds"), rx("lung percussion|fremitus"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_03_acs_nausea",
    context: "Crushing chest pressure with diaphoresis, nausea, radiation to left arm, and possible ACS.",
    require: [rx("blood pressure"), rx("heart rate"), rx("heart sounds"), rx("posterior lung sounds|respiratory rate")],
    avoid: [rx("murphy|psoas|obturator|rebound"), rx("babinski|vibration sense|visual acuity")]
  },
  {
    id: "adv_04_pericarditis",
    context: "Sharp chest pain worse lying flat and better leaning forward after viral illness; concern for pericarditis.",
    require: [rx("blood pressure|heart rate"), rx("heart sounds"), rx("jvp|radial pulses"), rx("posterior lung sounds|respiratory rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_05_pneumothorax",
    context: "Sudden one-sided chest pain and shortness of breath with decreased breath sounds; possible pneumothorax.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|lateral lung sounds"), rx("lung percussion"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|visual acuity")]
  },
  {
    id: "adv_06_asthma_wheeze",
    context: "Young adult can't breathe, wheezing after allergen exposure, using accessory muscles, no edema or orthopnea.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|anterior lung sounds|lateral lung sounds"), rx("blood pressure|heart rate")],
    avoid: [rx("lower extremity edema|pmi|apical impulse"), rx("murphy|rebound|cva tenderness")]
  },
  {
    id: "adv_07_hf_aki",
    context: "Dyspnea, orthopnea, PND, crackles, bilateral leg edema, rising creatinine, and possible heart failure needing diuresis.",
    require: [rx("jvp"), rx("lower extremity edema"), rx("posterior lung sounds"), rx("heart sounds"), rx("blood pressure|respiratory rate")],
    avoid: [rx("murphy|psoas|obturator"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_08_cough_fever_sputum",
    context: "Fever, chills, productive cough, rusty sputum, pleuritic pain, and low oxygen saturation.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|lateral lung sounds"), rx("lung percussion|fremitus"), rx("blood pressure|heart rate")],
    avoid: [rx("pmi|lower extremity edema"), rx("babinski|visual acuity")]
  },
  {
    id: "adv_09_hemoptysis_weight_loss",
    context: "Hemoptysis with night sweats, weight loss, chronic cough, and possible malignancy or tuberculosis.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|lateral lung sounds"), rx("nodes|supraclavicular"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_10_stridor_airway",
    context: "Noisy breathing with stridor, throat tightness, hoarse voice, drooling, and airway concern.",
    require: [rx("respiratory rate"), rx("oropharynx|mouth exam"), rx("blood pressure|heart rate"), rx("posterior lung sounds|anterior lung sounds")],
    avoid: [rx("murphy|rebound|psoas"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_11_melena_dizzy",
    context: "Black stool, dizziness on standing, fatigue, and concern for upper GI bleeding.",
    require: [rx("blood pressure"), rx("heart rate"), rx("sclerae and conjunctivae|mouth exam"), rx("abdominal palpation|abdominal inspection")],
    avoid: [rx("vibration sense|visual acuity"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_12_hematemesis",
    context: "Vomiting blood with epigastric pain, lightheadedness, and possible hemodynamically significant GI bleed.",
    require: [rx("blood pressure"), rx("heart rate"), rx("sclerae and conjunctivae|mouth exam"), rx("abdominal palpation")],
    avoid: [rx("visual acuity|vibration sense"), rx("babinski|pronator drift")]
  },
  {
    id: "adv_13_ruq_jaundice",
    context: "Right upper quadrant pain, fever, jaundice, dark urine, and concern for cholangitis or cholecystitis.",
    require: [rx("blood pressure|heart rate"), rx("sclerae and conjunctivae"), rx("murphy"), rx("liver edge|liver span|abdominal palpation")],
    avoid: [rx("vibration sense|visual acuity"), rx("pmi|carotids")]
  },
  {
    id: "adv_14_rlq_appendicitis",
    context: "Right lower quadrant abdominal pain with anorexia, fever, guarding, and concern for appendicitis.",
    require: [rx("blood pressure|heart rate"), rx("abdominal palpation"), rx("rebound|psoas|obturator"), rx("bowel sounds")],
    avoid: [rx("jvp|pmi"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_15_pancreatitis",
    context: "Severe epigastric abdominal pain radiating to the back with vomiting after alcohol binge; concern for pancreatitis.",
    require: [rx("blood pressure|heart rate"), rx("abdominal palpation"), rx("bowel sounds|abdominal inspection"), rx("mouth exam|jvp")],
    avoid: [rx("psoas|obturator"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_16_bowel_obstruction",
    context: "Crampy belly pain, vomiting, distension, no flatus, and possible bowel obstruction.",
    require: [rx("abdominal inspection"), rx("bowel sounds"), rx("abdominal percussion|abdominal palpation"), rx("blood pressure|heart rate")],
    avoid: [rx("visual acuity|babinski"), rx("pmi|carotids")]
  },
  {
    id: "adv_17_gerd_no_alarm",
    context: "Burning heartburn after meals without weight loss, GI bleeding, dysphagia, chest pressure, or dyspnea.",
    require: [rx("abdominal palpation|abdominal inspection"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|psoas|obturator"), rx("vibration sense|visual acuity|babinski")]
  },
  {
    id: "adv_18_dysphagia_weight_loss",
    context: "Progressive dysphagia to solids with weight loss and hoarse voice.",
    require: [rx("mouth exam|oropharynx"), rx("nodes|supraclavicular"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|psoas|obturator"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_19_jaundice_pruritus",
    context: "New jaundice, itching, dark urine, pale stools, early satiety, and weight loss.",
    require: [rx("sclerae and conjunctivae"), rx("liver edge|liver span|abdominal palpation"), rx("nodes|supraclavicular|spleen"), rx("blood pressure|heart rate")],
    avoid: [rx("vibration sense|babinski"), rx("pmi|carotids")]
  },
  {
    id: "adv_20_dysuria_pyelo",
    context: "Burning pee with fever, chills, flank pain, nausea, and concern for pyelonephritis.",
    require: [rx("cva tenderness"), rx("blood pressure|heart rate"), rx("abdominal palpation"), rx("mouth exam|jvp")],
    avoid: [rx("visual acuity|vibration sense"), rx("pmi|carotids")]
  },
  {
    id: "adv_21_painless_hematuria",
    context: "Painless gross hematuria with weight loss and smoking history; no flank pain or dysuria.",
    require: [rx("blood pressure|heart rate"), rx("abdominal palpation|abdominal inspection"), rx("cva tenderness|nodes|supraclavicular")],
    avoid: [rx("murphy|psoas|obturator|rebound"), rx("vibration sense|visual acuity")]
  },
  {
    id: "adv_22_oliguria_hypovolemia",
    context: "Barely peeing after three days of poor intake and vomiting; dry mouth, dizziness, and rising creatinine.",
    require: [rx("blood pressure"), rx("heart rate"), rx("mouth exam"), rx("jvp|radial pulses")],
    avoid: [rx("murphy|psoas|obturator"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_23_scrotal_torsion",
    context: "Sudden severe testicular pain with nausea and scrotal swelling; concern for torsion.",
    require: [rx("blood pressure|heart rate"), rx("abdominal palpation|bowel sounds")],
    avoid: [rx("murphy|psoas|obturator|liver edge|spleen"), rx("visual acuity|vibration sense")]
  },
  {
    id: "adv_24_thunderclap_meningitis",
    context: "Worst headache of life with fever, neck stiffness, photophobia, confusion, and meningitis or SAH concern.",
    require: [rx("blood pressure|heart rate|respiratory rate"), rx("pupils"), rx("extraocular|visual acuity|visual fields"), rx("pronator drift|gait|babinski")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_25_migraine_visual",
    context: "Severe unilateral headache with photophobia, blurry vision, nausea, and no limb weakness.",
    require: [rx("pupils"), rx("visual acuity|visual fields"), rx("extraocular"), rx("blood pressure|heart rate")],
    avoid: [rx("babinski|vibration sense|patellar reflex"), rx("murphy|rebound")]
  },
  {
    id: "adv_26_stroke_face_speech",
    context: "New face droop, slurred speech, aphasia, and right arm weakness; stroke alert.",
    require: [rx("facial symmetry|eye closure"), rx("pronator drift"), rx("pupils|extraocular|visual fields"), rx("deltoid|wrist|finger abduction|extremity light touch")],
    avoid: [rx("murphy|cva tenderness"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_27_vertigo_ataxia",
    context: "Acute vertigo with nystagmus, vomiting, ataxia, and unable to walk straight.",
    require: [rx("extraocular|pupils"), rx("gait|romberg|tandem"), rx("finger to nose|heel to shin|rapid alternating"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_28_seizure_postictal",
    context: "First seizure with postictal confusion, tongue bite, fever absent, and no trauma reported.",
    require: [rx("blood pressure|heart rate|respiratory rate"), rx("pupils"), rx("pronator drift|facial symmetry"), rx("gait|babinski|extremity light touch")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_29_diabetic_neuropathy_feet",
    context: "Diabetes with numb feet, burning toes, foot ulcer concern, and discharge planning.",
    require: [rx("dorsalis pedis|posterior tibial"), rx("vibration sense|proprioception|extremity light touch"), rx("ankle dorsiflexion|heel walking|toe walking"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|psoas"), rx("visual acuity|ophthalmoscopic")]
  },
  {
    id: "adv_30_cord_compression",
    context: "Severe back pain with leg weakness, saddle anesthesia, urinary retention, and possible cord compression.",
    require: [rx("hip flexion|knee extension|ankle dorsiflexion"), rx("patellar reflex|achilles|babinski"), rx("extremity light touch|extremity pinprick"), rx("gait|heel walking|toe walking")],
    avoid: [rx("visual acuity|extraocular|facial symmetry"), rx("murphy|cva tenderness")]
  },
  {
    id: "adv_31_neck_fever_photophobia",
    context: "Neck pain with fever, photophobia, confusion, and concern for meningitis.",
    require: [rx("blood pressure|heart rate|respiratory rate"), rx("pupils"), rx("extraocular|visual acuity"), rx("oropharynx|mouth exam")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("pmi|lower extremity edema")]
  },
  {
    id: "adv_32_shoulder_fall",
    context: "Shoulder pain after fall with limited abduction and concern for rotator cuff injury.",
    require: [rx("shoulder"), rx("abduction|range of motion"), rx("empty can|hawkins|palpate shoulders")],
    avoid: [rx("murphy|cva tenderness"), rx("visual acuity|pupils|babinski")]
  },
  {
    id: "adv_33_hot_swollen_knee",
    context: "Hot swollen knee with fever and unable to bear weight; concern for septic arthritis.",
    require: [rx("blood pressure|heart rate"), rx("inspect knees|knee inspection"), rx("palpate knees|knee palpation"), rx("knee.*range|ballottement")],
    avoid: [rx("visual acuity|pupils|babinski"), rx("pmi|jvp")]
  },
  {
    id: "adv_34_morning_stiffness_hands",
    context: "Morning stiffness, swollen MCP and PIP joints, hand pain, and possible inflammatory arthritis.",
    require: [rx("inspect hands"), rx("palpate.*mcp|palpate.*pip|hand palpation"), rx("finger flexion|finger extension|range of motion")],
    avoid: [rx("murphy|cva tenderness"), rx("visual acuity|pupils|babinski")]
  },
  {
    id: "adv_35_ankle_sprain",
    context: "Ankle pain and swelling after twisting injury; cannot bear weight.",
    require: [rx("inspect ankles|ankle inspection"), rx("palpate ankles|ankle palpation"), rx("dorsiflexion|plantarflexion|inversion|eversion")],
    avoid: [rx("visual acuity|pupils|babinski"), rx("murphy|jvp|pmi")]
  },
  {
    id: "adv_36_rash_fever_mucosa",
    context: "Diffuse rash with fever, mouth sores, red eyes, and concern for severe drug eruption.",
    require: [rx("mouth exam|oropharynx"), rx("sclerae and conjunctivae"), rx("blood pressure|heart rate|respiratory rate")],
    avoid: [rx("pmi|jvp|carotids"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_37_hives_airway",
    context: "Hives with wheezing, throat tightness, lip swelling, and possible anaphylaxis.",
    require: [rx("respiratory rate"), rx("posterior lung sounds|anterior lung sounds"), rx("oropharynx|mouth exam"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|visual acuity")]
  },
  {
    id: "adv_38_diabetic_foot_ulcer",
    context: "Diabetic patient with non-healing foot ulcer, numbness, and concern for poor perfusion.",
    require: [rx("dorsalis pedis|posterior tibial"), rx("extremity light touch|vibration sense|proprioception"), rx("ankle dorsiflexion|heel walking|toe walking")],
    avoid: [rx("murphy|rebound|psoas"), rx("visual acuity|ophthalmoscopic")]
  },
  {
    id: "adv_39_lymphoma_glands",
    context: "Swollen glands with night sweats, weight loss, and concern for lymphoma.",
    require: [rx("anterior cervical nodes|posterior cervical nodes|supraclavicular"), rx("spleen"), rx("mouth exam|oropharynx"), rx("blood pressure|heart rate")],
    avoid: [rx("pmi|jvp"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_40_bleeding_gums_bruising",
    context: "Easy bruising, petechiae, bleeding gums, fatigue, and possible thrombocytopenia.",
    require: [rx("mouth exam|oropharynx"), rx("sclerae and conjunctivae"), rx("blood pressure|heart rate")],
    avoid: [rx("visual acuity|babinski|vibration sense"), rx("murphy|psoas|obturator")]
  },
  {
    id: "adv_41_epistaxis_warfarin",
    context: "Nosebleeds on warfarin with dizziness and fatigue.",
    require: [rx("blood pressure"), rx("heart rate"), rx("nasal|nose|mouth exam|oropharynx"), rx("sclerae and conjunctivae")],
    avoid: [rx("murphy|cva tenderness"), rx("babinski|vibration sense")]
  },
  {
    id: "adv_42_pallor_dyspnea",
    context: "Pallor, fatigue, exertional shortness of breath, and possible severe anemia.",
    require: [rx("blood pressure|heart rate|respiratory rate"), rx("sclerae and conjunctivae"), rx("posterior lung sounds|heart sounds")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_43_sepsis_no_source",
    context: "Fever, rigors, hypotension, confusion, tachypnea, and sepsis with unclear source.",
    require: [rx("blood pressure"), rx("heart rate"), rx("respiratory rate"), rx("posterior lung sounds|abdominal palpation|cva tenderness|oropharynx")],
    avoid: [rx("pmi|apical impulse"), rx("vibration sense|visual acuity")]
  },
  {
    id: "adv_44_sore_throat_drooling",
    context: "Severe sore throat with muffled voice, drooling, fever, and possible deep neck infection.",
    require: [rx("oropharynx|mouth exam"), rx("nodes"), rx("respiratory rate"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|babinski")]
  },
  {
    id: "adv_45_ear_pain_vertigo",
    context: "Earache with fever, hearing changes, vertigo, and nausea.",
    require: [rx("otoscope|external ears"), rx("extraocular|pupils"), rx("gait|romberg"), rx("blood pressure|heart rate")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("pmi|jvp")]
  },
  {
    id: "adv_46_contact_lens_red_eye",
    context: "Red painful eye in contact lens wearer with photophobia and blurry vision.",
    require: [rx("visual acuity"), rx("sclerae and conjunctivae"), rx("pupils"), rx("extraocular")],
    avoid: [rx("posterior lung sounds|cva tenderness|bowel sounds"), rx("pmi|jvp")]
  },
  {
    id: "adv_47_palpitations_weight_loss",
    context: "Palpitations, heat intolerance, weight loss, tremor, diarrhea, and possible Graves disease.",
    require: [rx("heart rate"), rx("blood pressure"), rx("thyroid"), rx("heart sounds")],
    avoid: [rx("murphy|rebound|psoas"), rx("vibration sense|visual acuity")]
  },
  {
    id: "adv_48_cold_intolerance_fatigue",
    context: "Fatigue, cold intolerance, constipation, weight gain, bradycardia, and possible hypothyroidism.",
    require: [rx("heart rate"), rx("blood pressure|respiratory rate"), rx("thyroid"), rx("sclerae and conjunctivae|mouth exam")],
    avoid: [rx("murphy|rebound|psoas"), rx("visual acuity|babinski")]
  },
  {
    id: "adv_49_hypertension_headache_vision",
    context: "Very high blood pressure with headache, blurry vision, chest discomfort, and concern for hypertensive emergency.",
    require: [rx("blood pressure"), rx("heart rate"), rx("pupils|visual acuity|visual fields"), rx("heart sounds|posterior lung sounds")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("vibration sense|proprioception")]
  },
  {
    id: "adv_50_exertional_syncope_murmur",
    context: "Syncope during exertion with systolic murmur, palpitations, and no focal neurologic symptoms.",
    require: [rx("blood pressure"), rx("heart rate"), rx("heart sounds"), rx("radial pulses|carotids|jvp")],
    avoid: [rx("murphy|rebound|cva tenderness"), rx("finger to nose|heel to shin|vibration sense")]
  }
];

function recommendedFor(context) {
  const ranked = rankEvidenceCandidates(catalog, context, tagRows, {
    maxCandidates: 80,
    specialty: "General medicine"
  });
  const recommendation = buildRecommendedExamChecklist(context, ranked, {
    specialty: "General medicine",
    maxCoreItems: 28,
    maxConditionalItems: 42
  });
  return {
    ranked,
    recommendation,
    entries: [...recommendation.coreItems, ...recommendation.conditionalItems]
  };
}

function entryText(entry) {
  const candidate = entry.candidate || {};
  return [
    entry.label,
    entry.domain,
    candidate.examLabel,
    candidate.maneuver,
    candidate.section,
    candidate.system,
    candidate.retrieval_tags
  ].filter(Boolean).join(" ");
}

function evaluateCase(testCase) {
  const result = recommendedFor(testCase.context);
  const recommendedText = result.entries.map(entryText).join(" | ");
  const coreText = result.recommendation.coreItems.map(entryText).join(" | ");
  const missing = (testCase.require || []).filter((pattern) => !pattern.test(recommendedText));
  const missingCore = (testCase.requireCore || []).filter((pattern) => !pattern.test(coreText));
  const avoidHits = (testCase.avoid || []).filter((pattern) => pattern.test(recommendedText));
  const empty = result.entries.length === 0;
  return {
    id: testCase.id,
    pass: !empty && !missing.length && !missingCore.length && !avoidHits.length,
    empty,
    missing: missing.map((pattern) => pattern.source),
    missingCore: missingCore.map((pattern) => pattern.source),
    avoidHits: avoidHits.map((pattern) => pattern.source),
    core: result.recommendation.coreItems.map((entry) => entry.label),
    conditional: result.recommendation.conditionalItems.map((entry) => entry.label),
    matchedTags: result.ranked.matchedTags.map((match) => match.tag)
  };
}

const results = adversarialCases.map(evaluateCase);
const failures = results.filter((result) => !result.pass);

if (process.argv.includes("--report-only")) {
  console.log(JSON.stringify({
    total: results.length,
    failures: failures.length,
    results: failures
  }, null, 2));
} else {
  assert.equal(adversarialCases.length, 50, "adversarial harness should contain exactly 50 difficult examples");
  assert.equal(
    failures.length,
    0,
    failures.map((failure) => [
      `${failure.id}:`,
      failure.empty ? "empty recommendation" : "",
      failure.missing.length ? `missing ${failure.missing.join(", ")}` : "",
      failure.missingCore.length ? `missing core ${failure.missingCore.join(", ")}` : "",
      failure.avoidHits.length ? `avoid hits ${failure.avoidHits.join(", ")}` : "",
      `core [${failure.core.join("; ")}]`,
      `conditional [${failure.conditional.slice(0, 12).join("; ")}]`,
      `tags [${failure.matchedTags.join("; ")}]`
    ].filter(Boolean).join(" ")
    ).join("\n")
  );
  console.log("Adversarial evidence tests passed for 50 difficult examples.");
}
