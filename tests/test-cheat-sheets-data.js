// Regression test for src/data/cheat-sheets.json.
//
// The interactive Workups/Checklist features were removed in 2026-09-29 and
// their authoring sources (workups/admission/*.workup.json) deleted after the
// clinical content was extracted verbatim into this bundle. This test guards
// the extraction with a frozen manifest captured from the source files before
// deletion: sheet order, ids, titles, aliases, per-sheet item counts, and a
// SHA-256 over every source item's kind/id/system/text/choices. Any dropped
// or altered history question or exam maneuver fails the hash.
//
// Node built-ins only. Run from the repo root:
//   node tests/test-cheat-sheets-data.js

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHEAT_SHEETS_DATA } from "../src/data/cheat-sheets.data.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The generated JS data module the app actually imports must carry the exact
// same payload as the JSON source of truth; regenerate it with
// `npm run build:cheat-sheets-data` if this fails.
const bundleFromJson = JSON.parse(readFileSync(join(root, "src", "data", "cheat-sheets.json"), "utf8"));
assert.deepStrictEqual(CHEAT_SHEETS_DATA, bundleFromJson, "cheat-sheets.data.js drifted from cheat-sheets.json");
const bundle = JSON.parse(readFileSync(join(root, "src", "data", "cheat-sheets.json"), "utf8"));

