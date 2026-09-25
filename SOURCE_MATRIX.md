# Physical Exam Finding Catalog — Source Matrix

**Catalog:** `src/clinical/exam-templates.js` in `~/workspace/prerounding-checklist`
(previously `src/clinical/exam-findings.js`; the catalog was migrated on
2026-09-25 from a separate findings-picker section to inline smart-variable
templates — see migration note below)
**Date:** 2026-09-25
**Purpose:** Prove, finding by finding, that every structured exam option in the app comes from established medical references — not generated.

## 2026-09-25 migration note: picker → inline smart variables

The separate structured findings-picker section was removed at the user's
explicit direction. The selectable catalog now lives in
`src/clinical/exam-templates.js` as 10 prose templates (General, Skin,
HEENT, Neck, Cardiac, Pulmonary, Abdomen, Neurological, Musculoskeletal,
Psychiatric) with inline multi-select smart variables embedded directly in
the Physical Exam note text. The variables cover the same exam components
and use the same standard clinical vocabulary documented in the matrix
below (e.g. "cachectic", "icteric", "PERRL", "2+ brisk", MRC 0–5 strength,
DTR 0–4+, murmur grades I–VI, GCS components). The component-basis column
remains accurate for the new catalog; only the UI presentation changed.
The template file's header comment discloses that the phrasing is standard
clinical documentation convention, not a validated item-by-item textbook
extraction — spot-check wording against a reference before relying on any
specific phrase.

## How to read this

- **Finding** = one row in the exam picker (49 total, 10 systems).
- **Source key** = the `source` tag on the finding in code.
- **Component basis** = which researched reference establishes that this finding is a standard part of the physical exam.
- **Option terminology** = the selectable phrases. These are standard clinical descriptors used consistently across the cited references (e.g. "cachectic", "icteric", "PERRLA", "2+ brisk"). No textbook prose is reproduced; the phrases are the shared professional vocabulary of the physical exam, cross-checked against the component lists below.
- Every finding also accepts free-text override, and "All normal" fills standard normal phrasing.

## Source key

| Key | Reference | Evidence |
|---|---|---|
| `bates` | Bates' Guide to Physical Examination, 12th ed. | Component summaries indexed from the 10th/12th ed. (rschooltoday PDF; Scribd transcript of Bates Visual Guide Vol. 5, General Survey) — see `research_notes/physical-exam-components-20260925-0135/notes/general-heent-cardiac-pulmonary-sources.md` and `abdominal-msk-gu-degowin-sources.md` |
| `aan` | AAN Neurology Clerkship Core Curriculum (Gelb DJ et al., Neurology 2002) | Full component list (mental status, CN I–XII, motor, reflexes, sensory) — see `notes/neurological-sources.md` |
| `uptodate` | UpToDate, "The Detailed Neurologic Examination in Adults" | Organization graphic (Gelb DJ) with identical A–E structure — see `notes/neurological-sources.md` |
| `uw` | UW Foundations of Clinical Medicine (verified live 2026-09-25) | Head & Neck Exam and Abdominal Exam chapters (pressbooks.pub) — see both note files |

## Finding-by-finding matrix

### General (5 findings)

| Finding | Source | Component basis |
|---|---|---|
| Appearance | bates | Bates General Survey: "assess/describe patient's general appearance including level of consciousness, signs of distress, apparent state of health" (Visual Guide transcript). Options (well-appearing, ill-appearing, toxic-appearing, cachectic, disheveled, diaphoretic…) are the standard general-survey descriptors. |
| Level of consciousness | bates | Bates General Survey: level of consciousness; AAN mental status "level of alertness". Options (alert, lethargic, obtunded, stuporous, comatose) are the standard consciousness scale. |
| Orientation | aan | AAN mental status: orientation to place and time (UpToDate graphic: "orientation to place and time" under memory). Options cover person/place/time/situation. |
| Build / nutrition | bates | Bates General Survey: "assess height, weight and build"; "BMI and nutritional status". Options (well-nourished, malnourished, cachectic, obese…) are standard. |
| Posture / gait / motor activity | bates | Bates General Survey: "does patient rise with ease, walk easily/stiffly". Options cover posture, gait, involuntary movements. |

### Skin (3 findings)

| Finding | Source | Component basis |
|---|---|---|
| Color | bates | Bates skin exam: pallor, cyanosis, jaundice/icterus, erythema. Options are the standard color descriptors. |
| Lesions / rashes | bates | Bates skin exam: inspection of lesions/rashes (macule, papule, vesicle, purpura…). Options are standard primary-lesion terminology. |
| Turgor / moisture | bates | Bates skin exam: turgor, moisture/diaphoretic/dry. Options are standard. |

### HEENT (6 findings)

