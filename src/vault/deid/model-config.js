export const DEFAULT_PRIMARY_MODEL_ID = "onnx-community/stanford-deidentifier-base-ONNX";
export const GLINER_PII_MODEL_ID = "knowledgator/gliner-multi-pii-v1";
export const DEFAULT_FALLBACK_MODEL_ID = "rtrigoso/bert-small-pii-detection-ONNX";
export const OPENMED_MODEL_ID = "sidupadhyay/OpenMed-PII-SuperClinical-Small-44M-v1-ONNX";
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
    expectedQuantizedBytes: 283404624,
    notes: "Large clinical PII model; metadata-only in normal benchmark."
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
    expectedQuantizedBytes: 50000000,
    notes: "GLiNER multi-PII zero-shot NER; ~40+ entity types (SSN, ethnicity, profession, URL, IP, vehicle plate, etc.) in a single ~50MB ONNX-quantized model. Adopted by Microsoft Presidio late 2024."
  }
};
