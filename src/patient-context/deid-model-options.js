import {
  DEFAULT_DTYPE,
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_PRIMARY_MODEL_ID,
  ETTIN_68M_NEMOTRON_PII_MODEL_ID,
  I2B2_CLINICALBERT_MODEL_ID,
  KNOWLEDGATOR_GLINER_PII_MODEL_ID,
  MULTILANG_PII_MODEL_ID,
  OPENAI_PRIVACY_FILTER_MODEL_ID
} from "../vault/deid/model-config.js";

export const STRUCTURED_DEID_MODE = "structured";
export const DEFAULT_DEID_MODEL_KEY = "stanford-clinical";

export const DEID_MODEL_OPTIONS = [
  {
    key: DEFAULT_DEID_MODEL_KEY,
    label: "Stanford clinical deidentifier",
    shortLabel: "Stanford clinical",
    modelId: DEFAULT_PRIMARY_MODEL_ID,
    engine: "transformers-token-classification",
    dtype: DEFAULT_DTYPE,
    browserRunnable: true,
    localOnly: true,
    description: "Current clinical primary model with local structured safeguards and installed fallbacks.",
    candidates: [
      { modelId: DEFAULT_PRIMARY_MODEL_ID, options: { dtype: DEFAULT_DTYPE, local_files_only: true } },
      { modelId: I2B2_CLINICALBERT_MODEL_ID, options: { dtype: DEFAULT_DTYPE, local_files_only: true } },
      { modelId: MULTILANG_PII_MODEL_ID, options: { dtype: DEFAULT_DTYPE, local_files_only: true } },
      { modelId: DEFAULT_FALLBACK_MODEL_ID, options: { dtype: DEFAULT_DTYPE, local_files_only: true } }
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
    requiresWebGpu: true,
    localOnly: true,
    description: "Large open-weight privacy filter. Runs locally in WebGPU after its optional q4 asset pack is installed beside a self-hosted copy.",
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
    ]
  },
  {
    key: "ettin-68m-nemotron-pii",
    label: "Ettin 68M Nemotron PII",
    shortLabel: "Ettin 68M",
    modelId: ETTIN_68M_NEMOTRON_PII_MODEL_ID,
    engine: "transformers-token-classification",
    dtype: DEFAULT_DTYPE,
    browserRunnable: true,
    localOnly: true,
    description: "68M Nemotron PII model. Runs from an optional local ONNX export installed into models/kalyan-ks/ettin-68m-nemotron-pii.",
    candidates: [
      {
        modelId: ETTIN_68M_NEMOTRON_PII_MODEL_ID,
        options: { dtype: "fp32", local_files_only: true },
        inferenceOptions: { aggregation_strategy: "simple" }
      }
    ],
    requiredFiles: ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model.onnx"]
  },
  {
    key: "knowledgator-gliner-pii-base",
    label: "Knowledgator GLiNER PII Base",
    shortLabel: "GLiNER PII Base",
    modelId: KNOWLEDGATOR_GLINER_PII_MODEL_ID,
    engine: "gliner",
    browserRunnable: true,
    localOnly: true,
    description: "Zero-shot GLiNER PII detector using a local GLiNER.js adapter and an optional local ONNX asset pack.",
    candidates: [
      {
        modelId: KNOWLEDGATOR_GLINER_PII_MODEL_ID,
        options: { device: "wasm", local_files_only: true }
      }
    ],
    requiredFiles: [
      "gliner_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "spm.model",
      "onnx/model_quint8.onnx"
    ]
  }
];

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
