import {
  DEFAULT_DTYPE,
  DEFAULT_PRIMARY_MODEL_ID,
  ETTIN_68M_NEMOTRON_PII_MODEL_ID,
  OPENMED_BASE_MODEL_ID,
  OPENMED_MODEL_ID,
  OPENMED_SMALL_MODEL_ID,
  OPENAI_PRIVACY_FILTER_MODEL_ID
} from "../vault/deid/model-config.js?v=20260711-functional-remediation-15";

export const STRUCTURED_DEID_MODE = "structured";
// Only browser configurations that have a supported local execution path are
// offered in the clinician UI. Large WebGPU packs that repeatedly failed their
// own self-test are deliberately not selectable; a model is useful only when
// this app can verify a real local inference session.
export const DEFAULT_DEID_MODEL_KEY = "openmed-superclinical-small";

const ALL_DEID_MODEL_OPTIONS = [
  {
    key: "openmed-superclinical",
    label: "OpenMed clinical PII",
    shortLabel: "OpenMed clinical PII",
    modelId: OPENMED_MODEL_ID,
    openMedTier: "large",
    engine: "transformers-token-classification",
    dtype: "fp32",
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "1.63 GB ONNX",
    requiresWebGpu: true,
    localOnly: true,
    description: "Recommended medical-note model. This is the direct ONNX export of OpenMed/OpenMed-PII-SuperClinical-Large-434M-v1. Its FP32 Large weights require local WebGPU inference; it downloads once, is pinned to an immutable revision, and then runs only from local browser storage.",
    candidates: [
      {
        modelId: OPENMED_MODEL_ID,
        // The 434M model already occupies a large contiguous browser buffer.
        // Keep ORT's CPU arena and memory-pattern caches off so verification
        // does not allocate a second large host-side working set before the
        // WebGPU execution provider owns the weights.
        options: {
          dtype: "fp32",
          device: "webgpu",
          local_files_only: true,
          session_options: {
            executionMode: "sequential",
            enableCpuMemArena: false,
            enableMemPattern: false
          }
        },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: [
      "config.json",
      "special_tokens_map.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model.onnx"
    ],
    download: {
      provider: "Hugging Face",
      repository: "Wismut/openmed-onnx",
      revision: "763dff8d32cc23ff045dd396221f8be62cb1ca03",
      assets: [
        { path: "config.json", sourcePath: "large/config.json", bytes: 6287 },
        { path: "special_tokens_map.json", sourcePath: "large/special_tokens_map.json", bytes: 970 },
        { path: "tokenizer.json", sourcePath: "large/tokenizer.json", bytes: 8648864 },
        { path: "tokenizer_config.json", sourcePath: "large/tokenizer_config.json", bytes: 1315 },
        {
          path: "onnx/model.onnx",
          sourcePath: "large/model.onnx",
          bytes: 1738303341,
          etag: "33f40a02714cdb0a428e8ca72a08e32b047c2094766f627fb683d8a5af4e5eb7"
        }
      ]
    }
  },
  {
    key: "openmed-superclinical-base",
    label: "OpenMed clinical PII — Base",
    shortLabel: "OpenMed Base",
    modelId: OPENMED_BASE_MODEL_ID,
    openMedTier: "base",
    engine: "transformers-token-classification",
    dtype: "fp32",
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "711 MB ONNX + WebGPU",
    requiresWebGpu: true,
    localOnly: true,
    description: "184M OpenMed SuperClinical PII model. Use this WebGPU model when Large does not fit the device's available GPU memory.",
    candidates: [
      {
        modelId: OPENMED_BASE_MODEL_ID,
        options: { dtype: "fp32", device: "webgpu", local_files_only: true },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: ["config.json", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"],
    download: {
      provider: "Hugging Face",
      repository: "Wismut/openmed-onnx",
      revision: "763dff8d32cc23ff045dd396221f8be62cb1ca03",
      assets: [
        { path: "config.json", sourcePath: "base/config.json", bytes: 6327 },
        { path: "special_tokens_map.json", sourcePath: "base/special_tokens_map.json", bytes: 970 },
        { path: "tokenizer.json", sourcePath: "base/tokenizer.json", bytes: 8648962 },
        { path: "tokenizer_config.json", sourcePath: "base/tokenizer_config.json", bytes: 1423 },
        { path: "onnx/model.onnx", sourcePath: "base/model.onnx", bytes: 736561517, etag: "5ae3dac36d0e1d0d055ed83e0da2844f6b5ab566209905d56eedbbbf2d1d7e05" }
      ]
    }
  },
  {
    key: "openmed-superclinical-small",
    label: "OpenMed clinical PII — Small",
    shortLabel: "OpenMed Small",
    modelId: OPENMED_SMALL_MODEL_ID,
    openMedTier: "small",
    engine: "transformers-token-classification",
    dtype: "int8",
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "172 MB ONNX",
    // The regular runtime avoids the asyncify path that has trapped on
    // unaligned atomics in some Chromium worker environments. Keep this
    // explicit; Small is the low-resource CPU/WASM option.
    wasmRuntime: "standard",
    localOnly: true,
    description: "44M OpenMed SuperClinical PII model. The publisher's int8 ONNX export is the explicit local CPU/WASM option for older devices or browsers without WebGPU.",
    candidates: [
      {
        modelId: OPENMED_SMALL_MODEL_ID,
        options: { dtype: "int8", device: "wasm", local_files_only: true },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: ["config.json", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_int8.onnx"],
    download: {
      provider: "Hugging Face",
      repository: "Wismut/openmed-onnx",
      revision: "763dff8d32cc23ff045dd396221f8be62cb1ca03",
      assets: [
        { path: "config.json", sourcePath: "small/config.json", bytes: 6326 },
        { path: "special_tokens_map.json", sourcePath: "small/special_tokens_map.json", bytes: 970 },
        { path: "tokenizer.json", sourcePath: "small/tokenizer.json", bytes: 8648962 },
        { path: "tokenizer_config.json", sourcePath: "small/tokenizer_config.json", bytes: 1423 },
        { path: "onnx/model_int8.onnx", sourcePath: "small/model_int8.onnx", bytes: 171750792, etag: "cf6756eacfd73377130e1203b7e14ddd357a5b1f7f88c54d6428cdb677e7a5a0" }
      ]
    }
  },
  {
    key: "stanford-clinical",
    label: "Stanford clinical deidentifier",
    shortLabel: "Stanford clinical",
    modelId: DEFAULT_PRIMARY_MODEL_ID,
    engine: "transformers-token-classification",
    dtype: DEFAULT_DTYPE,
    browserRunnable: true,
    assetMode: "bundled",
    sizeLabel: "110 MB bundled",
    localOnly: true,
    description: "Bundled clinical de-identification model retained for offline compatibility.",
    candidates: [
      { modelId: DEFAULT_PRIMARY_MODEL_ID, options: { dtype: DEFAULT_DTYPE, local_files_only: true }, inferenceOptions: { aggregation_strategy: "simple" } }
    ]
  },
  {
    key: "openai-privacy-filter",
    label: "OpenAI Privacy Filter",
    shortLabel: "OpenAI Privacy Filter",
    modelId: OPENAI_PRIVACY_FILTER_MODEL_ID,
    engine: "transformers-token-classification",
    dtype: "q4",
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "918 MB + WebGPU",
    requiresWebGpu: true,
    localOnly: true,
    description: "Large open-weight privacy filter. Downloads its q4 weights once, then runs locally through WebGPU.",
    candidates: [
      {
        modelId: OPENAI_PRIVACY_FILTER_MODEL_ID,
        options: { dtype: "q4", device: "webgpu", local_files_only: true },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "viterbi_calibration.json",
      "onnx/model_q4.onnx",
      "onnx/model_q4.onnx_data"
    ],
    download: {
      provider: "Hugging Face",
      repository: "openai/privacy-filter",
      revision: "7ffa9a043d54d1be65afb281eddf0ffbe629385b",
      assets: [
        { path: "config.json", bytes: 3039 },
        { path: "tokenizer.json", bytes: 27868174 },
        { path: "tokenizer_config.json", bytes: 234 },
        { path: "viterbi_calibration.json", bytes: 372 },
        { path: "onnx/model_q4.onnx", bytes: 160219 },
        { path: "onnx/model_q4.onnx_data", bytes: 917120144 }
      ]
    }
  },
  {
    key: "ettin-68m-nemotron-pii",
    label: "Ettin 68M Nemotron PII",
    shortLabel: "Ettin 68M",
    modelId: ETTIN_68M_NEMOTRON_PII_MODEL_ID,
    engine: "transformers-token-classification",
    dtype: DEFAULT_DTYPE,
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "275 MB ONNX",
    localOnly: true,
    description: "68M Nemotron PII model. Downloads a pinned browser-ready ONNX export once, then runs locally.",
    candidates: [
      {
        modelId: ETTIN_68M_NEMOTRON_PII_MODEL_ID,
        options: { dtype: "fp32", local_files_only: true },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"],
    download: {
      provider: "Hugging Face",
      repository: "rulesentry-io/ettin-68m-nemotron-pii-onnx",
      revision: "84aab6066563d41b91060f654d691d4ada0822e0",
      assets: [
        { path: "config.json", bytes: 7480 },
        { path: "tokenizer.json", bytes: 3583327 },
        { path: "tokenizer_config.json", bytes: 20854 },
        { path: "onnx/model.onnx", sourcePath: "model.onnx", bytes: 274306747 }
      ]
    }
  },
  {
    key: "gliner-multi-pii",
    label: "GLiNER multi-PII",
    shortLabel: "GLiNER multi-PII",
    modelId: "onnx-community/gliner_multi_pii-v1",
    engine: "gliner",
    browserRunnable: true,
    assetMode: "installable",
    sizeLabel: "373 MB ONNX",
    localOnly: true,
    description: "Mature broad-PII GLiNER model with an ONNX Community Transformers.js layout. Use as the local alternate or cross-check.",
    candidates: [
      {
        modelId: "onnx-community/gliner_multi_pii-v1",
        options: { device: "wasm", local_files_only: true }
      }
    ],
    onnxModelPath: "onnx/model_int8.onnx",
    requiredFiles: [
      "config.json",
      "gliner_config.json",
      "added_tokens.json",
      "special_tokens_map.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "spm.model",
      "onnx/model_int8.onnx"
    ],
    download: {
      provider: "Hugging Face",
      storage: "cache",
      repository: "onnx-community/gliner_multi_pii-v1",
      revision: "2e0397a7e8a250d76c37122232b3cbde42c8d629",
      assets: [
        { path: "config.json", bytes: 28 },
        { path: "gliner_config.json", bytes: 732 },
        { path: "added_tokens.json", bytes: 86 },
        { path: "special_tokens_map.json", bytes: 286 },
        { path: "tokenizer.json", bytes: 16331948 },
        { path: "tokenizer_config.json", bytes: 1806 },
        { path: "spm.model", bytes: 4305025 },
        { path: "onnx/model_int8.onnx", bytes: 349120924 }
      ]
    }
  },
  {
    key: "obi-i2b2-validation",
    label: "obi i2b2 clinical validation",
    shortLabel: "obi i2b2 validation",
    modelId: "obi/deid_roberta_i2b2",
    engine: "offline-validation",
    browserRunnable: false,
    assetMode: "offline-validation",
    sizeLabel: "1.4 GB PyTorch",
    localOnly: true,
    disabledReason: "This PyTorch RoBERTa model is an offline validation reference, not a browser ONNX model. Run it in a separately managed local validator; it is never sent to a remote service.",
    description: "i2b2 medical-note de-identification reference model. Keep it for independent offline validation, not live browser inference.",
    candidates: []
  }
];

export const DEID_MODEL_OPTIONS = ALL_DEID_MODEL_OPTIONS.filter((option) => [
  "stanford-clinical",
  "openmed-superclinical-small",
  "gliner-multi-pii"
].includes(option.key));

export function deidModelOptionByKey(key) {
  return DEID_MODEL_OPTIONS.find((option) => option.key === key) || DEID_MODEL_OPTIONS[0];
}

export function runnableDeidModelOptions() {
  return DEID_MODEL_OPTIONS.filter((option) => option.browserRunnable);
}

export function deidModelCandidates(optionOrKey) {
  const option = typeof optionOrKey === "string" ? deidModelOptionByKey(optionOrKey) : optionOrKey;
  return (option?.candidates || []).map((candidate) => ({
    modelId: candidate.modelId,
    options: { ...(candidate.options || {}) },
    inferenceOptions: { ...(candidate.inferenceOptions || {}) }
  }));
}