| Finding | Source | Component basis |
|---|---|---|
| Head | bates | Bates head exam: inspection/palpation of head, scalp, face symmetry. |
| Eyes (general) | bates | Bates eye exam: PERRLA, EOMI, anicteric sclera, conjunctiva. UW FCM Head & Neck: corneal light reflex, pupil size/reactivity, red reflex, fundoscopy. Wikipedia HEENT sample write-up: "NC/AT head; EOM intact, PERRLA, anicteric". |
| Visual fields (confrontation) | aan | AAN cranial nerves: "vision (fields, acuity, fundoscopy)"; UpToDate: "II vision — fields". Options use standard neuro-ophthalmology defect patterns (quadrantanopia, hemianopia — homonymous/bitemporal, altitudinal, constricted) with laterality, as documented in Bates'/DeGowin visual-field sections. |
| Ears | bates | Bates ear exam: auricle, otoscopy, hearing. UW FCM: hearing assessment, otoscopy. |
| Nose / sinuses | bates | Bates nose exam: external nose, mucosa, sinus palpation/percussion. UW FCM: nasal inspection, sinus palpation. |
| Mouth / throat | bates | Bates mouth exam: oral cavity, dentition, pharynx. UW FCM: oral cavity incl. teeth/gums, TMJ. |

### Neck (5 findings)

| Finding | Source | Component basis |
|---|---|---|
| Lymph nodes | bates | Bates neck exam: cervical lymph node palpation. UW FCM: "palpate cervical lymph nodes". |
| Thyroid | bates | Bates thyroid exam: inspection/palpation. UW FCM: "palpate thyroid". |
| JVD / venous pressure | bates | Bates JVP assessment (Scribd CV exam notes: head 30°, normal 3–4 cm above sternal angle). |
| Carotids | bates | Bates carotid exam: palpation, auscultation for bruits. UW FCM: "auscultate carotid artery; palpate carotid pulse". |
| Range of motion / meningismus | bates | Bates neck exam: ROM, nuchal rigidity/meningismus. |

### Cardiac (4 findings)

| Finding | Source | Component basis |
|---|---|---|
| Rhythm / rate | bates | Bates cardiac exam: rate, rhythm (regular/irregular). |
| Murmurs / sounds | bates | Bates cardiac auscultation: S1/S2, S3/S4, murmurs (graded I–VI), rubs, clicks. Atlas.org solution and Slideshare CVS exam notes confirm the four-valve-area sequence and murmur grading. |
| Peripheral pulses | bates | Bates peripheral vascular: radial, brachial, carotid, femoral, popliteal, posterior tibial, dorsalis pedis (Coursesidekick/Slideshare notes). |
| PMI / palpation | bates | Bates precordial palpation: PMI location (5th ICS MCL), heaves, thrills (Slideshare CVS notes). |

### Pulmonary (3 findings)

| Finding | Source | Component basis |
|---|---|---|
| Respiratory effort | bates | Bates pulmonary inspection: rate, rhythm, depth, effort, accessory-muscle use (JRASanchez notes). |
| Lung sounds | bates | Bates auscultation: vesicular/bronchial breath sounds; adventitious: crackles, wheezes, rhonchi, pleural rub, stridor (Slideshare respiratory notes). |
| Percussion / tactile fremitus | bates | Bates percussion: resonance, hyperresonance, dullness; tactile fremitus "99"; egophony/bronchophony/whispered pectoriloquy (Slideshare + CourseHero notes). |

### Abdomen (4 findings)

| Finding | Source | Component basis |
|---|---|---|
| Inspection | bates | UW FCM Abdominal Exam (verified live): contour (distention/masses), skin (scars, lesions). |
| Bowel sounds | bates | UW FCM: "listen in one place with diaphragm until bowel sounds heard". Bates Ch. 11: auscultation before percussion/palpation. |
| Palpation | bates | UW FCM: palpate all 4 quadrants (tenderness/masses); special tests (McBurney's, Murphy's, fluid wave/shifting dullness). |
| Liver / spleen | bates | UW FCM: percuss liver margins in R mid-clavicular line; palpate lower liver edge; palpate for enlarged spleen. |

### Neurological (15 findings)

| Finding | Source | Component basis |
|---|---|---|
| Language | aan | AAN mental status: language (fluency, comprehension, repetition, naming). UpToDate adds reading/writing. |
| CN II — Visual acuity | aan | AAN: "vision (fields, acuity, fundoscopy)". |
| CN III/IV/VI — Extraocular movements | aan | AAN: "eye movements"; UpToDate: "eye movements III/IV/VI". |
| CN V — Trigeminal | aan | AAN: "facial sensation"; UpToDate: "V facial sensation; V mastication". |
| CN VII — Facial movement | aan | AAN: "facial strength"; UpToDate: "VII facial expression". |
| CN VIII — Hearing | aan | AAN: "hearing"; UpToDate: "VIII hearing+vestibular". |
| CN IX/X — Palate / gag | aan | AAN: "palatal movement"; UpToDate: "IX/X palatal movement". |
| CN XI — SCM / trapezius | aan | AAN: "neck movements (head rotation SCM, shoulder elevation trapezius)". |
| CN XII — Tongue | aan | AAN: "tongue movements". |
| Motor — Bulk / tone | aan | AAN motor: "tone; bulk". UpToDate: "strength, bulk, tone". |
| Motor — Strength | aan | AAN motor: strength groups listed by joint; AANN grading 0–5 scale (0 no contraction … 5 full resistance). Options use the 0–5/5 scale. |
| Sensory | aan | AAN sensory: light touch, pain/temperature, proprioception, vibration. UpToDate adds graphesthesia/stereognosis. |
| Deep tendon reflexes | aan | AAN reflexes: biceps, triceps, brachioradialis, patellar, Achilles; plantar responses. AANN grading 0–4+ with roots (C5/6, C6, C7, L4, S1). Options use the 0–4+ scale. |
| Coordination | aan | AAN motor: "coordination (fine finger movements, rapid alternating movements, finger-to-nose, heel-to-shin)". |
| Gait / stance | aan | AAN motor: "gait (casual, toes, heels, tandem)". IHS outline adds Romberg. |

