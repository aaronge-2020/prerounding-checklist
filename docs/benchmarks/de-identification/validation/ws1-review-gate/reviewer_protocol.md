# Reviewer protocol — human review-gate validation sessions

## 1. Purpose

The app's de-identification pipeline has two stages: (1) automated
suggestions (NER model + deterministic rules), and (2) a clinician review
gate — a modal where a human accepts/rejects each suggestion and manually
redacts anything the automation missed. Automated-only benchmarks measure
stage 1. This protocol measures the **combined human + automation system**:
how much PHI remains after a real clinician reviews the suggestions.

Simulated bounds (accept-everything / oracle reviewer) already exist for
these materials; they are theoretical brackets, not human data. These
sessions produce the actual human measurements.

## 2. Ground rules (read first)

- **Synthetic data only.** The 60 test notes (`notes.jsonl`) contain invented
  names, dates, phone numbers, addresses, and record numbers. They look real
  but are not. **Never paste real patient information** into the app during
  these sessions — not into chat, not into notes, not anywhere.
- **Nothing is sent.** Every session ends with **Cancel — don't send**. No
  text ever reaches the OpenAI API during this protocol.
- **API key: a dummy key is REQUIRED to reach the review modal.** The app
  checks for an API key *before* opening the "Review before sending" modal —
  with no key, pressing Send only shows "Save an OpenAI API key in
  Settings…". In **Settings**, enter a syntactically valid but fake key
  (e.g. `sk-test-review-only-NOT-REAL`) and pick any model. This key cannot
  authenticate, so even an accidental Send press cannot transmit anything —
  but the protocol still requires **Cancel — don't send** every time, and
  the coordinator should verify the key is fake before sessions begin.
  **Never enter a real API key** during these sessions.
- **Work independently.** If two reviewers participate, each reviews the full
  set (or an assigned subset) alone, without discussing specific notes until
  both are done. We want two independent measurements.
- **Review as you would on the wards.** Read carefully, but at a natural
  clinical pace — not a forensic audit, not a skim. The timer measures your
  honest per-document review time.

## 3. Prerequisites

- The app open in a browser (the deployed GitHub Pages URL or a local
  server of the repo — either is fine; all de-identification runs on-device).
- The 60 synthetic notes. The coordinator will provide them as individual
  text files or one printable document. Each note has an ID
  (`DS-001`…`DS-020` discharge summaries, `NN-001`…`NN-020` nursing notes,
  `PN-001`…`PN-020` progress notes).
- A copy of `reviewer_results_template.csv` (one row per note per reviewer).
- A timer (phone stopwatch is fine).

## 4. UI flow in the app (exact steps)

1. Open the app and go to the **AI Chat** view (full-screen chat interface).
2. **Attach the note as context**: paste the full text of one synthetic note
   into the chat input box as your message. (Do not press Send yet.)
3. **Start your timer**, then press **Send**.
4. The **"Review before sending"** modal opens. It shows:
   - Your pasted note as the **message under review** — the primary card
     (collapsible header with a **NEW** badge, the title, redaction chips,
     and a character count). Click the chevron to expand it if it isn't
     already. (If patient context is enabled, additional document cards
     appear below; for this protocol, paste the note with context
     disabled or ignore the extra cards.)
   - Under **"New suggestions"**: one row per automated suggestion. Each row
     shows the original text struck through next to its replacement
     (e.g. `August 5, 2026` → `[Hospital Day 12]`), with **Accept**,
     **Reject** (restore), and **Undo** buttons.
   - A **sticky action bar** with the pending-suggestion count and
     **Accept all** / **Reject all** shortcuts.
   - Below the rows, a **highlighted preview** of the text as it would be
     sent, with approved redactions highlighted.
5. **Work the suggestion queue**: for each suggestion row, decide:
   - **Accept** if the highlighted span is really PHI (or if you're unsure —
     when in doubt, redact).
   - **Reject** (restore) if the span is not PHI (a false alarm).
   - You may use **Accept all** / **Reject all** only if you have actually
     read every row it covers. Do not rubber-stamp.
   - Count as you go: number accepted, number rejected.
6. **Hunt for misses in the preview**: read the full preview text carefully,
   top to bottom, looking for PHI the automation did not flag (names,
   dates, phone numbers, addresses, record numbers, ages, hospitals or
   units, family contacts). For each miss:
   - **Select the text** in the preview (message or document). A floating
     **Redact** pill appears — click it (or use the **Redact selection**
     button). The span becomes a `[REDACTED]` pill.
   - Tally each manual redaction and note its category
     (name / date / phone / address / ID / age / hospital / other).
7. **Final sweep**: re-read the final preview once, end to bottom. If you spot
   any PHI that is *still* visible — something neither the automation nor
   you caught until this pass — write it down verbatim in the
   `residual_phi_details` column and count it in `residual_phi_spotted`.
