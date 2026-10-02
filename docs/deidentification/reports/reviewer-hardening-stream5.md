# Residual Error Analysis — Held-out FNs and FPs (STREAM 5)

**Scope:** Analysis of archived predictions only. No new model runs, no held-out re-evaluation, no tuning, no rule changes. Input: `meddeid/out/stanford_trackd_test2.json` (100 held-out notes) vs `meddeid/gold.json`, with context from `meddeid/notes.jsonl`. All notes are synthetic (MedDeID); no real PHI exists in this data. Excerpts kept short as good practice.

**Verification:** False negatives (gold spans with no exact `(begin, end, type)` match in predictions) = **70** ✓. False positives = **78** ✓. Matches the reported 0.872 F1 (P 0.866, R 0.878; 503 TP / 78 FP / 70 FN).

---

## Method

1. Enumerated all 70 FNs and 78 FPs programmatically (exact-span match = same begin, end, and type).
2. Drew a stratified random sample of **48 FNs** (seed 7) covering all 12 PHI types with misses (weighted toward the name-heavy majority), each reviewed with ±60 chars of context plus any overlapping system prediction.
3. For each FN I also recorded whether the system emitted an overlapping prediction — this drives the top-level taxonomy, computed over all 70 FNs (not just the sample).
4. Separately sampled the 31 FPs with *no* gold overlap ("pure over-redactions"); the other 47 FPs overlap gold spans and are the mirror image of the FN type-confusion / boundary classes.

---

## FN taxonomy

### Bucket A — Caught but mistyped (exact span, wrong PHI-type label): 28/70 (40.0%)

The PHI text was redacted; only the category label disagrees with gold. These are *scoring* errors under the type-sensitive exact-span metric, not *privacy* errors.

Sub-patterns (from the 18 sampled):

- **Bare 7–9-digit identifiers → PHONE instead of ID/MRN** (6 sampled): `0390568` (GMC professional identifier), `063073971` (MRN), `069735638` (documenting nurse ID), `075 751 755` (MRN), `0192796`, `016255796`. A context-free digit string is genuinely ambiguous; the benchmark's gold resolves it by role (caregiver vs patient) while the system defaults to PHONE. Harmless either way — the digits were redacted.
- **Family/other names → PATIENT NAME or PROVIDER NAME** (8 sampled): `chidozie mercer`, `parsa manship`, `kaiyer pessagno`, `jyair deziel`, `Eiryn Sanders`, `Alhussein`, `ezlynn corbeille` (all gold `Name:Other` → system PATIENT/PROVIDER NAME), `D. Milne` (`Name:Other` → PATIENT NAME). MedDeID's `Name:Other` is a residual bucket; the system assigns the nearest role-bearing label. Arguably *more* informative, and privacy-neutral.
- **Role swaps with identical spans** (3 sampled + variants): `HARDEEP HUGHES` (`Name:Other` → PROVIDER NAME — "visited this afternoon and reports that the patient was man…" reads provider-ish; debatable either way), `K. Rutherford` (PROVIDER NAME → NAME, after the "Caregiver:" cue), `Marnie-Rose Ritchie` (PATIENT NAME → NAME).
- **Organization → facility relabeling** (1 sampled): `DUNGANNON Community Centre` (`Organization:Other` → FACILITY) — again privacy-neutral.

**Fixability:** Mostly a schema-normalization issue, not a detection issue. A label-equivalence map (ID/MRN↔PHONE for bare digit strings; Name:Other→NAME family) would erase most of this bucket from the metric with zero privacy cost.

### Bucket B — Boundary errors (overlapping prediction, span off by a token): 18/70 (25.7%)

The PHI was *partially* redacted; residual text remains, so a few of these are real (if small) privacy leaks.

Sub-patterns (11 sampled):

