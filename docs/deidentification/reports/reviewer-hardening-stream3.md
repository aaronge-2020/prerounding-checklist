# STREAM 3 — Real-Text Stability Study Design (MIMIC-IV-Note)

**Scope:** Study design only. No data downloaded. No implementation. FROZEN system (Stanford clinical + D1–D12, no tuning) throughout. This study measures **stability/robustness on real clinical prose**, not accuracy — there is no PHI gold on MIMIC-IV-Note.

---

## 1. Access-path checklist (verified 2026-09-30)

**Project:** MIMIC-IV-Note: Deidentified free-text clinical notes, v2.2 (Jan 2023) — Johnson, Pollard, Horng, Celi, Mark. PhysioNet: `https://physionet.org/content/mimic-iv-note/` (DOI 10.13026/1n74-ne17).

**Contents:** 331,794 discharge summaries (145,915 patients) + 2,321,355 radiology reports (237,427 patients), Beth Israel Deaconess Medical Center. Distributed as CSVs (`discharge`, `discharge_detail`, `radiology`, `radiology_detail`); `note_id` uniquely identifies each note. **PHI was replaced with exactly three underscores (`___`)** — de-identified per HIPAA Safe Harbor by a union of rule-based + neural de-identification (reported 99.9% sensitivity on radiology; manual review of discharge summaries found no residual PHI).

**Access requirements (per PhysioNet credentialed-data flow):**
1. [ ] PhysioNet account in **credentialed** status — Aaron's CITI "Data or Specimens Only Research" + credentialing reported done 2026-09-29.
2. [ ] **Sign the MIMIC-IV-Note-specific DUA** — credentialing alone does not unlock it; each project carries its own DUA. Aaron must open the project page while signed in, accept the DUA, and wait for approval (typically 24–48 h).
3. [ ] Download `discharge.csv.gz` only (the file ships whole — expect a few GB compressed — then sample locally; deleting the rest of the file after extraction is fine).

**Citation for the manuscript:** Johnson et al. (2023), PhysioNet, v2.2, DOI 10.13026/1n74-ne17, RRID:SCR_007345.

---

## 2. Study design

**Population:** Discharge summaries only. Rationale: long-form narratives with maximal real-world messiness (typos, dictation artifacts, templated sections) and the highest prevalence of copy-forwarded text. Radiology reports excluded (too templated; near-trivial input).

**Sampling:** Pre-register a random seed. Draw 200 discharge summaries with a stratified scheme — 100 patients × 2 notes (two admissions per patient; if a patient has only one discharge summary, draw one and take the next random patient) — so that the copy-forward metric (§3.1) always has a within-patient pair. **Exclusions (pre-registered):** notes < 500 characters; notes that are pure addenda. Record all excluded `note_id`s. The system runs exactly once per note (plus the pair runs — no tuning passes; held-out discipline from the synthetic protocol applies: no inspecting failures and editing rules).

### 3. No-gold metrics (exact definitions)

**M1 — Near-duplicate pair agreement (the natural-variation test-retest).** For each patient, the two notes are naturally near-duplicate where history/assessment sections are copy-forwarded. Compute:
- Token-set Jaccard of the two notes; keep pairs with Jaccard ≥ 0.5 (pre-registered threshold; report how many pairs survive).
- Run the frozen system on each note. Let S₁, S₂ = redacted-span sets (each span = character offsets + PHI type). **Agreement = |S₁ ∩ S₂| / |S₁ ∪ S₂|** restricted to the character ranges of aligned identical text windows (align via the token-Jaccard overlap; simplest honest version: compute Jaccard on the intersection of the texts after alignment by longest common subsequence on tokens, then spans within that window).
- Report: median agreement, IQR, and % of pairs with agreement ≥ 0.90. Pre-registered success criterion: ≥80% of pairs ≥ 0.90 (report honestly whatever is observed).

**M2 — Within-note entity consistency (same string, same verdict).** For each note: take every surface string the system redacts at least once. For strings occurring ≥ 2 times in the note, **consistency rate = (# occurrences redacted with identical span+type) / (total occurrences)**. Aggregate: micro-average over all repeated strings across all notes (gives thousands of observations → tight bootstrap CI), plus per-note macro-average. This directly tests "the same name redacted identically everywhere," a reviewer-meaningful robustness property.

**M3 — Redaction-density drift (sanity, not quality).** Spans per 1,000 tokens per note, and the distribution of PHI types, vs the same statistic on the MedDeID dev-200. Not an accuracy claim — a drift check: wildly different density or type distribution on real text would flag that the system is behaving in a different regime.

**Statistics:** Bootstrap 95% CIs (10k note-level resamples, seed 20260930, same convention as `sota-full-eval.md`). All three metrics pre-registered before any inference.

---

## 3. Sample-size justification

- **n = 200 notes / 100 pairs:** For M1, if 80% of pairs clear 0.90, the 95% CI on that proportion is ±~8 pp — tight enough to state the claim crisply. For M2, repeated entities number in the thousands → CIs ≈ ±1 pp. For M3, 200 notes give a stable density estimate (±~15% of the mean at observed dispersion).
- **Practical:** 200 discharge summaries × ~3 s/note browser latency ≈ 10–15 min per run; no GPU, no cluster, trivial compute.
- **Not** sized for accuracy estimation (impossible without gold) or for rare-failure characterization.

---

## 4. Honest limitations (manuscript-grade)

1. **No accuracy claim is possible.** MIMIC-IV-Note has no PHI gold; this study cannot measure recall, precision, or F1 on real text.
2. **The `___` placeholders distort the input distribution.** The system's name/date/address rules were built for real PHI; on MIMIC-IV-Note they fire on placeholders. Consistency on placeholder redaction is a weaker signal than consistency on real PHI — disclose this explicitly.
3. **De-identification pipeline residue.** The notes were cleaned by someone else's rule+neural de-identifier; residual artifacts of *their* pipeline (not real clinical messiness) may inflate apparent robustness. Manual spot-check of a subsample for this confound is worth one paragraph.
4. **Single institution, US only** (BIDMC); no generalizability claim beyond that.
5. **Possible follow-up, NOT this study:** synthetic PHI re-insertion into `___` slots would create a real-text-with-gold benchmark — but Aaron refused synthetic injection, so it stays out of scope.

---

## 5. Minimal data-handling plan

Download only `discharge.csv.gz`; extract, sample 200 rows by pre-registered `note_id` list, delete or archive the rest. All processing local on Aaron's credentialed machine. No note text leaves the machine; manuscript reports only aggregate statistics and (if any) short redacted example spans with no record-level identifiers. No data committed to any repo (same convention as prior credentialed checklists).

---

## 6. GO / NO-GO recommendation

**GO — with the scope kept exactly as designed above.** Rationale: it is cheap (one DUA signature, one download, ~15 min of compute), pre-registerable, and directly answers the reviewer's real-text question at the only level honest without gold: *does the frozen pipeline behave stably and sanely on messy real clinical prose?* It must be framed in the manuscript as a robustness/stability supplement, never as accuracy evidence, with limitations 1–2 stated plainly. **Do not run it if Aaron would rather spend the DUA effort on the synthetic-PHI re-insertion follow-up** — but that door is closed per his stated refusal, so this is the best available real-text evidence.
