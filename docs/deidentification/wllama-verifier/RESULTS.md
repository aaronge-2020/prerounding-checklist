# wllama verifier: feasibility results

## What was built

A two stage deidentification pipeline running fully in the browser with no
network inference: a frozen Stanford NER plus D1 through D12 rule first pass,
then an LLM reviewer (loaded through wllama) that rereads the note and returns
JSON spans, which are mapped back to character offsets. The harness lives in
this directory (`driver.mjs`, `score.py`).

## Verdict: feasible, but cut as a shipped stage

The pipeline works end to end, but two hard limits disqualify it:

* Model size: the sandbox loads only Qwen2.5-0.5B (398MB). Llama 3.2 1B and 3B
  both hit a worker memory quota, so no capable reviewer model runs here.
* Latency: the LLM reviewer takes 7 to 15 minutes per note on 2 vCPU. A dev
  200 evaluation would take roughly 20 hours. A background run died at note 10
  with zero usable LLM outputs after a runtime restart.

Latency alone disqualifies it regardless of quality. The pattern is proven and
waits on a capable machine: a 1B plus model at usable speed.

## Production path: ported to WebLLM (2026-10-01)

The verifier was ported to WebLLM as the production path
(commit `9d8850c4c1fbe3e315f55ce4947f151f97430b7b`). The same two stage design
(deterministic first pass plus LLM second reader) now runs inside Quick De-ID
against the user's GPU backed local models (selectable Qwen3 1.7B/4B), which
WebLLM serves far faster than the wllama sandbox setup. Verifier spans enter
the review queue with confidence 0.5 so the least certain first ordering
surfaces them first, and every failure path keeps the first pass.

The wllama harness in this directory remains the feasibility prototype.