8. **Save the final preview text.** This is essential: copy the entire final
   preview (the text as it would be sent, after all your accepts/rejects
   and manual redactions) into a plain-text file named
   `<note_id>_<reviewer_id>_reviewed.txt` (e.g. `DS-001_R1_reviewed.txt`)
   and record the filename in the `final_reviewed_text_file` column.
   **Why:** `residual_phi_spotted` only captures PHI you noticed. The saved
   text lets the coordinator compare your final output against the known
   gold annotations and measure the PHI you did *not* notice — the true
   residual-PHI rate. Without this file, the headline safety metric cannot
   be computed.
9. Tick the **acknowledgment checkbox** ("I have reviewed…"), then **stop
   your timer**.
10. Record the row in the CSV (Section 6), then click **Cancel — don't send**.
    Nothing leaves your machine.
11. Repeat for the next note. Take breaks — fatigue degrades review quality,
    and we want that recorded honestly in `reviewer_notes`, not hidden.

## 5. Metrics to capture per document

| Column | Definition |
|---|---|
| `reviewer_id` | Your initials or assigned code (e.g. `R1`) |
| `note_id` | Note ID (`DS-001`, …) |
| `note_type` | discharge / nursing / progress |
| `seconds_spent` | Timer: Send pressed → acknowledgment checkbox ticked |
| `n_suggestions_shown` | Rows under "New suggestions" when the modal opened |
| `n_accepted` | Suggestion rows you accepted (incl. via Accept all, if used deliberately) |
| `n_rejected` | Suggestion rows you rejected/restored |
| `n_manual_redactions` | Spans you redacted by hand that the automation missed |
| `manual_categories` | Semicolon list, e.g. `DATE:2;PATIENT:1;PHONE:1` |
| `residual_phi_spotted` | PHI you could still see in the final preview after your pass |
| `residual_phi_details` | Verbatim spans (or `none`) |
| `final_reviewed_text_file` | Filename of the saved final preview text (e.g. `DS-001_R1_reviewed.txt`) — **required**; used to compute true residual PHI against gold annotations |
| `used_accept_all` | yes/no — did you use the bulk Accept all button? |
| `reviewer_notes` | Anything notable: confusing suggestion, ambiguous span, fatigue, UI issue |

Sanity check per row: `n_accepted + n_rejected` must equal
`n_suggestions_shown`. If it doesn't, a row was missed — say so in notes.
Every row must have a `final_reviewed_text_file`; a row without one cannot
contribute to the residual-PHI measurement.

## 6. How the numbers are analyzed (for the coordinator)

Per reviewer, per note, and pooled:

- **Suggestion precision** = `n_accepted / n_suggestions_shown`
  (fraction of the automation's suggestions the clinician judged correct).
- **Manual-addition rate** = `n_manual_redactions` per note, broken down by
  `manual_categories` → *"what does the human have to catch?"*
- **Residual PHI rate** = gold-annotation comparison of each
  `final_reviewed_text_file` against `notes.jsonl`: the fraction of gold PHI
  spans still present in the reviewer's final text → the miss rate of the
  full human + automation system. This is the headline safety metric, and it
  is computed by the coordinator — not from `residual_phi_spotted`, which
  only measures what the reviewer happened to notice. (Both are reported;
  the gap between them measures reviewer overconfidence.)
- **Review cost** = median `seconds_spent` per note (and per note type).
- Compare the human `n_manual_redactions` by category against the simulated
  oracle's "manually added" table: categories the oracle had to add but
  humans rarely catch are the highest-risk gaps.

## 7. Session checklist

- [ ] Synthetic notes only; no real PHI anywhere near the app
- [ ] Dummy (fake) API key in Settings — verified fake by the coordinator
- [ ] Timer started before Send, stopped at acknowledgment checkbox
- [ ] Every suggestion row given an explicit Accept or Reject
- [ ] Full preview read for automation misses; each manually redacted
- [ ] Final preview text saved to `<note_id>_<reviewer_id>_reviewed.txt`
- [ ] Row completed in the CSV (incl. `final_reviewed_text_file`); accept+reject sums check out
- [ ] Cancel — don't send (verify nothing was transmitted)
- [ ] Breaks taken and noted

## 8. What this protocol does not measure

- It does not measure the automation alone (that's the pipeline benchmark).
- It does not measure real clinical notes — synthetic notes are
  cleaner and more formulaic than real documentation; treat residual-PHI
  rates as a lower bound on real-world miss rates.
- Two reviewers is a pilot, not a powered study. Report inter-reviewer
  agreement descriptively; don't over-claim. The second reviewer (R2)
  repeats the full set independently — duplicate the R1 rows in the CSV
  with `reviewer_id` R2 (see the template's second block).
