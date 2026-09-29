// Bundled high-priority drug-drug interaction dataset.
//
// Why this exists: the NLM RxNav Drug-Drug Interaction API was permanently
// discontinued on 2024-01-02, and no free, keyless, CORS-enabled structured
// DDI API exists as of 2026-09-29. This file is a curated safety floor of
// well-established high-priority interactions, keyed by ingredient-level
// RxCUIs (all verified against the live RxNav API on 2026-09-29).
//
// This is NOT exhaustive. A pair not listed here is "not in this list", not
// "safe". The UI must say so plainly. Sources for each pair are named in the
// `source` field.

export const DDI_DATASET_VERSION = "2026-09-29-onc-v1";
export const DDI_DATASET_SOURCE =
  "Curated from the ONC high-priority DDI list (Phansalkar et al., JAMIA 2012), " +
  "FDA-approved labeling, and standard references. Ingredient RxCUIs verified via RxNav 2026-09-29.";

// severity: "major" (avoid / high harm), "moderate" (monitor or adjust),
// "minor" (usually manageable).
// a / b: ingredient-level RxCUI strings. Order does not matter.
export const DDI_PAIRS = [
  // -- Warfarin: bleeding and INR effects (well-established) --
  { a: "11289", b: "1191", severity: "major", description: "Warfarin + aspirin: markedly higher bleeding risk.", source: "ONC high-priority DDI list" },
  { a: "11289", b: "5640", severity: "major", description: "Warfarin + ibuprofen: higher bleeding risk; NSAIDs also injure the gut lining.", source: "ONC high-priority DDI list" },
  { a: "11289", b: "7258", severity: "major", description: "Warfarin + naproxen: higher bleeding risk.", source: "ONC high-priority DDI list" },
  { a: "11289", b: "3355", severity: "major", description: "Warfarin + diclofenac: higher bleeding risk.", source: "ONC high-priority DDI list" },
  { a: "11289", b: "32968", severity: "moderate", description: "Warfarin + clopidogrel: higher bleeding risk; sometimes used together on purpose after stents, with close monitoring.", source: "FDA labeling" },
  { a: "11289", b: "703", severity: "moderate", description: "Warfarin + amiodarone: INR can rise, sometimes days after starting. Check INR closely.", source: "FDA labeling" },
  { a: "11289", b: "4450", severity: "moderate", description: "Warfarin + fluconazole: INR can rise. Check INR closely.", source: "FDA labeling" },
  { a: "11289", b: "6922", severity: "moderate", description: "Warfarin + metronidazole: INR can rise. Check INR closely.", source: "FDA labeling" },
  { a: "11289", b: "10180", severity: "moderate", description: "Warfarin + sulfamethoxazole: INR can rise and bleeding risk goes up.", source: "FDA labeling" },
  { a: "11289", b: "10829", severity: "moderate", description: "Warfarin + trimethoprim: INR can rise and bleeding risk goes up.", source: "FDA labeling" },

  // -- Statins + strong CYP3A4 inhibitors: muscle injury --
  { a: "36567", b: "21212", severity: "major", description: "Simvastatin + clarithromycin: risk of muscle breakdown (rhabdomyolysis). Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "36567", b: "4053", severity: "major", description: "Simvastatin + erythromycin: risk of muscle breakdown (rhabdomyolysis). Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "36567", b: "28031", severity: "major", description: "Simvastatin + itraconazole: risk of muscle breakdown (rhabdomyolysis). Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "36567", b: "6135", severity: "major", description: "Simvastatin + ketoconazole: risk of muscle breakdown (rhabdomyolysis). Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "83367", b: "21212", severity: "moderate", description: "Atorvastatin + clarithromycin: higher statin levels; watch for muscle pain and consider a lower dose or pause.", source: "ONC high-priority DDI list" },
  { a: "83367", b: "28031", severity: "moderate", description: "Atorvastatin + itraconazole: higher statin levels; watch for muscle pain.", source: "FDA labeling" },

  // -- QT prolongation: additive risk --
  { a: "703", b: "21212", severity: "major", description: "Amiodarone + clarithromycin: both can prolong the QT interval; combined use raises the risk of a dangerous heart rhythm.", source: "ONC high-priority DDI list" },
  { a: "703", b: "4053", severity: "moderate", description: "Amiodarone + erythromycin: both can prolong the QT interval; ECG monitoring is warranted.", source: "Standard references" },

  // -- Serotonin syndrome --
  { a: "8123", b: "4493", severity: "major", description: "Phenelzine (MAOI) + fluoxetine (SSRI): risk of serotonin syndrome, which can be fatal. Do not combine.", source: "ONC high-priority DDI list" },
  { a: "8123", b: "36437", severity: "major", description: "Phenelzine (MAOI) + sertraline (SSRI): risk of serotonin syndrome. Do not combine.", source: "ONC high-priority DDI list" },
  { a: "10734", b: "4493", severity: "major", description: "Tranylcypromine (MAOI) + fluoxetine (SSRI): risk of serotonin syndrome. Do not combine.", source: "ONC high-priority DDI list" },
  { a: "10734", b: "36437", severity: "major", description: "Tranylcypromine (MAOI) + sertraline (SSRI): risk of serotonin syndrome. Do not combine.", source: "ONC high-priority DDI list" },
  { a: "9639", b: "4493", severity: "major", description: "Selegiline (MAOI) + fluoxetine (SSRI): risk of serotonin syndrome. Do not combine.", source: "ONC high-priority DDI list" },
  { a: "10689", b: "4493", severity: "moderate", description: "Tramadol + fluoxetine: higher risk of serotonin syndrome and seizures.", source: "FDA labeling" },
  { a: "10689", b: "36437", severity: "moderate", description: "Tramadol + sertraline: higher risk of serotonin syndrome and seizures.", source: "FDA labeling" },
  { a: "10689", b: "72625", severity: "moderate", description: "Tramadol + duloxetine: higher risk of serotonin syndrome and seizures.", source: "FDA labeling" },

  // -- Nitrates + PDE5 inhibitors: severe hypotension --
  { a: "136411", b: "4917", severity: "major", description: "Sildenafil + nitroglycerin: can cause a dangerous drop in blood pressure. Do not combine.", source: "ONC high-priority DDI list" },

  // -- Hyperkalemia --
  { a: "29046", b: "9997", severity: "moderate", description: "Lisinopril (ACE inhibitor) + spironolactone: potassium can climb to dangerous levels. Check potassium and kidney function.", source: "FDA labeling" },
  { a: "29046", b: "8588", severity: "moderate", description: "Lisinopril (ACE inhibitor) + potassium supplements: potassium can climb to dangerous levels.", source: "FDA labeling" },

  // -- Narrow-therapeutic-index drugs --
  { a: "3407", b: "21212", severity: "moderate", description: "Digoxin + clarithromycin: digoxin levels can rise into the toxic range. Monitor levels and ECG.", source: "ONC high-priority DDI list" },
  { a: "10438", b: "2551", severity: "moderate", description: "Theophylline + ciprofloxacin: theophylline levels can rise; watch for nausea, tremor, or fast heartbeat.", source: "ONC high-priority DDI list" },
  { a: "6851", b: "10829", severity: "major", description: "Methotrexate + trimethoprim: risk of severe bone marrow suppression. Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "57258", b: "2551", severity: "major", description: "Tizanidine + ciprofloxacin: tizanidine levels can rise sharply, causing very low blood pressure and heavy sedation. Avoid the combination.", source: "ONC high-priority DDI list" },
  { a: "57258", b: "42355", severity: "major", description: "Tizanidine + fluvoxamine: tizanidine levels can rise sharply. Avoid the combination.", source: "FDA labeling" }
];
