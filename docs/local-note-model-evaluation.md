# Browser-local note drafting evaluation

Date: 2026-10-15. These are synthetic engineering regression checks, not clinical validation or a demonstration of improved clinician outcomes.

## What changed

The previous pipeline accepted freely generated clinical prose and rejected long source notes as a whole. The new pipeline asks the local model to select source sentence IDs under a JSON schema. The app assembles factual content from those exact sentences, separates prior/copied material from explicit updates today, and leaves current examination and assessment/plan blank. The model selects interview questions from a fixed ten-question bank instead of generating question wording. This provides a reviewable prechart starting point; it is not a polished final note. Selection can still omit relevant facts or include irrelevant ones.

The meter uses the loaded model tokenizer. Before loading it labels its count as an estimate. Planning reserves 768 output tokens and 768 tokens of headroom in addition to instructions and source labels. Every source sentence reaches a bounded selection pass; the tail is not silently dropped. Exact quoted text can still be inaccurate, contradictory or outdated in the original chart. Clinicians must review the result.

## Method and provenance

- Hardware: RTX 5070 Ti Laptop GPU, 12,227 MiB dedicated memory; Windows. Other user applications remained running. GPU free memory was approximately 2.5 GiB before evaluation, so Windows memory paging and concurrent workload can affect latency. Isolated peak memory and tokens/second were not measured.
- Browser: installed Microsoft Edge 155.0.4283.45, headless Playwright, native WebGPU (NVIDIA Blackwell, shader-f16), with `--enable-unsafe-webgpu --ignore-gpu-blocklist --use-angle=d3d11`. The bundled test Chromium adapter could enumerate the GPU but failed device creation with a DXIL driver error; it was not used for real inference results.
- Runtime: pinned bundled WebLLM 0.2.85; immutable MLC weight and compiled-library URLs in `src/local-llm/models.js`. Qwen3.5 2B/4B/9B use a 16,384-token configured context.
- Inputs: four development cases, then eight fixed regression cases in `tests/fixtures/local-note-eval.js`. Checks cover historical pregnancy dating, historical examination, conflicting medication doses, no diagnosis inferred from a medication, prior plans, incomplete prechart sections, a long source with important tail results, and untrusted instructions embedded in a note.
- The long case contains 64,053 characters, mostly deliberately repetitive administrative filler. It is a context stress test, not a representative complex longitudinal chart.
- Scoring uses fixed required evidence, prohibited output strings, exact quotation checks and the approved question bank. Expected answers are never included in model requests. This scoring does not establish clinical relevance or complete question selection.
- Reports include source hashes and raw model outputs. The clinical prompts were frozen for the fixed comparison; the later tokenizer change altered pass sizes, and the same cases were rerun as regressions. They are not an independent blinded holdout.
- Actual UI checks use the same shared WebGPU client, the real local Stanford de-identification worker, visible preview and explicit Apply callback. Network checks record unexpected external writes; all inputs are synthetic. No real patient notes were used.

## Reproducing

Run `npm.cmd run evaluate:local-notes -- qwen3.5-9b` (or `qwen3.5-4b`, `qwen3.5-2b`). This is opt-in and downloads several gigabytes on first load. The harness uses an isolated synthetic-only profile under ignored `tmp/`, fixed localhost port 41789, and checkpoints under ignored `reports/`. Do not run two evaluations against that profile/port simultaneously. `--smoke` checks load/self-tests; `--ui-only` repeats the real dialog check without repeating all cases.

## Known failure history

Development exposed weak free-form question wording, omitted baseline history in a long case, and an insufficient self-test output limit with thinking enabled. The architecture now constrains questions and facts to typed IDs, disables thinking, rejects incomplete results, and verifies both instruction following and tokenization. Earlier failures remain in local checkpoint reports. A fixed-run UI attempt also failed because the reused synthetic profile already had a patient and the test helper tried to fill a hidden new-patient field; the helper was corrected and the UI check rerun separately. That setup failure must not be reported as a successful end-to-end run.

## Limits

No M2 Mac was tested. The 0.8B and legacy Qwen3 choices have catalog and hardware-contract tests, not the real-model drafting comparison below. Runtime self-tests prove a narrow local execution boundary, not clinical accuracy. The current question bank is general follow-up support and cannot replace condition-specific history taking. Medical fine-tunes such as MedGemma and MediPhi remain candidates pending licensing, exact browser artifacts and evaluation; their names are not presented as runnable options.

## Measured results

| Model | Fixed drafting checks | Median successful short case | Long stress case | Real UI / de-id / Apply |
| --- | --- | --- | --- | --- |
| Qwen3.5 2B | 7/8 | 2.5 s | 35.0 s | Passed |
| Qwen3.5 4B | 8/8 | 4.3 s | 73.8 s | Passed |
| Qwen3.5 9B | 8/8 | 8.2 s | 110.0 s | Passed |

The 2B asthma case returned no selected excerpts despite useful source material. The app rejected that result instead of accepting an empty or invented note. This failure was retained, and prompts were not tuned to remove it. The 4B and 9B models passed all eight literal checks, including both historical and conflicting facts and the critical tail results. All three real UI checks retained the explicit current BP of 164/96, removed thinking markup and completed the explicit Apply callback; no external writes were observed. Source token counts came from each loaded tokenizer. The long stress input was processed in two source passes.

4B is the practical starting point on this tested laptop: it passed the same small check set as 9B and produced shorter waits. This does not prove equal clinical quality. 2B remains a lower-memory option with a demonstrated selection failure; the 0.8B model has not undergone this comparison. Recommendations in the picker estimate hardware fit, not clinical ability.

First-time 4B download/load/self-test took 156 seconds. Cached load/self-test on the UI reruns took approximately 5 seconds for 4B and 18 seconds for 9B (see exact values in reports); 2B loaded from cache in about 5 seconds. Download latency depends on the connection and should not be counted as per-patient drafting time. Drafting times varied with other applications and concurrent regression tests, so these measurements should be treated as observed waits rather than controlled speed rankings.

Raw synthetic results, source hashes and setup failures: [2B](local-note-evaluation/qwen3.5-2b.json), [4B](local-note-evaluation/qwen3.5-4b.json), [9B](local-note-evaluation/qwen3.5-9b.json). The 4B and 9B fixed-run setup failures remain visible; their successful UI-only reruns are included separately.