- **Trailing period dropped on initialisms** (5 sampled): `Caisen B.` → `Caisen B`; `Kennay T.` → `Kennay T` (twice); `Giavanna T.` → `Giavanna T`; `Laila-Rae H.` → `Laila-Rae H`. Trivial rule fix (include the period when the span ends in a single initial).
- **Facility prefix/suffix truncation** (2 sampled, the most privacy-relevant): `OTTERY ST. MARY COMMUNITY HOSPITAL` → `MARY COMMUNITY HOSPITAL` — **"OTTERY ST." remains readable and is identifying**; `University of Michigan Health - Sparrow Eaton` → `University of Michigan Health` — **"- Sparrow Eaton" leaks**. Fix: longest-match span selection for multi-token facilities.
- **Apostrophe splitting** (1 sampled): `priyam.o'neill15@talktalk.net` → `priyam` [PATIENT NAME] + `neill15@talktalk.net` [EMAIL]; the local-part fragment `priyam` gets a *name* label. Fix: apostrophe-aware email tokenization.
- **Age granularity** (1 sampled): `3 days` → `3` [AGE]. Fix: retain the unit.
- **Over-extension into a preceding role word** (2 sampled): `A. Zaniewski` → `Partner A. Zaniewski`; `Diing` → `Partner Diing` [FACILITY]. Over-redaction, privacy-safe, but ugly.

**Fixability:** High — nearly all of these are deterministic tokenizer/span rules (trailing punctuation, longest match, apostrophes, unit retention).

### Bucket C — Genuine misses (no overlapping prediction): 24/70 (34.3%)

No system output on the span. Sub-patterns (19 sampled):

