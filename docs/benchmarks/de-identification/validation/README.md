# Publication validation: browser-local de-identification

Five validation tracks for the app's on-device de-identification pipeline
(quantized `onnx-community/stanford-deidentifier-base-ONNX` + deterministic
rules + clinician review gate, all executed locally in the browser). Each
track has its own directory with a full report, the synthetic data it ran on,
and the scripts to reproduce it.

All notes used in every track are synthetic — invented names, dates, numbers,
and addresses. No real patient data appears anywhere in these documents.

## The five tracks

### 1. Review gate (`ws1-review-gate/`)
What the human review step adds on top of the automated pipeline, measured on
60 synthetic clinical notes (480 planted PHI spans).

- A reviewer who rubber-stamps every suggestion still reaches 0.869 / 0.867
  exact-span precision/recall — but leaks the age mention in all 60 notes.
- A perfect reviewer closes everything at a cost of about one manual redaction
  per note; 60 of 61 manual additions were ages.
- The reviewer's real job, in order: ages first, then name-boundary cleanup,
  then filtering a small number of false alarms.
- Includes a ready-to-run protocol and blank results template for real
  reviewer sessions, which have not been run yet.

### 2. Zero egress (`ws2-zero-egress/`)
Packet-level proof that note text never leaves the device. Two full browser
sessions (fresh and repeat profile, 569 requests total) made zero requests to
remote hosts. In the send-path test, the only remote request carrying
note-derived text was the user's own authorized call to the OpenAI API, whose
body contained 0 of 27 planted identifiers and the expected redaction markers.

### 3. Deployment envelope (`ws3-envelope/`)
What the pipeline costs to run. Model artifact: 105.46 MiB on disk. Peak
process memory ~1 GB during model load, ~782 MB steady state. Fail-closed
verified in both failure modes (model CDN blocked, corrupted cached weights):
the app refuses to send and shows an explicit "De-identification failed —
sending is blocked" message. Timing numbers in this report were measured on a
shared, heavily loaded VM and run slower than the earlier dedicated baseline;
they need a re-run on a quiet machine before publication.

### 4. Robustness (`ws4-robustness/`)
Whether the pipeline behaves consistently when the input changes. Across
discharge summaries, nursing notes, and SOAP progress notes, exact-span F1
ranged 0.631–0.729 with no systematic degradation by note type. A 27-case
edge suite passed 20: misspellings, odd date/phone formats, and long notes
all handled. The failures are documented as a measurement-grounded
limitations list: ages are not detected at all, the exact string "Test
Patient" is invisible to the pipeline, a date directly followed by "at
{clock time}" loses the date, and bare city/state names are never flagged.

### 5. Utility preservation (`ws5-utility/`)
Whether redaction destroys clinical meaning. It does not: 93.9% of non-PHI
tokens survive unchanged and 97.5% of authored clinical concepts (583/598)
are retained verbatim, with 98.3% agreement between concepts extracted from
original vs. redacted notes. All diagnoses, lab values, medication names, and
dosages survived. The main artifacts: deliberate relative-date normalization
("for 3 days" → "[Hospital Day N]") and a few procedure names misread as
person names or addresses ("Chest CT" → "[ADDRESS]").

## Caveats that apply to all five tracks

- **All synthetic.** Notes were generated from the authors' own templates:
  cleaner and more regular than real clinical text. Miss rates are a lower
  bound; real-world performance will differ.
- **Simulated reviewers are bounds, not human data.** The accept-all and
  oracle conditions bracket where real clinicians should land; the protocol
  for real sessions is in `ws1-review-gate/reviewer_protocol.md`.
- **Timings need a dedicated re-run.** Latency, memory, and startup numbers
  were measured on a shared VM under load. The zero-egress and
  accuracy findings are not timing-sensitive and stand as measured.
- **One pipeline configuration.** All tracks used hybrid mode with the
  default quantized Stanford model — the configuration the app ships.

## Reproducibility notes

Large binary artifacts used during measurement (the ~110 MB ONNX model
file, the reconstructed app copy in the egress captures, and throwaway
browser profiles) are intentionally not included here. They are reproducible
from the app repository and the public model checkpoints named in each
track's report; every track documents the exact configuration it ran.