// Frozen 2026-09-29 from workups/admission/*.workup.json (prerounding_workup_v1),
// 50 sheets / 673 history + 514 exam items, plus 6 OB/GYN sheets authored the
// same day from Aaron's OB/GYN History Interview Prompt Sheet
// (56 sheets / 725 history + 514 exam items). itemsHash = sha256 over each
// source item's kind|id|system|text|choices joined by \x00.
const FROZEN = [
    {
      "id": "dyspnea",
      "title": "Shortness of breath / dyspnea",
      "aliases": [
        "shortness of breath",
        "breathlessness"
      ],
      "history": 16,
      "exam": 14,
      "itemsHash": "b655d6c12197d874545cd7c1520083f7db7cae17cf5140a17939a2760d5f3bcf"
    },
    {
      "id": "chest-pain",
      "title": "Chest pain",
      "aliases": [
        "chest discomfort",
        "angina"
      ],
      "history": 17,
      "exam": 11,
      "itemsHash": "66b516ade81cdc49845d11adc96baa2717c7b43d9af016f5523e495b94c00dc5"
    },
    {
      "id": "abdominal-pain",
      "title": "Abdominal pain",
      "aliases": [
        "acute abdomen",
        "stomach pain"
      ],
      "history": 16,
      "exam": 11,
      "itemsHash": "740b6a5daa5995c29ddd1b3d2cd10603f18547756430d5ffec705a811d4b965a"
    },
    {
      "id": "fever-suspected-infection",
      "title": "Fever / suspected infection",
      "aliases": [
        "fever",
        "infection"
      ],
      "history": 18,
      "exam": 11,
      "itemsHash": "ee282a63e9ccd5daed79a734722e804147c5649c32c2dcf09c24949c59695b57"
    },
    {
      "id": "generalized-weakness",
      "title": "Generalized weakness / non-specific decline",
      "aliases": [
        "weakness",
        "decline"
      ],
      "history": 17,
      "exam": 11,
      "itemsHash": "11dc600de69eb067578a4d26243d1c56ddb106f6267538666e81632dfa2783f2"
    },
    {
      "id": "sepsis-septic-shock",
      "title": "Sepsis / septic shock",
      "aliases": [
        "sepsis",
        "septic shock"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "741f8a7fdef9af2011335c91b1f7baf6e89fd8a67741a473b2c2138b84e031db"
    },
    {
      "id": "pneumonia",
      "title": "Pneumonia (community- or hospital-acquired)",
      "aliases": [
        "pneumonia",
        "lower respiratory infection"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "b032022c21d26c410b7b734dd7b1e1673f3432948872667e6ff0b2323d3f2ad3"
    },
    {
      "id": "acute-decompensated-heart-failure",
      "title": "Congestive heart failure exacerbation (ADHF)",
      "aliases": [
        "heart failure",
        "ADHF",
        "fluid overload"
      ],
      "history": 14,
      "exam": 12,
      "itemsHash": "9828485e097d7bb9c8b7a7a62024bc2bfd3aead1f25d519a5eb81feea1a5ce4d"
    },
    {
      "id": "copd-exacerbation",
      "title": "COPD exacerbation",
      "aliases": [
        "COPD flare",
        "emphysema exacerbation"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "c04b1b31439cde31aa63a59c1bdbf750e807c4d7843cb3eb7afbeda68e077a14"
    },
    {
      "id": "urinary-tract-infection",
      "title": "Urinary tract infection",
      "aliases": [
        "UTI",
        "pyelonephritis"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "55541d3d9efba82a3d850753b2d4346d4821d9c25181dceb5c965f341e30b3df"
    },
    {
      "id": "altered-mental-status-delirium",
      "title": "Altered mental status / delirium",
      "aliases": [
        "confusion",
        "delirium"
      ],
      "history": 15,
      "exam": 12,
      "itemsHash": "58a8c4480c4b5f5a7216eb5311ca9eb88ad2a62ffadea8fdd39884aad745bebc"
    },
    {
      "id": "syncope-presyncope",
      "title": "Syncope or presyncope",
      "aliases": [
        "fainting",
        "passing out"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "559aa96b1d6f9f732de01872cc22e5cf9742cda822935ca04f0c0b67e8ba4da6"
    },
    {
      "id": "atrial-fibrillation-rvr",
      "title": "Atrial fibrillation with rapid ventricular rate",
      "aliases": [
        "afib with RVR",
        "rapid atrial fibrillation"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "5e987c4d6e669ee0a150d2bd6b6b4fe24ee036c5cd970ed9888b93e07819a85c"
    },
    {
      "id": "acute-coronary-syndrome",
      "title": "Acute coronary syndrome / NSTEMI/STEMI",
      "aliases": [
        "heart attack",
        "myocardial infarction",
        "NSTEMI",
        "STEMI"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "b21a40c7659e97666ecd68dfa769e17076729603c5aab2b97f40ce09a1746a5b"
    },
    {
      "id": "stroke-tia",
      "title": "Stroke (CVA) or TIA",
      "aliases": [
        "cerebrovascular accident",
        "transient ischemic attack"
      ],
      "history": 14,
      "exam": 12,
      "itemsHash": "8be8c05041cd841bde3fd26e1e2d312bccec9ae9bfd7c3be1feeea64ded61fe6"
    },
    {
      "id": "cellulitis-ssti",
      "title": "Cellulitis / skin and soft tissue infection",
      "aliases": [
        "cellulitis",
        "skin infection",
        "abscess"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "dcff27ceac2d3309c9cb10bffefe0e0832274a743babcf404dd289e46a6da08a"
    },
    {
      "id": "dka-hhs",
      "title": "Diabetes mellitus with complications (DKA, HHS)",
      "aliases": [
        "diabetic ketoacidosis",
        "hyperosmolar hyperglycemic state"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "a1489b481187d8e691d44003b67579b4e0e9b543936541add9d79a52c6e5c169"
    },
    {
      "id": "acute-kidney-injury",
      "title": "Acute kidney injury",
      "aliases": [
        "AKI",
        "acute renal failure"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "4a4449c980e0eb21302cae7dae2f4fbd03f4f2dc6f59a13ebabcc5a0ffff1e4c"
    },
    {
      "id": "upper-gastrointestinal-bleeding",
      "title": "Gastrointestinal bleeding (upper)",
      "aliases": [
        "upper GI bleed",
        "hematemesis"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "11f83596440f9a7ec43566689e08850768444bf8755ca4635598ee4aca111489"
    },
    {
      "id": "lower-gastrointestinal-bleeding",
      "title": "Gastrointestinal bleeding (lower)",
      "aliases": [
        "lower GI bleed",
        "hematochezia"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "3e0f79455c9fce0c1a864f4ff5cd73bb43415eed47f8b5015dbde5f7d36a5d74"
    },
    {
      "id": "hyponatremia",
      "title": "Electrolyte abnormality \u2013 hyponatremia",
      "aliases": [
        "low sodium",
        "SIADH"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "7604905ea539fc6461503f28632b1d89c06719c9fc1db0778bae80f57876d4f1"
    },
    {
      "id": "hyperkalemia",
      "title": "Electrolyte abnormality \u2013 hyperkalemia",
      "aliases": [
        "high potassium"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "894a6dfb550f741ac86757382f4931a623cb3c987983019d98c22627e64f6520"
    },
    {
      "id": "falls-fall-related-injury",
      "title": "Falls / fall-related injury",
      "aliases": [
        "fall",
        "mechanical fall"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "87d7660563b051e89a9a795889236664bd00cfe4c3f24be1cfa40f74970bce9f"
    },
    {
      "id": "dizziness-vertigo",
      "title": "Dizziness / vertigo",
      "aliases": [
        "vertigo",
        "lightheadedness"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "def218c5c189173b804120005c76eb919262eb9ed521b92e77b827f009438cc5"
    },
    {
      "id": "severe-new-headache",
      "title": "Headache (severe or new-onset)",
      "aliases": [
        "worst headache of life",
        "thunderclap headache"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "e7d5dd543ba6bc7734ba94ae92f718581797482a0d4fc16761f8f7e70fcb317e"
    },
    {
      "id": "anemia",
      "title": "Anemia (symptomatic or unexplained)",
      "aliases": [
        "low hemoglobin",
        "low hematocrit"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "9794e7d11127d497d219cdfe27f27ada8daad6a07ae2fa6eda582348beee075a"
    },
    {
      "id": "alcohol-withdrawal",
      "title": "Alcohol withdrawal",
      "aliases": [
        "delirium tremens",
        "DTs"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "de9b85fdf63dc8ebe728020a2c9be583bcc02611a72b30ec6f82c736d0b9af3a"
    },
    {
      "id": "acute-pancreatitis",
      "title": "Acute pancreatitis",
      "aliases": [
        "pancreatitis"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "dd96c3a5369f2ff077b477851731048eb10f13d02726d5c5d712625ddde21639"
    },
    {
      "id": "venous-thromboembolism",
      "title": "Venous thromboembolism (DVT/PE)",
      "aliases": [
        "deep vein thrombosis",
        "pulmonary embolism"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "cd5f50f0b9b6735b2a002153c9bd34273f62d5b73c91072b6e83f40a127f5a65"
    },
    {
      "id": "asthma-exacerbation",
      "title": "Asthma exacerbation",
      "aliases": [
        "asthma attack",
        "reactive airway"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "64be461d3af37eb36588092f5f75df79c99566c41da785f9e41c7e1c80a01754"
    },
    {
      "id": "clostridioides-difficile-colitis",
      "title": "Clostridium difficile colitis",
      "aliases": [
        "C. diff",
        "pseudomembranous colitis"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "6e42b0fd16facc4c2fda001b6304501da5cb94617dd7acae126fd31c7f13bfaa"
    },
    {
      "id": "diabetic-foot-infection",
      "title": "Diabetic foot infection",
      "aliases": [
        "diabetic foot ulcer",
        "foot infection"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "a7d29230b815153ee28e14d92858de1b4f76d49881fdba01fce30c8f21583624"
    },
    {
      "id": "hypertensive-urgency-emergency",
      "title": "Hypertensive urgency/emergency",
      "aliases": [
        "severe hypertension",
        "hypertensive emergency"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "c8155438fe8b8ca58ba9f096490e2ab44570b5c77432520e74f26dc848927f7d"
    },
    {
      "id": "uncontrolled-nausea-vomiting",
      "title": "Nausea and vomiting (uncontrolled)",
      "aliases": [
        "nausea",
        "vomiting"
      ],
      "history": 15,
      "exam": 10,
      "itemsHash": "ca86cb9141fb65b60f6e95875886187f6b68d92e11859753f4ab524c2dd226b4"
    },
    {
      "id": "severe-diarrhea",
      "title": "Diarrhea (severe/dehydrating)",
      "aliases": [
        "acute diarrhea",
        "dehydrating diarrhea"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "0c0804cf0a5a922bb370076f8e6fcd2a686d25a613a9499869b6ebf615357075"
    },
    {
      "id": "failure-to-thrive-functional-decline",
      "title": "Failure to thrive / functional decline (elderly)",
      "aliases": [
        "failure to thrive",
        "functional decline"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "bda435a0550d773d059feb0fff13a3c2ae3c7628a027179c41e04e95959198b3"
    },
    {
      "id": "back-pain-red-flags",
      "title": "Back pain (with red flags/neuro deficits)",
      "aliases": [
        "back pain",
        "spinal cord compression"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "e97edb8db0dfcc7332f89147dbc95d2d6533e77925d7c469d9d5f310428d2f56"
    },
    {
      "id": "cirrhosis-liver-complications",
      "title": "Cirrhosis/liver disease complications",
      "aliases": [
        "cirrhosis",
        "hepatic decompensation"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "2478b0c3ff7748f7f34ae04a0b36b8c7910405f5eb8619730b06b2c82adb2d5b"
    },
    {
      "id": "adrenal-insufficiency-crisis",
      "title": "Adrenal insufficiency / adrenal crisis",
      "aliases": [
        "adrenal crisis",
        "adrenal insufficiency"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "1dcbe1ab9a27269b52e666824f66c3a7408ff2d9a0e083e6717392e0bd4b1e72"
    },
    {
      "id": "seizure-new-onset",
      "title": "Seizure / new-onset seizure disorder",
      "aliases": [
        "new seizure",
        "convulsion"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "2cd2cb216d301b41a21a42d1e7fbefc92c3b9193e0d1ceef3ab501f4a349111d"
    },
    {
      "id": "hyperglycemia-non-dka",
      "title": "Hyperglycemia (non-DKA)",
      "aliases": [
        "hyperglycemia",
        "high blood glucose"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "d63242b4f5791b9339745d78d1956224b53efae8e7b4f3ab64d66a36ba14fc05"
    },
    {
      "id": "bowel-obstruction",
      "title": "Bowel obstruction",
      "aliases": [
        "small bowel obstruction",
        "SBO",
        "large bowel obstruction"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "cbc8ac78a249d8e09c9d3ddce1afe744a2bb9a1b0c8abd21b6dcd688e0ed9fba"
    },
    {
      "id": "cholecystitis-biliary-colic",
      "title": "Cholecystitis / biliary colic",
      "aliases": [
        "cholecystitis",
        "biliary colic",
        "gallbladder pain"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "c815641833ae6d3df5327bf0e6d609e6ebed29e65407892a54851e281c2c2f62"
    },
    {
      "id": "osteoarthritis-joint-pain",
      "title": "Osteoarthritis-related admission/joint pain",
      "aliases": [
        "osteoarthritis",
        "joint pain"
      ],
      "history": 11,
      "exam": 10,
      "itemsHash": "2049e419bc87abf71af4a85e7c121101efce29ed8c8fb81a35127b7de75bf01f"
    },
    {
      "id": "rheumatoid-arthritis-flare-joint-infection",
      "title": "Rheumatoid arthritis flare/joint infection",
      "aliases": [
        "rheumatoid arthritis flare",
        "septic arthritis"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "688bcb8b6874235a3a5f9771bcdfb1f3383e6c6c0aa6d0602296c8ee65ac1ca2"
    },
    {
      "id": "psychiatric-crisis-medical-comorbidity",
      "title": "Psychiatric crisis with medical comorbidity",
      "aliases": [
        "psychiatric crisis",
        "medical clearance"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "0135775b449e4ea712b818aebf2693afd1acb6d29ef202be2c2f65cfcff50660"
    },
    {
      "id": "substance-use-complications",
      "title": "Substance use disorder complications",
      "aliases": [
        "substance use",
        "intoxication",
        "withdrawal"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "cfc0959fd61d2802dcd93d50fb06aed528c3efc597ddfaffd51ab0ab89ba2ed8"
    },
    {
      "id": "social-admission-placement-caregiver-failure",
      "title": "Social admission (placement/caregiver failure)",
      "aliases": [
        "placement",
        "caregiver failure",
        "social admission"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "e729bd29a088582ff7777b6ffbc96b28fee50b5027096d4c6dc4c25d7ff7deb0"
    },
    {
      "id": "fever-of-unknown-origin",
      "title": "Fever of unknown origin",
      "aliases": [
        "FUO",
        "persistent fever",
        "unexplained fever"
      ],
      "history": 11,
      "exam": 10,
      "itemsHash": "63f8f8b69e4e98f9be0df34f72677a6cea7b035d13f24f29447fb5bc45c9ebe1"
    },
    {
      "id": "subacute-bacterial-endocarditis",
      "title": "Subacute bacterial endocarditis",
      "aliases": [
        "infective endocarditis",
        "SBE"
      ],
      "history": 10,
      "exam": 10,
      "itemsHash": "65f923a241f569eb5c14549127be3d35e53e5772d12c89dd996a4cf2f3a59442"
    },
    {
      "id": "ob-labor-triage",
      "title": "Labor triage & current pregnancy",
      "aliases": [
        "labor",
        "triage",
        "pregnancy",
        "labor check",
        "contractions",
        "vaginal bleeding in pregnancy"
      ],
      "history": 13,
      "exam": 0,
      "itemsHash": "a6a8934011f35bda7a1fa747d0b7487a2ac29fad237949bdb4d5433403210789"
    },
    {
      "id": "ob-menstrual-menopause",
      "title": "Menstrual history & menopause",
      "aliases": [
        "periods",
        "menstruation",
        "LMP",
        "menopause",
        "abnormal uterine bleeding",
        "intermenstrual bleeding"
      ],
      "history": 9,
      "exam": 0,
      "itemsHash": "2dd0c4ba225eb35fb18402d3d6f8902abc2be84c8c5ec465e8a6e59e9a6b4599"
    },
    {
      "id": "ob-obstetric-history",
      "title": "Obstetric history (GTPAL)",
      "aliases": [
        "GTPAL",
        "gravida para",
        "obstetric history",
        "pregnancy history",
        "postpartum",
        "postpartum hemorrhage"
      ],
      "history": 7,
      "exam": 0,
      "itemsHash": "a5d698271803af2e23bf8e273e540337f4e7e188057a748b0bdf59bedd4aa4a7"
    },
    {
      "id": "ob-gyn-history-screening",
      "title": "GYN history, screening & pelvic floor",
      "aliases": [
        "gyn",
        "gynecology",
        "pap smear",
        "cervical screening",
        "pelvic floor",
        "incontinence",
        "prolapse",
        "mammogram"
      ],
      "history": 8,
      "exam": 0,
      "itemsHash": "d49e8d6f1235845ec94ab0e8b8c2e4da13b54a5eab2dfb050f92f5a1340df7ee"
    },
    {
      "id": "ob-sexual-history",
      "title": "Sexual history: 5 Ps + PLUS",
      "aliases": [
        "sexual history",
        "5 Ps",
        "STI",
        "sexually transmitted infection",
        "partners"
      ],
      "history": 7,
      "exam": 0,
      "itemsHash": "11cf438e276e8166d928bcbd132ffdc802da14822efa6048fd13b10aa16328a7"
    },
    {
      "id": "ob-safety-close",
      "title": "OB/GYN do-not-miss, safety & close",
      "aliases": [
        "IPV",
        "intimate partner violence",
        "safety",
        "do not miss",
        "one-liner",
        "family history"
      ],
      "history": 8,
      "exam": 0,
      "itemsHash": "57e00b719e3223bba6f0c23720dce9aafe0f2df59a1d3511fdf97951c93169b6"
    },
    {
      "id": "ld-preterm-labor",
      "title": "Preterm labor",
      "aliases": [
        "preterm labor",
        "PTL",
        "premature labor",
        "threatened preterm labor"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "c6de3246eef299ee002d98df1574c85b830bfe29b4ffbbd9c84c91c9ed982341"
    },
    {
      "id": "ld-prom",
      "title": "Premature rupture of membranes (PROM / PPROM)",
      "aliases": [
        "PROM",
        "PPROM",
        "ruptured membranes",
        "water broke"
      ],
      "history": 12,
      "exam": 9,
      "itemsHash": "bd3ef3b35a498f1502fa42854bfc2ed48db80414fb50baeb304a0a9b732bcdb9"
    },
    {
      "id": "ld-magnesium-check",
      "title": "Magnesium sulfate check",
      "aliases": [
        "magnesium check",
        "MgSO4",
        "mag check",
        "magnesium toxicity"
      ],
      "history": 10,
      "exam": 10,
      "itemsHash": "7776af0a67b84a7f7a2f735da412582a6447b8abea55d84b7cbb46757c7212c4"
    },
    {
      "id": "ld-term-labor",
      "title": "Term labor triage",
      "aliases": [
        "term labor",
        "labor check",
        "labor triage",
        "in labor?"
      ],
      "history": 13,
      "exam": 10,
      "itemsHash": "0f277f33f903894a64387b4f4d0e8eef2b38f21a024a3bf70b2151fadb2760bc"
    },
    {
      "id": "ld-antepartum-bleeding",
      "title": "Vaginal bleeding in pregnancy",
      "aliases": [
        "antepartum hemorrhage",
        "vaginal bleeding pregnant",
        "APH",
        "previa bleed",
        "abruption"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "7f98c3c87864dc3ca997fb8adec74a4f6c9308daf6778ee21a09d213a00e8c7e"
    },
    {
      "id": "ld-decreased-fetal-movement",
      "title": "Decreased fetal movement",
      "aliases": [
        "decreased fetal movement",
        "DFM",
        "reduced fetal movements",
        "kick counts",
        "fetal movement concern"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "8312ea280fc6328c9244d4760fe8daf4ccf31c331b40d1b40dc7ad1c8096c9de"
    },
    {
      "id": "ld-preeclampsia",
      "title": "Preeclampsia / hypertension in pregnancy",
      "aliases": [
        "preeclampsia",
        "pregnancy hypertension",
        "HTN pregnancy",
        "PIH",
        "severe features"
      ],
      "history": 12,
      "exam": 10,
      "itemsHash": "9e29be50db98e9829f8844eddf44f4a1092bd05151113c9df26d548fa32601ce"
    },
    {
      "id": "clinic-well-woman",
      "title": "Well-woman visit",
      "aliases": [
        "well-woman exam",
        "annual preventive visit",
        "wellness check",
        "Pap visit",
        "annual exam"
      ],
      "history": 16,
      "exam": 12,
      "itemsHash": "1dc3298e7404a12deee828bfa709f69f479091d668bbf59f8f8eddb1560de7a7"
    },
    {
      "id": "clinic-first-prenatal",
      "title": "First prenatal visit",
      "aliases": [
        "first prenatal visit",
        "new OB visit",
        "initial OB intake",
        "pregnancy intake visit",
        "dating visit"
      ],
      "history": 16,
      "exam": 12,
      "itemsHash": "5f8cce6270ef68b16045f9af4464b7e121c38918bc4fb12ce3a32537fbb61111"
    },
    {
      "id": "clinic-aub",
      "title": "Abnormal uterine bleeding",
      "aliases": [
        "abnormal uterine bleeding",
        "AUB",
        "heavy menstrual bleeding",
        "menorrhagia",
        "irregular bleeding"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "f759146b41ae52e60719cf3aaeab8417133af1962c5a7764999efdb327f6b13c"
    },
    {
      "id": "clinic-vaginal-discharge",
      "title": "Vaginal discharge",
      "aliases": [
        "vaginal discharge",
        "discharge",
        "BV",
        "yeast infection",
        "vaginitis"
      ],
      "history": 14,
      "exam": 10,
      "itemsHash": "8bbae7cb941a67210f6f95acc7fe449ef61066f7f742d90e90e0e5dd69c240fc"
    },
    {
      "id": "clinic-pelvic-pain",
      "title": "Pelvic pain",
      "aliases": [
        "pelvic pain",
        "lower abdominal pain",
        "dysmenorrhea",
        "torsion",
        "PID pain"
      ],
      "history": 14,
      "exam": 8,
      "itemsHash": "022643fe21a9d7944e01a3c3b8000fd43aa4ad45555e16b33ee083ebc40aedd9"
    },
    {
      "id": "clinic-contraception",
      "title": "Contraception counseling",
      "aliases": [
        "contraception",
        "birth control",
        "OCP",
        "IUD",
        "family planning"
      ],
      "history": 12,
      "exam": 4,
      "itemsHash": "1861b56e6f249bb4b0f59a786833d82ead00b619ab787338f51e0924ed025085"
    },
  ];

assert.strictEqual(bundle.version, 1, "bundle version must be 1");
assert.ok(Array.isArray(bundle.sheets), "bundle.sheets must be an array");
assert.strictEqual(bundle.sheets.length, FROZEN.length, `expected ${FROZEN.length} sheets, found ${bundle.sheets.length}`);

let filledWhy = 0;
let filledHow = 0;
bundle.sheets.forEach((sheet, index) => {
  const expected = FROZEN[index];
  assert.strictEqual(sheet.id, expected.id, `sheet at index ${index} should be ${expected.id}`);
  assert.strictEqual(sheet.title, expected.title, `title mismatch on sheet ${sheet.id}`);
  assert.deepStrictEqual(sheet.aliases, expected.aliases, `aliases mismatch on sheet ${sheet.id}`);
  assert.ok(Array.isArray(sheet.history) && Array.isArray(sheet.exam), `sheet ${sheet.id} history/exam must be arrays`);
  assert.strictEqual(sheet.history.length, expected.history, `history count mismatch on sheet ${sheet.id}`);
  assert.strictEqual(sheet.exam.length, expected.exam, `exam count mismatch on sheet ${sheet.id}`);

  const hash = createHash("sha256");
  const seen = new Set();
  for (const entry of sheet.history) {
    assert.ok(!seen.has(entry.id), `duplicate entry id ${entry.id} on sheet ${sheet.id}`);
    seen.add(entry.id);
    hash.update(["history", entry.id, entry.system, entry.question, (entry.listenFor || []).join(",")].join("|"), "utf8");
    hash.update("\x00");
    if (entry.why != null) filledWhy += 1;
  }
  for (const entry of sheet.exam) {
    assert.ok(!seen.has(entry.id), `duplicate entry id ${entry.id} on sheet ${sheet.id}`);
    seen.add(entry.id);
    hash.update(["exam", entry.id, entry.system, entry.maneuver, (entry.findings || []).join(",")].join("|"), "utf8");
    hash.update("\x00");
    if (entry.why != null) filledWhy += 1;
    if (entry.how != null) filledHow += 1;
  }
  assert.strictEqual(hash.digest("hex"), expected.itemsHash, `content hash mismatch on sheet ${sheet.id}: an item was dropped or altered`);

  for (const entry of [...sheet.history, ...sheet.exam]) {
    assert.strictEqual(typeof entry.system, "string", `system must be a string for ${sheet.id}/${entry.id}`);
    assert.strictEqual(entry.whySource, entry.why != null ? "curated" : null, `whySource must be "curated" iff why is filled, for ${sheet.id}/${entry.id}`);
    assert.doesNotMatch(String(entry.question || entry.maneuver || ""), /<input|<textarea|<select/i, `sheet ${sheet.id} must stay read-only`);
    // Every item carries clinical reasoning in `meaning` (rendered in the
    // expand region instead of answer-choice options). Curated items mirror
    // `why`; the rest are AI-drafted and flagged for clinician review.
    // itemsHash is unaffected: it covers kind|id|system|text|choices only.
    assert.strictEqual(typeof entry.meaning, "string", `meaning must be a string for ${sheet.id}/${entry.id}`);
    assert.ok(entry.meaning.trim().length > 0, `meaning must be non-empty for ${sheet.id}/${entry.id}`);
    assert.strictEqual(entry.meaningSource, entry.why != null ? "curated" : "ai-draft",
      `meaningSource must be "curated" iff why is filled, for ${sheet.id}/${entry.id}`);
    if (entry.why != null) {
      assert.strictEqual(entry.meaning, entry.why, `curated meaning must equal why for ${sheet.id}/${entry.id}`);
    }
  }

  const whyMissing = [...sheet.history, ...sheet.exam].filter((entry) => entry.why == null).length;
  const howMissing = sheet.exam.filter((entry) => entry.how == null).length;
  assert.deepStrictEqual(sheet.reviewNeeded, { whyMissing, howMissing }, `reviewNeeded mismatch on sheet ${sheet.id}`);
});

let aiDraft = 0;
for (const sheet of bundle.sheets) {
  for (const entry of [...sheet.history, ...sheet.exam]) {
    if (entry.meaningSource === "ai-draft") aiDraft += 1;
  }
}

console.log(
  `OK: ${bundle.sheets.length} sheets, ` +
  `${FROZEN.reduce((n, f) => n + f.history, 0)} history + ${FROZEN.reduce((n, f) => n + f.exam, 0)} exam items verified verbatim ` +
  `(why filled ${filledWhy}, how filled ${filledHow}, meaning ai-draft ${aiDraft})`
);