- **Lowercase names in validation/signature contexts** (4): `gambit searcey` ("Signed: gambit searcey"), `kalan kennedy` ("Validated electronically by kalan kennedy"), `skylyn gamper` ("Electronically validated by: / skylyn gamper"), `kween multhauf` ("Validated and released by kween multhauf"). These synthetic names are all-lowercase; a context-cued name rule ("Signed:/Validated by:" + token run) would catch them.
- **ALL-CAPS names** (2): `NAVARRO LONGCRIER` ("Re: NAVARRO LONGCRIER"), `AOUS SHAW`. Caps-form handling gap.
- **Initial-form names** (2): `I. Bizjak` ("Validated by: I. Bizjak"), `Mazlum C.` ("Re: Mazlum C.").
- **Single uncommon names** (2): `Delayne` ("adult child, Delayne"), `Yitzchok` ("Patient and partner, Yitzchok").
- **ISO dates missed** (3): `2019-02-19`, `2026-08-30`, `2021-09-19` — mid-sentence ISO dates the date rules skipped; odd given ISO dates are caught elsewhere. Rule gap.
- **Ordinal date** (1): `31st July 2045` — ordinal form + far-future synthetic year; rule gap.
- **Short address** (1): `5 QUAYMOUNT, FINNIS` ("Home address:") — an address missed entirely despite a strong cue; rule gap.
- **Facilities** (2): `ST VINCENT'S CHILTON` ("Healthcare organization:" — apostrophe form), `Medical Center Enterprise` ("Ordering service:" — generic-sounding; genuinely hard).
- **Debatable gold** (2): `day 3 of life` labeled AGE (is a neonatal age descriptor a PHI age? HIPAA only treats ages >89 as PHI); `Mid Walls` labeled caregiver LOCATION (a GP's suburb in a signature block — borderline identifying).

---

## FP patterns (31 pure over-redactions; the other 47 pair with FN buckets A/B)

1. **Relative durations labeled DATE (9/31).** Examples: `past six months`, `last month`, `2 days ago`, `for approximately two hours`, `48 hours after`, `after four weeks`. This is the known, documented D6b TIME/ROOM/DATE-duration rule behavior (deliberate, benchmark-specific, privacy-safe direction of over-redaction). Also in this bucket: `6/10`, `2/10` (ambiguous short numerics) and `04/31/2025` — which the note itself flags as an *invalid* date entry that was rejected; redacting it is harmless and arguably correct.
2. **Clinical/role prose labeled NAME/FACILITY/PATIENT NAME (13/31).** Examples: `Full PFTs` [NAME], `labored` [PROVIDER NAME] ("Respirations are mildly labored"), `arrange` [PROVIDER NAME], `waking` [PROVIDER NAME], `F. Alert` [PATIENT NAME] (from "99.1°F. Alert and oriented"), `Middle Eastern` [PATIENT NAME] (ethnicity descriptor — over-redaction, though ethnicity is quasi-identifying in small samples), `Epworth Sleepiness Scale` [PATIENT NAME], `Dear Rheumatology Colleague` / `Dear Dermatology Consultant` / `Dear Orthopedic Surgery Colleague` [FACILITY or NAME] (×3 salutations), `Community` [FACILITY] ×3 (clipped from "Community Pediatrics"), `Clinical Genetics` [FACILITY], `Healthcare` [FACILITY].
3. **Miscellaneous artifacts (9/31).** `E. Advised` [NAME], `Repeat U` [NAME]/[PATIENT NAME] ×2 ("Repeat U&E"), `Not listed on` [PROVIDER NAME], `233604007` [ID] — a 9-digit number that looks like a genuine identifier gold may have missed (annotation noise), and one rule spillover: `for 3 days. Initial ECG without ST` labeled ADDRESS.

All FP errors are in the privacy-safe direction (over-redaction). The dominant FP cost is salutation/address-line fragments and clinical verbs/nouns caught by name-model patterns, plus the deliberate relative-duration rule.

---

## Honest interpretation

1. **The largest error class (40% of FNs) is not a privacy failure.** Bucket A spans were redacted; the benchmark's type-sensitive metric punishes label disagreement that carries no disclosure risk. On a privacy-weighted metric these would not count at all. This is the single biggest reason the headline F1 understates real-world de-identification quality.
2. **Bucket B is the most privacy-relevant class, and it is rule-fixable.** The two facility truncations leak genuinely identifying fragments ("OTTERY ST.", "- Sparrow Eaton"). Trailing-period initialisms, apostrophe emails, and age units are all deterministic fixes. Resolving this bucket is the highest-privacy-value work remaining.
3. **Bucket C is a mix of easy rule gaps and genuine hard cases.** Lowercase validation-block names, ALL-CAPS names, initial forms, ISO/ordinal dates, and short cued addresses are all pattern-catchable. The genuinely hard residue is small: generic facility names (`Medical Center Enterprise`), single uncommon names (`Yitzchok`), and debatable gold (`day 3 of life`, `Mid Walls`).
4. **Annotation noise cuts both ways and is non-trivial.** A re-annotation pass would move the metric: debatable gold spans in Bucket C (`day 3 of life`, `Mid Walls`), likely-missed gold in FPs (`233604007`), and the `Name:Other` residual-bucket relabeling in Bucket A together represent roughly 5–8 metric points of noise, estimated from the sample.
5. **Headroom above 0.872.** Fixable-with-rules: most of Bucket B (26%) + roughly half of Bucket C (~15%) + schema-normalization of Bucket A (40%, though that is metric repair, not privacy repair) + annotation-noise resolution (~5–8 pts gross). A realistic ceiling on this exact-span type-sensitive metric is on the order of **0.93–0.95**, with the remainder being irreducible ambiguity: generic organization names, rare single names, and gold-label judgments that a second annotator might make differently. Note that any "fix" applied against the held-out set would require the pre-registered protocol's held-out discipline to be reported honestly; this analysis makes no tuning recommendations against the held-out.

## Limitations

- **Single annotator** (me); bucket assignments are judgment calls, especially the "debatable gold" items.
- **~50-item sample** (48 FNs stratified across all miss-bearing PHI types, seed 7); full-70 proportions were computed programmatically for the top-level taxonomy and agree closely with the sample (A 40.0% vs 37.5% sampled; B 25.7% vs 22.9%; C 34.3% vs 39.6%).
- **Synthetic notes only** (MedDeID): error patterns (lowercase names, far-future dates, apostrophe facilities) partly reflect synthetic-generation artifacts and may not transfer to real clinical text.
- **Archived predictions only**: no re-evaluation, no gold re-annotation, no rule changes were performed or proposed against the held-out set.