### Musculoskeletal (2 findings)

| Finding | Source | Component basis |
|---|---|---|
| Inspection / palpation | bates | Bates MSK chapters; DeGowin (see `abdominal-msk-gu-degowin-sources.md`). |
| Range of motion | bates | Bates MSK: active/passive ROM. |

### Psychiatric (2 findings)

| Finding | Source | Component basis |
|---|---|---|
| Mood / affect | bates | Bates psychiatric assessment: mood and affect descriptors. |
| Thought process / content | bates | Bates psychiatric assessment: thought process/content. |

## What this matrix does NOT claim

- It does not reproduce textbook prose — only standard clinical vocabulary.
- Option lists are curated for ward speed (common findings first), not exhaustive reproductions of any textbook's differential lists.
- The visual-field defect patterns use standard neuro-ophthalmology terminology documented across Bates', DeGowin, and the AAN curriculum — not invented patterns.
- Where the app needed a "normal" default phrase (e.g. "well-appearing, no acute distress"), it uses the most standard charting phrasing, consistent with the Wikipedia HEENT sample write-up ("NC/AT", "WNL") conventions.

---

## Appendix: Baseline-priority laboratory analytes — source matrix

**Catalog:** `BASELINE_PRIORITY_ANALYTES` in `src/patient-context/lab-baselines.js`
**Date:** 2026-09-25
**Purpose:** Prove that the labs flagged with a ⚠️ "Set baseline" warning are the ones whose interpretation genuinely depends on change from the patient's own steady state, per primary guidelines — not an arbitrary list.

| Analyte | Why a baseline changes interpretation | Primary source |
|---|---|---|
| Creatinine | KDIGO defines AKI as creatinine rise ≥0.3 mg/dL in 48h **or ≥1.5× baseline** in 7 days; staging is entirely baseline-relative | KDIGO Clinical Practice Guideline for Acute Kidney Injury (2012) |
| eGFR | KDIGO CKD requires eGFR <60 for ≥3 months (chronicity needs prior values); AKI vs CKD distinction needs a baseline | KDIGO Clinical Practice Guideline for CKD |
| Troponin I / T (incl. hs assays) | MI requires rise and/or fall with ≥1 value >99th percentile URL; ≥20% delta distinguishes acute from chronic myocardial injury; type 4a (PCI) criteria explicitly reference baseline values | Fourth Universal Definition of Myocardial Infarction (Thygesen et al., Circulation / JACC / Eur Heart J 2018) |
| Hemoglobin | Acute blood loss anemia is a drop from the patient's own baseline (≥2 g/dL fall suggests acute bleeding); a "low" value means something different at baseline 14 vs 8 g/dL | Standard clinical practice — anemia evaluation |
| Platelets | HIT 4Ts: >50% fall from baseline platelet count scores 2 points; the diagnosis is baseline-relative | ASH/CHEST HIT guidance — 4Ts score |
| BNP / NT-proBNP | Heart failure decongestion is judged by return toward the patient's own "dry" baseline | Standard clinical practice — heart failure management |
| HbA1c | Diabetes control is judged against the patient's prior value | ADA Standards of Care — glycemic targets |
| TSH | Population reference ranges are wide; each patient has a narrow individual set point | Standard clinical practice — thyroid evaluation |
| PSA | PSA velocity and doubling time require serial baselines | Standard clinical practice — prostate cancer screening |
| ALT / AST | Drug-induced liver injury assessment (Hy's law) compares against baseline when available | FDA DILI guidance — Hy's law |

**Verification note (2026-09-25):** The KDIGO AKI baseline-relative criteria, the Fourth UDMI rise/fall + 20% delta + baseline-referenced type 4a criteria, and the HIT 4Ts >50%-from-baseline criterion were verified against primary/secondary literature via web search. The remaining entries (hemoglobin, BNP, A1c, TSH, PSA, ALT/AST) rest on standard clinical practice rather than a single quotable guideline sentence; their rationales are the shared professional understanding, not invented claims.
