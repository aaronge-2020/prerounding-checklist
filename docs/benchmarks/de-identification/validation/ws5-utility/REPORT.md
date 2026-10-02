# Workstream 5 — Utility Preservation: Does Redaction Destroy Clinical Meaning?

**Result in one line:** redaction removes PHI while leaving clinical meaning intact —
**93.9% non-PHI token preservation** and **97.5% clinical-concept retention** across
40 synthetic notes run through the real in-browser pipeline.

## 1. Methods

**Notes.** 40 synthetic clinical notes (20 discharge summaries, 20 progress notes;
153–262 words each, mean 197), generated from 8 templates (cardiac, pneumonia,
surgical, diabetes discharge; cardiology, primary-care, pulmonary, nephrology
progress) with a fixed seed (20260929). Every note was authored with two kinds of
ground truth recorded at generation time:

- **PHI spans** (428 total, exact character offsets, verified byte-for-byte against
  the text): patient/provider/contact names, dates of birth, dates, phone numbers,
  addresses, emails, MRNs, encounter IDs. All names, dates, numbers, and addresses
  are invented; phone numbers use the fictional 555-01xx range.
- **Clinical concepts** (598 total): diagnoses, symptoms, medications with
  dosages, procedures, and lab analytes — the exact strings as written in the note.

One generator defect was found and corrected before measurement: in 4 cardiology
notes the generator recorded the concept "leg swelling" while the note text read
"Trace pedal edema bilaterally". The ground truth was corrected to "pedal edema"
(the text the pipeline actually saw); the generator script was fixed to match.
After the fix, every recorded concept is present verbatim in its note.

**Pipeline.** Each note was run through the actual shipped de-identification
pipeline (hybrid mode: quantized `onnx-community/stanford-deidentifier-base-ONNX`
via Transformers.js/ONNX Runtime in headless Chromium, plus the app's
deterministic rules), capturing the true redacted text — exactly what the app
renders — and the entity spans. No text was sent anywhere; everything ran locally.

**Metric (a) — non-PHI token preservation.** Every alphanumeric token in the
original note that does not overlap a ground-truth PHI span was checked for exact
(case-sensitive) presence in the redacted note, counting multiplicities. Lost
tokens were classified by cause: overlapping a pipeline entity (by label),
timeline-header renormalization, or manual review.

**Metric (b) — clinical-entity retention.** Two measures:

1. *Ground-truth retention:* the fraction of the 598 authored clinical concepts
   whose exact string still appears in the redacted note (after removing
   redaction placeholders).
2. *Extractor agreement:* a deterministic clinical-concept extractor (curated
   phrase lists for diagnoses, symptoms, medications, procedures, and lab
   analytes; longest-phrase-first, non-overlapping matching) run on the original
   vs. the redacted note, compared by Jaccard similarity and directional
   agreement. This is a **lower-bound proxy, not a trained biomedical NER** —
   it cannot resolve abbreviations or synonyms, so agreement measured with it is
   conservative.

**Metric (c) — readability spot check.** Five redacted notes read end-to-end for
whether the clinical story remains followable.

## 2. Results

### (a) Non-PHI token preservation: 93.9% (6,939 of 7,389)

Per-note preservation ranged from 84.9% to 96.6% (median 94.9%). Of the 450
tokens not preserved, the causes break down as follows:

| Cause | Tokens | Share of losses | Nature |
|---|---|---|---|
| Relative-date normalization ("in 2 weeks", "for 3 days" → "[Hospital Day N]") | 149 | 33.1% | By design |
| Facility names → [FACILITY] (app's own bucket) | 60 | 13.3% | By design |
| Timeline header rename ("Admission Date:" → "Timeline:") | 38 | 8.4% | By design |
| Span-boundary artifacts ("Dr" in "Dr. X" when ground truth marked only "X"; "DOB"/"DOS" field labels absorbed into name spans) | 106 | 23.6% | Measurement artifact, not real loss |
| Genuine NER false positives on clinical text (see below) | 70 | 15.6% | Real |
| Multiset accounting artifacts (common words like "for"/"room" used up matching after entity replacements shrank their counts) | 27 | 6.0% | Measurement artifact |

The single largest bucket — relative-date normalization — is deliberate app
behavior: the pipeline converts relative durations into hospital-day references
(e.g. "Follow up in 2 weeks" → "Follow up [Hospital Day 15]"). Under a strict
reading these intervals are not PHI, and the conversion rephrases rather than
deletes the timing information, but it is the main way redaction touches
non-PHI text, and it does alter dosage instructions (see below).

### (b) Clinical-entity retention

**Ground-truth retention: 97.5% (583 of 598 concepts).**

| Category | Retained | Lost |
|---|---|---|
| Diagnoses | 124/124 (100%) | 0 |
| Labs | 145/145 (100%) | 0 |
| Symptoms | 108/109 (99.1%) | 1 ("rash" misclassified as a name) |
| Medications | 174/180 (96.7%) | 6 |
| Procedures | 32/40 (80.0%) | 8 |

All 15 losses fall into three patterns:

1. **Duration phrases inside dosage instructions (6 medications).** The concept
   "azithromycin 500 mg daily for 3 days" no longer matches verbatim because
   "for 3 days" is detected as a date and replaced with "[Hospital Day N]".
   The drug name and dose always survive; only the course duration is rephrased.
   This is the same relative-date normalization as above, landing inside a sig.
2. **Title-Cased procedures read as person names (3).** "Cardiac Mri" and
   "Brain Mri" were tagged PATIENT NAME ("Mri" parsed as a surname);
   "Transthoracic Echocardiogram" was tagged NAME. In the redacted text these
   read confusingly (e.g. "[PATIENT NAME] performed on [Hospital Day 109]
   showed no acute obstructive disease").
3. **"Chest CT" read as an address (5).** The model parsed "CT" as Connecticut,
   swallowing the procedure name together with the surrounding date and vitals
   fragment into a single [ADDRESS] span.

No diagnosis, lab value, medication name, or dosage was ever removed.

**Extractor agreement (lower-bound proxy): 98.3% Jaccard similarity**
(macro-averaged over notes), 98.3% directional agreement (concepts found in the
original that are still found in the redacted note). The extractor found 706
concept instances in the originals and 693 in the redacted notes.

**Context — PHI coverage of the automated pass:** 100% (408/408) of planted
PHI spans were overlapped by at least one pipeline entity before the review
gate. (Recall of the automated pass is workstream 1's subject; it is reported
here only to confirm the utility numbers were measured on notes whose PHI was
actually redacted.)

### (c) Readability spot check (5 redacted notes)

In all five notes the clinical story — presenting symptoms, history, vitals,
labs, medications with doses, hospital course, and follow-up plan — reads
clearly end to end. Two artifacts stand out: the "Chest CT" misfire leaves a
visible gap ("oxygen saturation [ADDRESS] demonstrated right lower lobe
consolidation"), and a misclassified procedure name reads as a person
("[PATIENT NAME] performed on [Hospital Day 109]"). Neither prevents following
the case, but the procedure-as-name errors are the most confusing artifacts a
reader will encounter.

## 3. The claim, with exact numbers

> Redaction removes PHI while leaving clinical meaning intact: **93.9% of
> non-PHI tokens (6,939/7,389) survive redaction unchanged**, and **97.5% of
> authored clinical concepts (583/598) are retained verbatim** in the redacted
> note, with 98.3% agreement between clinical concepts extracted from the
> original vs. redacted text. All 408 planted PHI spans were caught by the
> automated pass. The main failure mode is the pipeline's deliberate
> normalization of relative dates ("in 2 weeks", "for 3 days") into hospital-day
> references — including inside dosage instructions — plus a small set of NER
> false positives where Title-Cased procedure names ("Cardiac Mri", "Chest CT")
> are misread as person names or addresses.

## 4. Limits

- **Synthetic notes are cleaner than real clinical text.** They contain no
  typos, dictation errors, copy-paste artifacts, or idiosyncratic abbreviations,
  all of which could raise the false-positive rate on real notes.
- **The extractor-agreement number is a lower-bound proxy.** The deterministic
  phrase-list extractor is not a trained biomedical NER; it misses synonyms and
  abbreviations by construction.
- **This measures that redaction does not corrupt the note.** It does not show
  that downstream models (risk predictors, phenotypers) perform identically on
  redacted vs. original text — that is a separate experiment.
- **Scope:** 40 notes, one pipeline configuration (hybrid mode, default model).
  The review gate's effect on the final text is not measured here.
- Whether relative-date normalization counts as "preserved" depends on the
  reader's definition of PHI; the 149 affected tokens are reported separately
  above so the number can be recomputed either way.

## 5. Reproducibility

- Notes + ground truth: `data/notes.jsonl` (generator: `scripts/generate_notes.py`, seed 20260929)
- Pipeline harness: `harness/` (server on port 8905 serving the app's own model
  files and pipeline bundle; `driver.mjs` runs all 40 notes through the real
  pipeline in headless Chromium and checkpoints to `results/checkpoints/`)
- Raw pipeline outputs: `results/raw_run.json` (entities + true redacted text per note)
- Measurement: `scripts/measure_utility.py` (+ `scripts/clinical_extractor.py`) →
  `results/measurements.json`
- Original/redacted pairs: `results/pairs/ws5-NN_{original,redacted}.txt`
- Model: `onnx-community/stanford-deidentifier-base-ONNX` (q8), hybrid mode;
  full run 336 s for 40 notes after ~22 s model load.
