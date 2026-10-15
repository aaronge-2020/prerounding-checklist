# Browser-local model review

Reviewed 2026-10-15. Runtime: bundled WebLLM 0.2.85. The runtime catalog includes Qwen3.5 0.8B, 2B, 4B, and 9B and the previous Qwen3 1.7B/4B choices. These are general models, not clinically validated medical assistants. The app pins MLC weights and compiled libraries to immutable commits. They require WebGPU with shader-f16; a successful load and instruction-following and tokenizer self-test is mandatory in every loaded session. The self-test does not establish clinical accuracy.

## Hardware guidance

WebGPU adapter features, adapter description and buffer limits can be inspected. `navigator.deviceMemory` is a rounded, privacy-capped system RAM hint, not VRAM. Exact dedicated VRAM and Apple unified memory are not reliably exposed. The draft dialog allows an optional session-only user capacity: reserve 20% for a dedicated GPU, 45% for shared/unified memory before comparing runtime VRAM estimates. These estimates may still fail due to browser allocation, other applications, storage quota or driver limits. The general catalog can estimate Qwen3.5 9B for 12GB dedicated memory, but drafting excludes it after failed baseline/GPU checks and suggests 4B; unknown GPU capacity starts conservatively at 2B (4B with a sufficient system-memory hint). No model download starts until the user selects Load. Cancellation terminates the worker; cached files remain for retry.

## Primary sources and medical candidates

- [WebLLM advanced usage](https://webllm.mlc.ai/docs/user/advanced_usage.html): supported architectures, recurrent-state models such as Qwen3.5, and custom MLC model configuration.
- [MLC model weights](https://huggingface.co/mlc-ai): pinned model revisions are in `src/local-llm/models.js`. Library source is [MLC binary libraries](https://github.com/mlc-ai/binary-mlc-llm-libs).
- [MedGemma 1.5 4B](https://huggingface.co/google/medgemma-1.5-4b-it): a medical candidate with access and Health AI Developer Foundations terms. It is not included in the bundled WebLLM prebuilt catalog. Do not offer it as runnable until license/access handling, compatible MLC weights and library, text-only execution and local evaluation are established. A base Gemma library is not evidence of compatibility.
- [MediPhi Instruct](https://huggingface.co/microsoft/MediPhi-Instruct): a medical candidate, absent from the bundled prebuilt catalog. Base Phi support does not validate this fine-tune's tokenizer, architecture configuration or compiled artifacts. Conversion, license review and browser evaluation remain required.

Do not label a general Qwen model as a medical fine-tune or claim a benchmark leader solely from its size. No clinically representative comparison has been established here. Model release freshness and note fidelity are separate requirements.

## Promotion checklist for recurring maintenance

1. Check current primary model cards, licenses and evaluation reports; record dated links, context length and actual artifact sizes.
2. Verify a browser-compatible MLC conversion and compatible compiled WebGPU library for the exact bundled runtime. Pin weight and library revisions. Check tokenizer, context overrides, recurrent-state settings and required GPU features.
3. Run an actual browser load and self-test on available hardware. Record GPU/browser, load time, peak memory if measurable and generation rate. Explicitly record unmeasured quantities and unsupported hardware.
4. Use synthetic outpatient sources to evaluate historical versus current findings, unknown symptoms, explicit questions, no invented normal exams, contradiction handling and source-bounded section application. Keep frozen cases separate from development cases. Model-card medical QA scores alone do not validate note drafting.
5. Verify local-only inference, explicit download actions, offline reload, cancellation/retry, lock/patient-switch cleanup, worker lifecycle and output de-identification. Never use real patient data for research or evaluation.
6. Run targeted tests, then final CI. Prepare a reviewable change with its evaluation boundary. Do not silently replace defaults or introduce runtime catalog hydration, servers or cloud fallbacks. Publish only under explicit user authorization.

The monthly Codex review is separate from the app runtime. The static app never downloads a public catalog in the background.

## Drafting contract

The unloaded meter explicitly estimates tokens. Once loaded, the worker counts the source with that model's tokenizer, without a network request. Per-pass planning includes sentence labels, instructions, output reserve and headroom. Longer sources are covered in multiple passes, including their tail; a single oversized sentence produces an actionable error instead of truncation. The model selects source IDs under a JSON schema. Factual content is assembled from exact source sentences; today's entered updates are retained independently. Follow-up questions come from a fixed question bank selected by ID. Prior assessments and examinations remain historical, and the current assessment and examination stay blank. This constrains invention but cannot guarantee relevant or complete selection.

See [the actual browser evaluation](local-note-model-evaluation.md) for measured results and limitations.

## Clinical draft source assembly (2026-10-15 refinement)

Drafting chooses one chart representation. The default is the imported note plus explicitly selected objective results; the clinician can instead choose the edited working draft. They are never concatenated as duplicate chart histories. All carried-forward material remains historical unless explicitly entered as obtained today. Section boundaries and table captions/columns accompany source excerpts. A one-liner first extracts a bounded evidence set, then organizes patient-baseline, relevant-history and discrepancy IDs against that shorter set; it does not append the generic interview-question bank. Full drafts retain source-backed prior follow-up actions with blank status fields. See [refinement evaluation](local-note-draft-refinement.md) for results and limits.
