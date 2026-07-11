export const DEFAULT_PRIMARY_MODEL_ID = "onnx-community/stanford-deidentifier-base-ONNX";
export const GLINER_PII_MODEL_ID = "onnx-community/gliner_multi_pii-v1";
export const OPENAI_PRIVACY_FILTER_MODEL_ID = "openai/privacy-filter";
export const ETTIN_68M_NEMOTRON_PII_MODEL_ID = "kalyan-ks/ettin-68m-nemotron-pii";
export const KNOWLEDGATOR_GLINER_PII_MODEL_ID = "knowledgator/gliner-pii-base-v1.0";
export const DEFAULT_FALLBACK_MODEL_ID = "rtrigoso/bert-small-pii-detection-ONNX";
// This is a direct ONNX export of OpenMed/OpenMed-PII-SuperClinical-Large-434M-v1.
// Keep the converted repository and immutable revision together in the model-pack
// registry so browser inference never resolves a mutable remote `main` revision.
export const OPENMED_MODEL_ID = "Wismut/openmed-onnx/large";
export const OPENMED_BASE_MODEL_ID = "Wismut/openmed-onnx/base";
export const OPENMED_SMALL_MODEL_ID = "Wismut/openmed-onnx/small";
export const MULTILANG_PII_MODEL_ID = "onnx-community/multilang-pii-ner-ONNX";
export const I2B2_CLINICALBERT_MODEL_ID = "onnx-community/deid_bert_i2b2-ONNX";
export const DEFAULT_DTYPE = "q8";

export const MODEL_PROFILES = {
  rtrigoso: {
    id: DEFAULT_FALLBACK_MODEL_ID,
    mobileFeasible: true,
    expectedQuantizedBytes: 28845474,
    notes: "Small Transformers.js ONNX PII model; fastest mobile fallback, but did not pass the current benchmark gate."
  },
  stanford: {
    id: DEFAULT_PRIMARY_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 109651017,
    notes: "Clinical deidentifier primary; larger, but selected by the current benchmark gate."
  },
  openmed: {
    id: OPENMED_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 1738303341,
    notes: "Direct ONNX export of OpenMed SuperClinical Large (434M). The FP32 model is approximately 1.6 GB and is intended for a desktop browser with sufficient memory."
  },
  openmedBase: {
    id: OPENMED_BASE_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 736561517,
    notes: "Direct ONNX export of OpenMed SuperClinical Base (184M). FP32 WebGPU fallback for devices that cannot fit Large."
  },
  openmedSmall: {
    id: OPENMED_SMALL_MODEL_ID,
    mobileFeasible: true,
    expectedQuantizedBytes: 171750792,
    notes: "Direct ONNX export of OpenMed SuperClinical Small (44M). Its int8 export is the explicit CPU/WASM fallback for older devices."
  },
  multilang: {
    id: MULTILANG_PII_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 279000000,
    notes: "25-entity multilingual PII NER from ai4privacy dataset; broader entity coverage than Stanford."
  },
  i2b2: {
    id: I2B2_CLINICALBERT_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 109651017,
    notes: "ClinicalBERT fine-tuned on i2b2 2014 de-id; 11 HIPAA entity types, BILOU tagging."
  },
  gliner: {
    id: GLINER_PII_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 349120924,
    notes: "ONNX Community GLiNER multi-PII model with a Transformers.js-ready ONNX layout; use as the mature local cross-check for broad PII coverage."
  },
  openaiPrivacyFilter: {
    id: OPENAI_PRIVACY_FILTER_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: 945000000,
    notes: "OpenAI Privacy Filter q4 browser model; token-classification model with a long context window and context-aware privacy labels. Large local asset."
  },
  ettin68mNemotronPii: {
    id: ETTIN_68M_NEMOTRON_PII_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: null,
    notes: "68M Nemotron PII token classifier. The public repo currently provides safetensors only, so browser use requires an ONNX export under models/."
  },
  knowledgatorGlinerPiiBase: {
    id: KNOWLEDGATOR_GLINER_PII_MODEL_ID,
    mobileFeasible: false,
    expectedQuantizedBytes: null,
    notes: "Legacy Knowledgator GLiNER pack retained for existing local installs; new installs should use the ONNX Community multi-PII option."
  }
};
