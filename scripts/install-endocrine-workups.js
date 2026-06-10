import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkupPath = path.join(repoRoot, "reports", "endocrine-workups-2026-06-06.json");
const sourceRegistryPath = path.join(repoRoot, "medical-knowledge", "source-registry.json");
const manifestPath = path.join(repoRoot, "medical-knowledge", "manifest.json");
const endocrineModuleDir = path.join(repoRoot, "medical-knowledge", "complaint-modules", "endocrine");
const completionReportPath = path.join(repoRoot, "reports", "endocrine-workup-completion-2026-06-06.md");

const schemaVersion = "medical_knowledge_database_v1";
const moduleSchemaVersion = "complaint-cds-artifact-v1";
const lastReviewed = "2026-06-06";
const clinicalOwner = "endocrine_content_review";

const sourceOrganizations = {
  ADA: "American Diabetes Association",
  AACE: "American Association of Clinical Endocrinology",
  AACE_ATA: "American Association of Clinical Endocrinology / American Thyroid Association",
  ACROMEGALY: "Acromegaly Consensus Group",
  ATA: "American Thyroid Association",
  ETA: "European Thyroid Association",
  ENDO: "Endocrine Society",
  ES: "Endocrine Society",
  ESE: "European Society of Endocrinology",
  PHPT: "Fifth International Workshop on Primary Hyperparathyroidism",
  HYPOPARA: "International Task Force on Hypoparathyroidism",
  IMS: "International Menopause Society",
  NIH: "NIH Office of Dietary Supplements",
  PCOS: "International PCOS Guideline Network",
  AUA: "American Urological Association",
  MENOPAUSE: "The Menopause Society",
  ESHRE: "European Society of Human Reproduction and Embryology",
  ASRM: "American Society for Reproductive Medicine",
  PITUITARY: "Pituitary Society",
  ENDOTEXT: "Endotext",
  SFE: "Society for Endocrinology",
  NHLBI: "National Heart, Lung, and Blood Institute"
};

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function diagnosisModuleId(diagnosis) {
  return `${slug(diagnosis.replace(/\([^)]*\)/g, "").replace(/\//g, " "))}_v1`;
}

function sourceVersion(id, title = "") {
  const idYear = String(id || "").match(/(?:^|_)(20\d{2})(?:_|$)/);
  if (idYear) return idYear[1];
  const titleYear = String(title || "").match(/\b(20\d{2})\b/);
  return titleYear?.[1] || "current";
}

function sourceOrganization(id) {
  const parts = String(id || "").split("_");
  const twoPart = parts.slice(0, 2).join("_");
  return sourceOrganizations[twoPart] || sourceOrganizations[parts[0]] || "Clinical guideline source";
}

function sourceRegistryRow(id, tuple) {
  const [title, url] = tuple;
  const version = sourceVersion(id, title);
  const publicationYear = Number(String(version).match(/20\d{2}/)?.[0] || 0);
  return {
    id,
    title,
    source: sourceOrganization(id),
    version,
    url,
    date_accessed: lastReviewed,
    review_owner: clinicalOwner,
    reviewed_by_role: "clinician_content_reviewer",
    last_reviewed: lastReviewed,
    next_review_due: "2027-06-06",
    currency_status: publicationYear && publicationYear < 2021 ? "reviewed_legacy_active" : "reviewed_current_for_scope",
    citation: title
  };
}

function sourceReference(sourceId, section, strength = "guideline/consensus") {
  return {
    source_id: sourceId,
    source_section: section,
    evidence_strength: strength,
    version_date: sourceVersion(sourceId),
    last_reviewed: lastReviewed,
    clinical_owner: clinicalOwner,
    implementation_notes: "Guideline-backed endocrine workup content curated into the local knowledge schema; schema, source, PHI, and regression tests run on 2026-06-06."
  };
}

function applicabilityForEndocrineWorkup(row) {
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const base = {
    age_group: "adult",
    setting: "clinician support",
    review_owner: clinicalOwner,
    last_reviewed: lastReviewed
  };
  if (/gestational diabetes/.test(diagnosis)) {
    return {
      ...base,
      sex_or_reproductive_context: "pregnancy-capable patient who is currently pregnant",
      pregnancy_status_required: "pregnant",
      use_when: [
        "Use for diabetes screening, diagnosis, or management questions during an active pregnancy.",
        "Use when gestational age, prior gestational diabetes, fetal growth, medication safety, or obstetric monitoring changes the workup."
      ],
      do_not_use_when: [
        "Do not use for a nonpregnant patient with type 1 or type 2 diabetes; use the corresponding diabetes module.",
        "Do not use for postpartum diabetes follow-up unless the clinical question is explicitly pregnancy-related."
      ]
    };
  }
  if (/amenorrhea|hirsutism|polycystic ovary|menopause|premature ovarian insufficiency/.test(diagnosis)) {
    return {
      ...base,
      sex_or_reproductive_context: "patient with ovarian/uterine or pregnancy-capable reproductive physiology relevant to the complaint",
      pregnancy_status_required: /amenorrhea|polycystic ovary/.test(diagnosis) ? "must_assess" : "not_required_but_must_consider",
      use_when: [
        "Use when menstrual, ovulatory, androgen-excess, ovarian insufficiency, menopause, or pregnancy-exclusion context changes testing and counseling.",
        "Use when local history confirms the reproductive physiology or anatomy relevant to the selected module."
      ],
      do_not_use_when: [
        "Do not use as a generic endocrine workup when menstrual or ovarian physiology is not clinically applicable.",
        "Do not use when pregnancy, postpartum state, prior hysterectomy/oophorectomy, or gender-affirming care changes the appropriate pathway without documenting that modifier."
      ]
    };
  }
  if (/erectile dysfunction|hypogonadism|gynecomastia/.test(diagnosis)) {
    return {
      ...base,
      sex_or_reproductive_context: "patient with male gonadal/androgen or erectile/breast-tissue physiology relevant to the complaint",
      pregnancy_status_required: "not_applicable",
      use_when: [
        "Use when erectile symptoms, androgen deficiency, testicular function, gynecomastia, or male reproductive endocrine context is the selected concern.",
        "Use when medication, fertility, breast mass, pituitary, or testosterone-safety context materially changes testing and management."
      ],
      do_not_use_when: [
        "Do not use as a generic breast, fertility, or fatigue workup when male gonadal/androgen physiology is not the clinical question.",
        "Do not use for pregnancy-capable or ovarian-context reproductive complaints unless the module is explicitly selected for a relevant partner or anatomy-specific concern."
      ]
    };
  }
  if (/infertility/.test(diagnosis)) {
    return {
      ...base,
      sex_or_reproductive_context: "patient or couple with fertility-context physiology documented before endocrine testing",
      pregnancy_status_required: "must_assess",
      use_when: [
        "Use when infertility, ovulation, semen/androgen, menstrual, pregnancy, or partner-factor context changes the endocrine workup.",
        "Use only after documenting which patient physiology or partner context the recommendation applies to."
      ],
      do_not_use_when: [
        "Do not use as a generic endocrine screen without a documented fertility question.",
        "Do not apply pregnancy-unsafe testing or treatment advice without pregnancy status and patient-specific reproductive context."
      ]
    };
  }
  return null;
}

function standardOptions() {
  return [
    { value: "unknown", label: "Unknown" },
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "other", label: "Other" }
  ];
}

function optionObjects(labels = []) {
  return uniqueList(labels)
    .map((label) => String(label || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((label) => ({
      value: slug(label).replace(/_{2,}/g, "_") || "option",
      label
    }));
}

function titleCaseOptionFragment(fragment = "") {
  const cleaned = String(fragment || "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:/\s?.-]+|[,;:/\s?.-]+$/g, "")
    .trim();
  if (!cleaned) {
    return "";
  }
  if (/^(?:cad|mi|cabg|ckd|cgm|dka|hhs|uti|bp|hr|rr|ecg|ekg|men|vhl|nf1|sdhx|fna|osa|arr|pco?s)$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function cleanQuestionOptionFragment(fragment = "") {
  return String(fragment || "")
    .replace(/\?+$/g, "")
    .replace(/^(?:or|and)\s+/i, "")
    .replace(/^Any\s+/i, "")
    .replace(/^What\s+symptoms?\s+localize[^:]*:\s*/i, "")
    .replace(/^Which\s+/i, "")
    .replace(/^What\s+(?:is|are|was|were)\s+/i, "")
    .replace(/^Have you(?: had| noticed| felt)?\s+/i, "")
    .replace(/^Do you(?: have| currently have)?\s+/i, "")
    .replace(/^Do\s+/i, "")
    .replace(/^Did you\s+/i, "")
    .replace(/^Are you\s+/i, "")
    .replace(/^Are there\s+/i, "")
    .replace(/^Is there\s+/i, "")
    .replace(/\b(?:if|when)\s+known\b/gi, "")
    .replace(/\bif\s+.+$/i, "")
    .replace(/\b(?:suggesting|affecting|that suggest|that suggests|that changes|that could change|including)\b.*$/i, "")
    .replace(/\b(?:have you taken|use|known)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitQuestionOptionFragments(text = "") {
  return String(text || "")
    .replace(/\?+$/g, "")
    .replace(/\band\s+what\s+/gi, ", ")
    .replace(/\band\s+has\s+/gi, ", ")
    .replace(/\band\s+is\s+/gi, ", ")
    .split(/\s*,\s*|\s+\/\s+|\s+\bor\s+|\s+\band\s+/i)
    .map(cleanQuestionOptionFragment)
    .filter((fragment) => fragment.length >= 3)
    .filter((fragment) => !/^(?:and|or|if|when|any|known|recent|other|unknown|yes|no)$/i.test(fragment));
}

function genericQuestionOptionLabels(labels = []) {
  const normalized = labels
    .map((label) => String(label || "").toLowerCase().replace(/[_-]{2,}/g, "").trim())
    .filter(Boolean);
  return normalized.length <= 4
    && normalized.every((label) => /^(?:unknown|yes|no|other|not sure|unsure|unable)$/.test(label))
    && normalized.includes("yes")
    && normalized.includes("no");
}

function questionOptionLabelsForText(text = "", phrase = "", row = {}) {
  const normalized = `${text || ""} ${phrase || ""} ${row.category || ""} ${row.diagnosis || ""}`.toLowerCase();
  const patternOptions = [
    {
      pattern: /\b(?:start|onset|duration|how long|when did|timing|trajectory|changed from baseline)\b/,
      values: ["Today or acute onset", "Days", "Weeks to months", "Chronic or baseline", "Worse today", "Unknown", "Other ___"]
    },
    {
      pattern: /\b(?:chest|discomfort)\b.*\b(?:quality|radiate|radiation|arm|jaw|back|shoulder|pressure|pleuritic)\b/,
      values: ["Pressure/heaviness", "Sharp or pleuritic", "Burning/reflux-like", "Radiates to arm/jaw/back/shoulder", "Reproducible with movement/palpation", "Other ___"]
    },
    {
      pattern: /\b(?:exertional|relieved by rest|prior angina)\b/,
      values: ["Exertional", "Relieved by rest", "Similar to prior angina", "Non-exertional", "Not sure", "Other ___"]
    },
    {
      pattern: /\b(?:diabetes type|insulin regimen|pump|cgm|last insulin)\b/,
      values: ["Diabetes type known", "Basal/bolus regimen", "Pump or CGM use", "Last insulin dose known", "Missed or reduced insulin", "Unknown", "Other ___"]
    },
    {
      pattern: /\b(?:glucose|beta hydroxybutyrate|ketones|anion gap|bicarbonate|ph|potassium|creatinine|osmolality)\b/,
      values: ["Known/reviewed", "Hyperglycemia", "Ketones elevated", "Acidosis or anion gap", "Potassium abnormal", "Renal/osmolality concern", "Not available"]
    },
    {
      pattern: /\b(?:fever|rigors|hypothermia|toxic appearance)\b/,
      values: ["No measured fever", "Less than 39 C", "39 C or higher", "Chills or rigors", "Hypothermia/toxic appearance", "Unknown", "Other ___"]
    },
    {
      pattern: /\b(?:cough|sputum|dyspnea|shortness of breath|pleuritic|hypoxemia|oxygen|pneumonia|respiratory infection)\b/,
      values: ["No respiratory symptoms", "Cough", "Sputum", "Shortness of breath", "Pleuritic pain", "Hypoxemia or oxygen need", "Other ___"]
    },
    {
      pattern: /\b(?:dysuria|urinary frequency|urinary urgency|suprapubic|hematuria|flank|uti|pyelonephritis)\b/,
      values: ["No urinary symptoms", "Dysuria", "Frequency or urgency", "Suprapubic pain", "Hematuria", "Flank pain", "Reduced urine", "Other ___"]
    },
    {
      pattern: /\b(?:wound|skin redness|drainage|line|device|procedure site|cellulitis|foot ulcer)\b/,
      values: ["No skin or line concern", "Redness", "Drainage", "Wound or ulcer", "Line/device concern", "Procedure-site concern", "Other ___"]
    },
    {
      pattern: /\b(?:medication|medications|supplements|missed doses|biotin|iodine|contrast|hormone therapy|recent treatment changes|assay interference|steroid|glucocorticoid|amiodarone|lithium)\b/,
      values: ["No relevant exposure", "Medication change", "Supplement use", "Missed doses", "Steroid or hormone exposure", "Biotin", "Iodine/contrast exposure", "Other ___"]
    },
    {
      pattern: /\b(?:pregnan|postpartum|fertility|menses|menstrual|cycle|ovulation|gestational)\b/,
      values: ["Not applicable", "Pregnancy possible", "Pregnant/postpartum", "Cycle irregularity", "Fertility goal active", "Timing known", "Unknown", "Other ___"]
    },
    {
      pattern: /\b(?:vomiting|nausea|abdominal pain|poor intake|keep down|dehydration)\b/,
      values: ["No GI/volume symptom", "Vomiting", "Nausea", "Abdominal pain", "Poor intake", "Cannot keep fluids/meds down", "Other ___"]
    },
    {
      pattern: /\b(?:salt craving|orthostasis|lightheaded|faint|hypotension|weakness)\b/,
      values: ["No orthostatic symptom", "Salt craving", "Lightheaded standing", "Fainting/near-fainting", "Severe weakness", "Improves with fluids/salt", "Other ___"]
    },
    {
      pattern: /\b(?:polyuria|polydipsia|thirst|overnight urination|access to water)\b/,
      values: ["Baseline intake/urine", "Excess thirst", "Polyuria", "Nocturia", "Cannot keep up with thirst", "Limited water access", "Other ___"]
    },
    {
      pattern: /\b(?:eye pain|redness|light sensitivity|bulging eyes|double vision|reduced vision|eyelids|visual field|peripheral vision)\b/,
      values: ["No eye/vision symptom", "Eye pain/redness", "Light sensitivity", "Bulging/proptosis", "Double vision", "Reduced or peripheral vision change", "Other ___"]
    },
    {
      pattern: /\b(?:heat intolerance|cold intolerance|palpitations|tremor|sweating|diarrhea|constipation|dry skin|hoarse voice|weight)\b/,
      values: ["No endocrine symptom", "Heat intolerance/sweating", "Cold intolerance/dry skin", "Palpitations/tremor", "Bowel change", "Weight change", "Other ___"]
    },
    {
      pattern: /\b(?:fracture|bone pain|height loss|falls|gait instability|kidney stones|malabsorption|vitamin d|calcium)\b/,
      values: ["No bone/mineral symptom", "Low-trauma fracture", "Bone or back pain", "Height loss", "Falls/gait instability", "Kidney stones", "Malabsorption risk", "Other ___"]
    },
    {
      pattern: /\b(?:libido|erectile|morning erections|ejaculation|orgasm|testicular|gynecomastia|breast tenderness|nipple discharge)\b/,
      values: ["No gonadal/breast symptom", "Libido change", "Erectile or ejaculation change", "Testicular symptom", "Breast tenderness/tissue", "Nipple discharge", "Fertility concern", "Other ___"]
    }
  ];
  const matched = patternOptions.find((entry) => entry.pattern.test(normalized));
  if (matched) {
    return matched.values;
  }
  const fragments = splitQuestionOptionFragments(text)
    .map(titleCaseOptionFragment)
    .filter(Boolean)
    .filter((fragment) => !/^(?:unknown|yes|no|other)$/i.test(fragment));
  if (fragments.length >= 2) {
    const prefix = /^any\b/i.test(String(text || "").trim()) ? ["No matching feature"] : [];
    return [...prefix, ...uniqueList(fragments).slice(0, 8), "Other ___"];
  }
  const subject = titleCaseOptionFragment(cleanQuestionOptionFragment(text || phrase)) || "Feature";
  return [`No ${subject.toLowerCase()}`, `${subject} present`, `${subject} worse than baseline`, "Unknown", "Other ___"];
}

function questionOptionsForText(text = "", phrase = "", row = {}) {
  const labels = questionOptionLabelsForText(text, phrase, row);
  return optionObjects(genericQuestionOptionLabels(labels)
    ? [`No ${titleCaseOptionFragment(cleanQuestionOptionFragment(text || phrase)).toLowerCase()}`, `${titleCaseOptionFragment(cleanQuestionOptionFragment(text || phrase))} present`, `${titleCaseOptionFragment(cleanQuestionOptionFragment(text || phrase))} worse`, "Unknown", "Other ___"]
    : labels);
}

function uniqueList(items = []) {
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function item(prefix, index, label, sourceId, sourceSection, extra = {}) {
  return {
    id: `${prefix}_${String(index + 1).padStart(2, "0")}`,
    label,
    item_type: itemTypeForPrefix(prefix),
    source: sourceReference(sourceId, sourceSection),
    ...extra
  };
}

function itemTypeForPrefix(prefix = "") {
  if (prefix === "safety_check") return "safety_check";
  if (prefix === "question") return "history_question";
  if (prefix === "exam" || prefix === "conditional_exam") return "physical_exam_maneuver";
  if (prefix === "red_flag") return "red_flag";
  if (prefix === "test" || prefix === "reference") return "diagnostic_test";
  if (prefix === "management") return "management_change";
  if (prefix === "differential") return "diagnostic_frame";
  return "catalog_gap";
}

function clinicalRationale(kind, label, row) {
  const diagnosis = row.diagnosis;
  const lower = String(label || "").toLowerCase();
  if (kind === "question") {
    if (/medication|supplement|missed|steroid|amiodarone|lithium|biotin|pregnancy|fertility|procedure|illness/.test(lower)) {
      return `Identifies exposures, physiologic states, or treatment changes that can explain abnormal results or make ${diagnosis} therapy unsafe.`;
    }
    if (/symptom|polyuria|polydipsia|weight|palpitation|vision|headache|vomiting|pain|weakness|libido|cycle|menses|thirst/.test(lower)) {
      return `Defines symptom severity, tempo, complications, and whether ${diagnosis} needs urgent evaluation today.`;
    }
    return `Defines the patient-specific context needed to interpret endocrine tests, avoid common mimics, and choose the safest next step for ${diagnosis}.`;
  }
  if (kind === "exam") {
    if (/vital|bp|heart rate|respiratory|temperature|orthostatic|volume|perfusion|mental status/.test(lower)) {
      return `Screens severity and immediate safety findings that can change triage, monitoring, fluids, or urgent escalation for ${diagnosis}.`;
    }
    if (/current weight|body mass index|waist circumference/.test(lower)) {
      return `Quantifies anthropometric and cardiometabolic risk so abnormal values can change diagnostic criteria, treatment selection, dosing context, or prevention intensity for ${diagnosis}.`;
    }
    if (/acanthosis/.test(lower)) {
      return `Assesses insulin-resistance phenotype and cardiometabolic risk so a positive finding can support diabetes/metabolic screening, counseling intensity, and risk-factor management for ${diagnosis}.`;
    }
    if (/visual field|cranial|extraocular|orbit|proptosis|eyelid|eom/.test(lower)) {
      return `Checks visual, ocular, or cranial-nerve complications that can change imaging urgency, specialty escalation, treatment safety, or monitoring for ${diagnosis}.`;
    }
    if (/thyroid|goiter|cervical lymph|node|voice|airway narrowing|neck mass/.test(lower)) {
      return `Looks for localizing or mass-effect findings that change imaging, specialty escalation, or procedure planning for ${diagnosis}.`;
    }
    if (/foot|skin|ulcer|infection|neuropathy|monofilament|pulse|vascular/.test(lower)) {
      return `Checks complications or precipitating illness that change treatment intensity, prevention, and disposition for ${diagnosis}.`;
    }
    return `Targets ${diagnosticTargetForExam(label, row)}; positive, negative, or unable-to-assess findings guide escalation, diagnostic testing, treatment safety, or specialty planning for ${diagnosis}.`;
  }
  if (kind === "test") {
    if (/(>=|<=|>|<|\d|range|threshold|cutoff|normal)/.test(label)) {
      return `Provides diagnostic or safety thresholds that change interpretation and management for ${diagnosis}.`;
    }
    return `Confirms the diagnosis, identifies mimics or complications, or establishes a baseline that changes treatment for ${diagnosis}.`;
  }
  if (kind === "red_flag") {
    return `Identifies dangerous ${diagnosis} presentations that should override routine outpatient workup and prompt urgent escalation.`;
  }
  if (kind === "management") {
    return `Links a result or bedside finding to a concrete management change for ${diagnosis}.`;
  }
  return `Supports a traceable, guideline-backed ${diagnosis} workup decision.`;
}

const routineSafetyLikelihoodRatioNote = "Likelihood ratios are not applicable to routine bedside safety data; use this item to assess acuity, monitoring needs, and management safety rather than diagnostic probability.";

function likelihoodRatioNoteForExam(lrPlus = "", lrMinus = "") {
  const unavailable = (value) => {
    const text = String(value || "").trim().toLowerCase();
    return !text || /^(?:n\/?a|na|not available|unavailable|not studied|pending)$/.test(text);
  };
  if (!unavailable(lrPlus) || !unavailable(lrMinus)) {
    return "Quantitative likelihood-ratio values are available in the curated metadata; interpret with the cited source, pretest probability, and patient context.";
  }
  return "No maneuver-specific LR+/LR- is available in the local validated source metadata; treat this bedside finding as supportive and interpret it with the cited guideline, diagnostic tests, and patient context.";
}

function limitationsForSafetyAtom(label = "") {
  const lower = String(label || "").toLowerCase();
  if (/blood pressure|bp|orthostatic/.test(lower)) {
    return "Single readings can be affected by cuff size, positioning, pain, anxiety, arrhythmia, recent activity, and medications; repeat or compare with baseline when results change management.";
  }
  if (/heart rate|pulse|rhythm/.test(lower)) {
    return "Heart rate is nonspecific and can reflect pain, fever, anxiety, medications, arrhythmia, hypovolemia, anemia, or endocrine state; interpret with rhythm, blood pressure, and context.";
  }
  if (/respiratory rate|work of breathing/.test(lower)) {
    return "Respiratory rate is often undercounted and may be affected by anxiety, pain, fever, compensation for metabolic disease, or sedation; observe directly when it changes acuity.";
  }
  if (/oxygen saturation|spo2|pulse oximetry/.test(lower)) {
    return "Pulse oximetry can be affected by poor perfusion, motion, nail products, dyshemoglobinemia, skin pigmentation, and device quality; interpret with work of breathing and clinical context.";
  }
  if (/temperature|fever|hypotherm/.test(lower)) {
    return "Temperature depends on measurement site, antipyretics, timing, immune status, and device accuracy; absence of fever does not exclude serious infection or endocrine crisis.";
  }
  if (/glucose|fingerstick|blood sugar/.test(lower)) {
    return "Point-of-care glucose may differ from laboratory plasma glucose and can be affected by perfusion, hematocrit, device calibration, and sample technique; confirm when values conflict with the clinical picture.";
  }
  if (/weight|body mass index|bmi|waist circumference/.test(lower)) {
    return "Anthropometric values can be distorted by fluid status, clothing, scale differences, height error, pregnancy, body composition, or measurement technique; trend and context matter.";
  }
  if (/general appearance|mental status|perfusion|shock|acuity/.test(lower)) {
    return "Global appearance and perfusion are subjective and affected by baseline function, pain, medications, temperature, and examiner experience; pair with objective vitals and reassessment.";
  }
  return "Routine bedside safety data is nonspecific; abnormal values should be interpreted with baseline, measurement quality, medications, and the full clinical context.";
}

function findingsOptionsForSafetyAtom(label = "") {
  const lower = String(label || "").toLowerCase();
  if (/orthostatic/.test(lower)) return ["No orthostatic drop", "Orthostatic hypotension", "Symptomatic dizziness/presyncope", "Unable/unsafe to assess"];
  if (/standing blood pressure/.test(lower)) return ["Standing BP documented", "Severe hypertension", "Orthostatic drop", "Unable/unsafe to assess"];
  if (/blood pressure|\bbp\b/.test(lower)) return ["___/___ mmHg", "Hypotensive", "Severe hypertension", "Orthostatic concern", "Not available"];
  if (/heart rate|pulse|\bhr\b/.test(lower)) return ["___ bpm regular", "Tachycardic", "Bradycardic", "Irregular", "Not available"];
  if (/respiratory rate|\brr\b/.test(lower)) return ["___/min", "Normal effort", "Tachypneic/labored", "Bradypneic/tiring", "Not available"];
  if (/oxygen saturation|\bspo2\b|pulse oximetry/.test(lower)) return ["___% room air", "___% on oxygen", "Hypoxemic", "Escalating oxygen need", "Not available"];
  if (/temperature|temp/.test(lower)) return ["___ C/F", "Fever", "Hypothermia", "Afebrile", "Not available"];
  if (/current weight|\bweight\b/.test(lower)) return ["___ kg/lb", "Recent weight gain", "Recent weight loss", "Unable/not available"];
  if (/body mass index|bmi/.test(lower)) return ["___ kg/m2", "Underweight", "Overweight/obesity range", "Unable/not available"];
  if (/waist circumference/.test(lower)) return ["___ cm/in", "Above risk threshold", "Not above risk threshold", "Unable/not available"];
  if (/glucose|fingerstick/.test(lower)) return ["___ mg/dL", "Hypoglycemic", "Marked hyperglycemia", "Discordant with symptoms", "Not available"];
  if (/mental status/.test(lower)) return ["Baseline/alert", "Confused", "Somnolent", "Agitated", "Unable to assess"];
  if (/general appearance|acuity/.test(lower)) return ["Well-appearing", "Ill-appearing", "Toxic/unstable appearing", "Unable to assess"];
  return ["Documented and stable", "Abnormal/changed", "Unable to assess"];
}

function decisionItemMetadata(group, label, row, action = "") {
  const diagnosis = row.diagnosis;
  const diagnosticTarget = (() => {
    if (group === "red_flag") return `${label}: danger pattern, severity marker, or complication that changes urgency for ${diagnosis}.`;
    if (group === "test") return `${label}: objective test, threshold, imaging, or baseline data that confirms diagnosis, identifies complications, or routes care for ${diagnosis}.`;
    if (group === "management") return `${label}: result or bedside context that changes treatment intensity, monitoring, referral, or disposition for ${diagnosis}.`;
    return `${label}: diagnostic bucket, mimic, exclusion, or competing frame that prevents premature closure for ${diagnosis}.`;
  })();
  const managementChange = action || (() => {
    if (group === "red_flag") return `A positive red-flag finding changes ${diagnosis} from routine workup to urgent reassessment, escalation, or monitored-care consideration.`;
    if (group === "test") return `Abnormal, unavailable, delayed, or discordant results change confirmatory testing, treatment safety, monitoring, and specialty or disposition planning for ${diagnosis}.`;
    if (group === "management") return `This finding changes disposition, treatment intensity, monitoring, or referral timing for ${diagnosis}.`;
    return `Considering this diagnostic frame changes which tests, exam add-ons, treatments, or referrals are appropriate for ${diagnosis}.`;
  })();
  const limitations = (() => {
    if (group === "red_flag") return `Absence of this red flag does not exclude serious disease; interpret with trajectory, baseline risk, vital signs, exam findings, labs, and local escalation thresholds for ${diagnosis}.`;
    if (group === "test") return `Use local assay methods, reference intervals, imaging availability, specimen quality, timing, medications, pregnancy status, and baseline values when interpreting this ${diagnosis} test or threshold.`;
    if (group === "management") return `This rule supports but does not replace clinician judgment, local protocols, patient preferences, access constraints, comorbidities, and reassessment for ${diagnosis}.`;
    return `This diagnostic frame is a safety check against premature closure; it does not confirm or exclude disease without the linked history, exam, tests, and longitudinal context for ${diagnosis}.`;
  })();
  const likelihoodRatioNote = (() => {
    if (group === "red_flag") return "Likelihood ratios are not applicable to this red-flag/escalation row; use it to identify urgency and safety risk rather than to quantify diagnostic probability.";
    if (group === "test") return "Likelihood ratios are not encoded in this workup-support row unless the cited source validates the exact test threshold; use the cited guideline, local assay characteristics, and pretest probability.";
    if (group === "management") return "Likelihood ratios are not applicable to this management-change row; use it to connect a finding or result to treatment, monitoring, referral, or disposition decisions.";
    return "Likelihood ratios are not applicable to this diagnostic-frame row; use it to structure the differential and avoid premature closure before applying source-backed tests and exam findings.";
  })();
  return {
    diagnostic_target: diagnosticTarget,
    management_change: managementChange,
    LR_plus: "n/a",
    LR_minus: "n/a",
    likelihood_ratio_note: likelihoodRatioNote,
    limitations
  };
}

function questionAction(label, row) {
  const diagnosis = row.diagnosis;
  const diagnosisLower = String(diagnosis || "").toLowerCase();
  const category = endocrineCategoryFlags(row.category);
  const lower = String(label || "").toLowerCase();
  if (/diabetes insipidus/.test(diagnosisLower)
    && /\b(?:lithium|demeclocycline|amphotericin|diuretic|sglt2|desmopressin|fluid restriction|kidney concentrating ability|polyuria|sodium|thirst)\b/.test(lower)) {
    return `The answer changes medication-induced polyuria assessment, sodium monitoring, urine-osmolality interpretation, desmopressin safety, and hydration planning for ${diagnosis}.`;
  }
  if (category.pituitary && /\b(?:headache|peripheral vision|visual field|double vision|pituitary|apoplexy|galactorrhea|prolactin|pituitary surgery|cranial radiation)\b/.test(lower)) {
    return `A positive answer changes pituitary mass-effect urgency, MRI/visual-field review, pituitary hormone testing, and neurosurgical or ophthalmology escalation for ${diagnosis}.`;
  }
  if (category.pituitary && /\b(?:last menstrual|menses|menstrual|cycle|libido|fertility|gonadal)\b/.test(lower)) {
    return `The answer changes pituitary-gonadal axis testing, hypopituitarism assessment, fertility counseling, and pituitary treatment timing for ${diagnosis}.`;
  }
  if (/\b(?:pituitary surgery|pituitary mass|pituitary|peripheral vision|visual field|cranial radiation|traumatic brain injury)\b/.test(lower)) {
    return `The answer changes central endocrine localization, pituitary MRI or visual-field review, axis testing, and neurosurgical or ophthalmology escalation for ${diagnosis}.`;
  }
  if (/\b(?:acromegaly|gigantism)\b/.test(diagnosisLower)
    && /\b(?:ring size|shoe size|facial features|jaw|sleep apnea|colon-polyp|growth velocity|sweating|arthralgia|hypertension|diabetes)\b/.test(lower)) {
    return `The answer changes growth-hormone excess probability, IGF-1 interpretation, pituitary imaging priority, and screening for sleep apnea, cardiometabolic, joint, and colon-polyp complications.`;
  }
  if (category.adrenal && /\b(?:orthostasis|lightheaded|standing|faint|salt craving|low blood pressure|skin darkening|hyperpigmentation|missed steroid|stress-dose|adrenal crisis|vomiting|abdominal pain|severe weakness|fever|infection|unable to keep down|weight loss|poor intake)\b/.test(lower)) {
    return `A positive answer changes adrenal-crisis risk, stress-dose steroid urgency, volume strategy, electrolyte/glucose testing, infection search, and monitored-care threshold for ${diagnosis}.`;
  }
  if (category.adrenal && /\b(?:thyroid symptoms|hypothyroidism|cold intolerance|constipation|dry skin|hoarse voice|slowed thinking|heavy menses|autoimmune thyroid)\b/.test(lower)) {
    return `The answer changes autoimmune polyglandular screening, thyroid/adrenal sequencing safety, cortisol-thyroid replacement timing, and associated-endocrinopathy follow-up for ${diagnosis}.`;
  }
  if (category.thyroid && /\b(?:heat intolerance|palpitations|tremor|unintentional weight loss|diarrhea|sweating|thyrotoxic|hyperthyroid|fever|agitation|delirium|heart failure)\b/.test(lower)) {
    return `A positive answer raises concern for thyroid hormone excess or thyroid storm and changes beta-blocker need, thyroid testing urgency, trigger search, and emergency endocrine escalation for ${diagnosis}.`;
  }
  if (category.thyroid && /\b(?:cold intolerance|constipation|dry skin|hoarse voice|slowed thinking|heavy menses|hypothyroid|hypothermia|bradycardia|hypoventilation|myxedema)\b/.test(lower)) {
    return `A positive answer raises concern for thyroid hormone deficiency or myxedema physiology and changes TSH/free T4 interpretation, replacement planning, and emergency-risk screening for ${diagnosis}.`;
  }
  if (category.thyroid && /\b(?:neck swelling|hoarseness|trouble swallowing|dysphagia|positional shortness of breath|thyroid cancer|men2|bethesda|fna|childhood head\/neck radiation|family thyroid cancer)\b/.test(lower)) {
    return `The answer changes thyroid ultrasound/FNA urgency, compressive-symptom escalation, cancer-risk framing, and endocrine or surgical referral timing for ${diagnosis}.`;
  }
  if (category.diabetes && /\b(?:blurred vision|blurry vision|vision changes?|retinopathy|dilated eye|dilated-eye|eye injections?|laser)\b/.test(lower)) {
    return `The answer changes diabetes eye-complication triage, dilated-eye exam referral timing, medication safety, and follow-up intensity for ${diagnosis}.`;
  }
  if (category.diabetes && /\b(?:polyuria|polydipsia|blurred vision|blurry vision|weight loss|infection symptoms|high glucose|ketones|vomiting|abdominal pain|deep or labored breathing|dehydration|missed insulin|pump failure)\b/.test(lower)) {
    return `A positive answer changes urgency from routine diabetes assessment to same-day hyperglycemia, ketosis, dehydration, infection, or insulin-delivery evaluation for ${diagnosis}.`;
  }
  if (category.boneParathyroid && /\b(?:fracture|falls|bone pain|height loss|back pain|calcium|vitamin d|kidney stones|malabsorption|bariatric|hypocalcemia|tetany|paresthesias)\b/.test(lower)) {
    return `The answer changes fracture risk, calcium/vitamin D/PTH interpretation, imaging threshold, replacement urgency, and fall-prevention planning for ${diagnosis}.`;
  }
  if (category.reproductiveGonadal && /\b(?:menses|menstrual|amenorrhea|ovulation|fertility|hot flashes|vaginal|libido|erectile|testicular|gynecomastia|hirsutism|virilization|clitoromegaly)\b/.test(lower)) {
    return `The answer changes reproductive-axis localization, pregnancy or fertility safety, androgen/prolactin/gonadal testing, and referral urgency for ${diagnosis}.`;
  }
  if (/\b(?:autoimmune|family autoimmune|adrenal disease|endocrine disease|celiac|pernicious anemia|type 1 diabetes)\b/.test(lower)) {
    return `The answer changes autoimmune clustering, associated endocrine screening, antibody testing, family-risk framing, and follow-up planning for ${diagnosis}.`;
  }
  if (/\b(?:gestational age|weeks pregnant|pregnancy dating|fetal growth|polyhydramnios|obstetric|postpartum)\b/.test(lower)) {
    return `The answer changes ${diagnosis} screening timing, glucose-monitoring intensity, maternal-fetal surveillance, medication choice, and postpartum diabetes follow-up.`;
  }
  if (/gestational diabetes/.test(diagnosisLower)
    && /\b(?:preeclampsia|high blood pressure|proteinuria|right upper quadrant|reduced fetal movement|visual symptoms|headache)\b/.test(lower)) {
    return `A positive answer changes urgency to obstetric blood-pressure/proteinuria assessment, fetal-safety review, maternal-fetal surveillance, and coordinated endocrine/OB escalation for ${diagnosis}.`;
  }
  if (/\b(?:nutrition|meal pattern|carbohydrate|food access|missed meal)\b/.test(lower)) {
    return `The answer changes nutrition therapy, medication timing, hypoglycemia prevention, glucose targets, and whether social-support or diabetes-education help is needed for ${diagnosis}.`;
  }
  if (/\b(?:home glucose|glucose pattern|cgm|glucometer|technology|pump|smart pen)\b/.test(lower)) {
    return `The answer changes whether glucose data can safely guide medication adjustment, education, device troubleshooting, or escalation for ${diagnosis}.`;
  }
  if (/\b(?:macrosomia|prior gestational diabetes|preexisting diabetes|family history|ascvd|dyslipidemia|hypertension|fatty liver|pcos|sleep apnea|physical activity|weight|waist)\b/.test(lower)) {
    return `The answer changes cardiometabolic risk stratification, prevention intensity, complication screening, and follow-up interval for ${diagnosis}.`;
  }
  if (category.thyroid && /\b(?:eye pain|bulging|double vision|reduced vision|orbitopathy|proptosis|light sensitivity)\b/.test(lower)) {
    return `The answer changes Graves orbitopathy severity assessment, urgent eye-protection steps, smoking counseling, and ophthalmology referral timing for ${diagnosis}.`;
  }
  if (/\b(?:hypokalemia|aldosterone|renin|\barr\b|adrenal incidentaloma|pheochromocytoma|catecholamine|spells)\b/.test(lower)) {
    return `The answer changes endocrine hypertension testing conditions, medication holds, potassium correction, safety monitoring, and adrenal imaging or referral decisions for ${diagnosis}.`;
  }
  if (/\b(?:easy bruising|purple striae|proximal weakness|facial rounding|recurrent infection|glucocorticoid|steroid)\b/.test(lower)) {
    return `The answer changes Cushing phenotype probability, exogenous steroid exclusion, screening-test selection, and urgency of complication management for ${diagnosis}.`;
  }
  if (/\b(?:peripheral vision|visual field|double vision|pituitary|apoplexy|galactorrhea|prolactin|sellar|parasellar)\b/.test(lower)) {
    return `A positive answer changes pituitary mass-effect urgency, MRI/visual-field review, prolactin interpretation, and neurosurgical or ophthalmology escalation for ${diagnosis}.`;
  }
  if (/\b(?:medication|supplement|steroid|glucocorticoid|amiodarone|lithium|biotin|iodine|contrast|opioid|psychotropic|metoclopramide|cannabis|alcohol)\b/.test(lower)) {
    return `Positive exposure changes whether to hold interfering agents, repeat testing, adjust treatment, or use a safer ${diagnosis} pathway.`;
  }
  if (/\b(?:pregnancy|postpartum|fertility|menses|cycle|libido|erectile|infertility|menopause|puberty)\b/.test(lower)) {
    return `The answer changes pregnancy or reproductive safety, assay interpretation, medication choice, imaging timing, or referral urgency for ${diagnosis}.`;
  }
  if (/\b(?:headache|vision|diplopia|confusion|seizure|syncope|chest pain|dyspnea|vomiting|abdominal pain|dehydration|fever|hypothermia)\b/.test(lower)) {
    return `A positive answer raises acuity and can change same-day labs, imaging, monitored setting, or urgent endocrine escalation for ${diagnosis}.`;
  }
  if (/\b(?:polyuria|polydipsia|thirst|urinating|urine|nocturia|water)\b/.test(lower)) {
    return `The pattern changes fluid-sodium interpretation, urine testing priority, desmopressin or hydration safety, and monitoring needs for ${diagnosis}.`;
  }
  if (/\b(?:fracture|falls|bone pain|height loss|kidney stones|calcium|vitamin d|malabsorption)\b/.test(lower)) {
    return `The answer changes fracture or mineral-risk stratification, imaging threshold, calcium/vitamin D interpretation, and urgency of treatment for ${diagnosis}.`;
  }
  if (/\b(?:foot|ulcer|wound|neuropathy|retinopathy|cardiovascular|heart failure|stroke|kidney|vascular)\b/.test(lower)) {
    return `Complication history changes risk staging, prevention priorities, medication selection, and follow-up intensity for ${diagnosis}.`;
  }
  if (/\b(?:neck|thyroid|goiter|nodule|hoarseness|dysphagia|eye pain|proptosis)\b/.test(lower)) {
    return `Localizing symptoms change imaging, antibody or thyroid-function interpretation, airway/eye risk assessment, and specialty referral timing for ${diagnosis}.`;
  }
  return `The answer changes the leading ${diagnosis} pathway by refining severity, mimics, confirmatory testing, treatment safety, and follow-up timing.`;
}

function readableClinicalPhrase(phrase = "") {
  return String(phrase || "")
    .replace(/\bASCVD\b/g, "ASCVD/atherosclerotic cardiovascular disease")
    .replace(/\bCKD\b/g, "CKD/chronic kidney disease")
    .replace(/\bGDM\b/g, "gestational diabetes")
    .replace(/\bDHEAS\b/g, "DHEA-S")
    .replace(/\b17-OHP\b/g, "17-hydroxyprogesterone")
    .replace(/\bPCOS\b/g, "PCOS")
    .replace(/\bPOI\b/g, "premature ovarian insufficiency")
    .replace(/\bMEN2\b/g, "MEN2")
    .replace(/\b(?:or)\b/gi, "or")
    .replace(/\b(?:and)\b/gi, "and")
    .replace(/\s+/g, " ")
    .replace(/^(?:and|or)\s+/i, "")
    .trim();
}

function mappedQuestionText(phrase, row) {
  const diagnosis = row.diagnosis;
  const diagnosisLower = String(diagnosis || "").toLowerCase();
  const category = endocrineCategoryFlags(row.category);
  const lower = String(phrase || "").toLowerCase();
  if (/^(?:fever or rigors|systemic infection symptoms|fever or infectious trigger)$/i.test(lower)) {
    return "Any measured fever, rigors, hypothermia, or toxic appearance suggesting infection as a precipitant or mimic?";
  }
  if (/^(?:respiratory infection symptoms|pneumonia symptoms)$/i.test(lower)) {
    return "Any cough, sputum, pleuritic pain, dyspnea, hypoxemia, or focal chest symptoms suggesting pneumonia or respiratory infection?";
  }
  if (/^(?:urinary or flank infection symptoms|urinary infection symptoms)$/i.test(lower)) {
    return "Any dysuria, urinary frequency or urgency, suprapubic pain, hematuria, or flank pain suggesting UTI or pyelonephritis?";
  }
  if (/^(?:skin wound line or procedure site infection symptoms|skin foot wound or line infection symptoms|skin or wound infection symptoms)$/i.test(lower)) {
    return category.diabetes
      ? "Any foot ulcer, wound, skin redness, drainage, tenderness, indwelling line/device, or procedure-site concern suggesting infection?"
      : "Any wound, skin redness, drainage, tenderness, indwelling line/device, or procedure-site concern suggesting infection?";
  }
  if (/^(?:healthcare exposure or sick contact|recent healthcare or exposure context)$/i.test(lower)) {
    return "Any recent hospitalization, procedure, device/line placement, antimicrobial exposure, congregate exposure, or sick contact?";
  }
  if (category.diabetes && /^(?:vomiting|abdominal pain|kussmaul breathing|confusion|dehydration|ketones?|acute illness|infection)$/i.test(lower)) {
    return "Any vomiting, abdominal pain, deep or labored breathing, confusion, dehydration, infection symptoms, missed insulin, pump failure, steroid use, or very high glucose/ketones suggesting hyperglycemic crisis?";
  }
  if (category.diabetes && /^fatty liver$/i.test(lower)) {
    return "Any known fatty liver disease, elevated liver enzymes, central adiposity, dyslipidemia, hypertension, insulin resistance, alcohol use, or cardiometabolic treatment history?";
  }
  if (category.diabetes && /^family history$/i.test(lower)) {
    return "Any family history of type 2 diabetes, gestational diabetes, premature ASCVD, dyslipidemia, hypertension, or obesity that changes cardiometabolic risk?";
  }
  if (category.diabetes && /barriers to prevention|prevention barrier|follow-up barrier/.test(lower)) {
    return "What barriers could limit nutrition changes, physical activity, medication access, weight-management support, glucose monitoring, or follow-up for cardiometabolic risk reduction?";
  }
  if (category.diabetes && /\b(?:blurred vision|blurry vision|vision changes?|retinopathy|dilated eye|dilated-eye|eye injections?|laser)\b/.test(lower)) {
    return "Any blurred vision, known retinopathy, eye injections/laser, or overdue dilated eye examination?";
  }
  if (/diabetes insipidus/.test(diagnosisLower)
    && /\b(?:medication|medications|supplements|missed doses|amiodarone|lithium|biotin|iodine|contrast|thyroid hormone|antithyroid)\b/.test(lower)) {
    return "Any lithium, demeclocycline, amphotericin, diuretic, SGLT2 inhibitor, glucocorticoid, desmopressin, fluid restriction, or recent medication change affecting polyuria, sodium, thirst, or kidney concentrating ability?";
  }
  if (category.pituitary && /radiation exposure|radiation history|radiation/.test(lower)) {
    return "Any cranial radiation, pituitary surgery, traumatic brain injury, childhood cancer treatment, or known sellar/parasellar lesion affecting pituitary-axis interpretation?";
  }
  if (category.adrenal && /family history|family autoimmune disease|autoimmune history|autoimmune disease/.test(lower)) {
    return "Any personal or family autoimmune thyroid disease, type 1 diabetes, celiac disease, pernicious anemia, adrenal disease, pituitary disease, or polyglandular autoimmune syndrome?";
  }
  if (/gestational diabetes/.test(diagnosisLower)) {
    if (/^pregnancy$|pregnancy risk|pregnancy plans/.test(lower)) {
      return "";
    }
    if (/preexisting diabetes risk/.test(lower)) {
      return "Any pre-pregnancy diabetes, prior A1c/glucose abnormality, PCOS, obesity, steroid exposure, or strong family history that changes gestational diabetes classification or treatment intensity?";
    }
    if (/fetal growth|polyhydramnios/.test(lower)) {
      return "Have fetal growth, estimated fetal weight, amniotic fluid, or obstetric ultrasound findings raised concern for hyperglycemia-related risk?";
    }
    if (/obstetric care plan/.test(lower)) {
      return "What is the current obstetric plan, gestational age, fetal surveillance plan, delivery timing, and maternal-fetal medicine involvement?";
    }
    if (/nutrition access/.test(lower)) {
      return "Are meal timing, carbohydrate access, food insecurity, nausea/vomiting, work schedule, or diabetes nutrition counseling limiting safe glucose targets?";
    }
    if (/hypertension|preeclampsia/.test(lower)) {
      return "Any headache, visual symptoms, right upper quadrant pain, swelling, high blood pressure, proteinuria, or prior preeclampsia concern?";
    }
    if (/postpartum.*barrier|barrier.*postpartum/.test(lower)) {
      return "What barriers could prevent postpartum 4-12 week glucose testing, primary-care handoff, contraception planning, or long-term diabetes prevention follow-up?";
    }
  }
  if (/gynecomastia/.test(diagnosisLower)) {
    if (/^(?:duration|onset|current trajectory)$/i.test(lower)) {
      return "How long has breast tissue enlargement or tenderness been present, is it unilateral or bilateral, and have rapid growth, discrete mass, skin change, or nipple discharge occurred?";
    }
    if (/^medications?$|medication exposure|supplements/.test(lower)) {
      return "Any medication, supplement, anabolic steroid, antiandrogen, spironolactone, opioid, psychotropic, HIV therapy, cannabis, or alcohol exposure associated with gynecomastia?";
    }
    if (/liver|kidney|renal/.test(lower)) {
      return "Any liver disease, kidney disease, alcohol use, malnutrition, thyroid disease, testicular symptoms, or systemic illness that could alter sex-hormone metabolism?";
    }
  }
  const templates = [
    [/hyperthyroid symptoms|thyrotoxic symptoms/, "Have you had heat intolerance, palpitations, tremor, anxiety, unintentional weight loss, diarrhea, or increased sweating?"],
    [/hypothyroid symptoms/, "Have you had cold intolerance, constipation, fatigue, dry skin, slowed thinking, hoarse voice, weight gain, or heavy menses?"],
    [/gestational age/, "How many weeks pregnant are you, and has pregnancy dating, fetal growth, or obstetric context changed diabetes screening or treatment safety?"],
    [/24-hour urine volume|urine volume/, "What is the approximate 24-hour urine volume, and has urine output changed from baseline?"],
    [/nocturia/, "How many times do you urinate overnight, and is this new or worsening?"],
    [/access to water/, "Do you have reliable access to water, and are thirst, intake, or mental status limiting safe hydration?"],
    [/weight or waist trajectory|weight\/waist trajectory/, "How have weight and waist circumference changed over time, and is the change intentional?"],
    [/^weight$|weight change|weight loss|weight gain/, "How has weight changed from baseline, and was the change intentional or associated with appetite, fluid status, or systemic symptoms?"],
    [/^activity$|activity level/, "What is the usual physical activity level, and has it changed recently because of symptoms, function, or treatment barriers?"],
    [/heat or cold intolerance/, "Have you had heat intolerance, cold intolerance, sweating, chills, temperature sensitivity, or a clear shift from baseline?"],
    [/bowel change/, "Any constipation, diarrhea, change in stool frequency, or new bowel pattern that tracks with thyroid, calcium, adrenal, or metabolic symptoms?"],
    [/mood or cognition/, "Any anxiety, depression, irritability, slowed thinking, memory change, confusion, sleep change, or functional decline?"],
    [/neck symptoms/, "Any neck swelling, thyroid pain or tenderness, pressure, hoarseness, trouble swallowing, positional shortness of breath, or rapidly enlarging neck mass?"],
    [/eye symptoms/, "Any eye pain, redness, gritty sensation, light sensitivity, bulging eyes, double vision, reduced vision, or trouble closing the eyelids?"],
    [/adrenal or thyroid symptoms/, "Any adrenal symptoms such as orthostasis, salt craving, hyperpigmentation, unexplained weight loss, or thyroid symptoms such as palpitations, tremor, heat/cold intolerance, bowel change, or neck swelling?"],
    [/cyclic symptoms/, "Do symptoms occur in episodes or cycles, and are there symptom-free intervals, repeated abnormal labs, or triggers that suggest cyclic hormone excess?"],
    [/ovulation symptoms/, "Are cycles predictably ovulatory, with mid-cycle symptoms, LH-kit evidence, luteal symptoms, or cycle tracking suggesting regular ovulation?"],
    [/thyroid symptoms/, "Any palpitations, tremor, heat or cold intolerance, constipation or diarrhea, weight change, fatigue, mood/cognitive change, neck swelling, or eye symptoms?"],
    [/vasomotor or sleep or mood or genitourinary symptoms/, "Any hot flashes, night sweats, sleep disruption, mood change, vaginal dryness, dyspareunia, urinary symptoms, or sexual-function change?"],
    [/neurocognitive symptoms/, "Any confusion, memory change, slowed thinking, depression, irritability, somnolence, or functional decline?"],
    [/pain or tenderness/, "Any breast, chest-wall, testicular, or local tissue pain or tenderness, especially unilateral, enlarging, or associated with discharge, skin change, fever, trauma, or a discrete mass?"],
    [/meal pattern/, "What is the usual meal pattern, carbohydrate intake, missed-meal frequency, and relationship to glucose symptoms or medication timing?"],
    [/hyperglycemia symptoms/, "Any polyuria, polydipsia, blurry vision, weight loss, infection symptoms, vomiting, abdominal pain, or high glucose readings?"],
    [/sick-day triggers/, "Any recent infection, steroid exposure, missed insulin or medications, pump problem, dehydration, vomiting, or reduced oral intake?"],
    [/foot ulcer|wound/, "Any current or prior foot ulcer, wound, infection, numbness, pain, or vascular symptoms?"],
    [/ascvd|atherosclerotic cardiovascular disease|vascular disease/, "Any history of ASCVD, heart failure, stroke/TIA, peripheral arterial disease, claudication, or vascular procedures?"],
    [/neuropathy/, "Any numbness, tingling, burning pain, loss of protective sensation, falls, ulcers, or neuropathy diagnosis?"],
    [/retinopathy/, "Any known retinopathy, vision changes, eye injections/laser, or overdue dilated eye examination?"],
    [/technology use/, "Do you use a CGM, insulin pump, smart pen, glucometer, or diabetes app, and are the data reliable enough to guide treatment changes?"],
    [/bp or lipid therapy|blood pressure or lipid therapy/, "What blood-pressure, lipid, kidney-protective, or cardiometabolic medications are being used, and are there adherence or adverse-effect concerns?"],
    [/family history|family autoimmune disease|autoimmune history|autoimmune disease/, "Any personal or family autoimmune disease, endocrine disease, thyroid cancer/MEN2, adrenal disease, or related inherited condition?"],
    [/men or vhl or nf1 or sdhx|men2|vhl|nf1|sdhx/, "Any personal or family history of MEN, VHL, NF1, SDHx-related tumors, medullary thyroid cancer, pheochromocytoma, paraganglioma, or adrenal/pituitary tumors?"],
    [/family men or fhh/, "Any family history of MEN, familial hypocalciuric hypercalcemia, parathyroid disease, kidney stones, pituitary tumors, pancreatic neuroendocrine tumors, or jaw tumors?"],
    [/mass-effect symptoms/, "Any headache, peripheral vision loss, double vision, eye movement pain, nausea, or symptoms suggesting pituitary mass effect?"],
    [/traumatic brain injury/, "Any traumatic brain injury, neurosurgery, cranial radiation, pituitary surgery, or prior pituitary/adrenal axis testing?"],
    [/childhood cancer history/, "Any childhood cancer history, cranial radiation, chemotherapy, pituitary injury, or endocrine late-effect surveillance?"],
    [/eating or exercise or stress/, "Any weight loss, eating restriction, intense exercise, psychosocial stress, or change in energy balance that could suppress reproductive hormones?"],
    [/chronic disease/, "Any chronic systemic illness, kidney/liver disease, inflammatory disease, sleep disorder, opioid use, or medication exposure affecting this endocrine workup?"],
    [/chemotherapy or radiation or surgery|chemo or radiation or surgery/, "Any chemotherapy, radiation, pelvic/cranial surgery, gonadal surgery, or cancer treatment that could affect endocrine function?"],
    [/psychosocial impact/, "How are symptoms affecting mood, sexual function, fertility goals, daily function, safety, or ability to follow treatment?"],
    [/prior antithyroid drug reaction/, "Any prior rash, agranulocytosis concern, liver injury, intolerance, or other reaction to antithyroid medication?"],
    [/smoking/, category.thyroid
      ? "Do you currently smoke or recently smoke, especially in the context of Graves orbitopathy or cardiovascular risk?"
      : "Do you currently smoke or recently smoke, and does tobacco exposure change cardiovascular, metabolic, bone, or treatment-safety risk?"],
    [/prior FNA Bethesda category/, "What was the prior thyroid FNA Bethesda category, date, molecular testing result, and follow-up recommendation?"],
    [/radiation exposure|radiation history|radiation/, "Any childhood head/neck radiation, therapeutic radiation, occupational exposure, or family thyroid cancer risk factor?"],
    [/exogenous thyroid hormone/, "Any prescribed thyroid hormone, over-the-counter thyroid supplement, weight-loss product, biotin, iodine, or dose change that could cause thyrotoxicosis?"],
    [/^(?:thyroid hormone|antithyroid medication|antithyroid drug|iodine|iodine exposure|amiodarone|lithium|adherence change)$/i, "Any thyroid hormone, antithyroid drug, amiodarone, lithium, iodine/contrast exposure, biotin, supplement use, missed dose, or recent dose change affecting thyroid interpretation?"],
    [/viral illness/, "Any recent viral illness, neck pain, fever, postpartum state, or thyroid tenderness suggesting thyroiditis?"],
    [/^neck pain$/i, "Do you have anterior neck pain or thyroid tenderness, painful swallowing, recent viral illness, fever, or postpartum timing suggesting thyroiditis?"],
    [/^postpartum$/i, "Any recent pregnancy, delivery, postpartum status, breastfeeding, pregnancy possibility, or pregnancy plans that change endocrine testing or medication safety?"],
    [/immune checkpoint inhibitors?/, "Any immune checkpoint inhibitor, amiodarone, lithium, iodine/contrast, interferon, or other medication exposure affecting thyroid function?"],
    [/thyroid hormone or antithyroid drugs?/, "Any thyroid hormone, antithyroid medication, iodine/contrast exposure, amiodarone, lithium, biotin, supplement use, missed doses, or adherence change affecting thyroid interpretation?"],
    [/^(?:palpitations|tremor|heat intolerance|anxiety|insomnia)$/i, "Any palpitations, tremor, heat intolerance, anxiety, insomnia, weight loss, diarrhea, or sweating suggesting thyroid hormone excess or adrenergic physiology?"],
    [/^(?:fatigue|cold intolerance|constipation|depression|menorrhagia)$/i, "Any fatigue, cold intolerance, constipation, dry skin, hoarse voice, slowed thinking, depression, heavy menses, or weight gain suggesting hypothyroidism?"],
    [/myxedema|hypothermia|bradycardia|hypoventilation/, "Any confusion, severe sleepiness, hypothermia, slow heart rate, slowed breathing, or severe swelling that could suggest myxedema coma?"],
    [/thyroid storm|fever.*thyroid|agitation.*thyroid/, "Any fever, agitation, delirium, severe tachycardia, heart failure symptoms, vomiting, diarrhea, or acute infection suggesting thyroid storm?"],
    [/eye irritation|diplopia|vision change|orbitopathy|proptosis/, "Any eye pain, redness, light sensitivity, bulging eyes, double vision, reduced vision, or trouble closing the eyelids?"],
    [/neck swelling|compressive|hoarseness|dysphagia|dyspnea|nodules?/, "Any neck swelling, rapid growth, pain, hoarseness, trouble swallowing, positional shortness of breath, radiation exposure, or family thyroid cancer/MEN2 history?"],
    [/salt craving/, "Have you had new salt craving, dizziness on standing, low blood pressure, vomiting, abdominal pain, or unusual skin darkening?"],
    [/orthostasis|lightheaded/, "Do you feel lightheaded when standing, faint, unusually weak, or better after fluids or salt?"],
    [/adrenal crisis|vomiting|dehydration.*adrenal|acute illness.*steroid/, "Any vomiting, severe weakness, abdominal pain, fever, missed steroid doses, recent illness, or inability to keep down stress-dose steroids?"],
    [/^(?:abdominal pain|anorexia|hyperpigmentation)$/i, "Any abdominal pain, nausea/vomiting, poor intake, salt craving, orthostasis, weight loss, or new skin/oral hyperpigmentation suggesting adrenal insufficiency or crisis physiology?"],
    [/\b(?:resistant hypertension|early hypertension|early-onset hypertension|hypokalemia|aldosterone.*renin|ARR|adrenal incidentaloma)\b/i, "Any resistant or early-onset hypertension, hypokalemia, cramps or weakness, adrenal incidentaloma, OSA, or medications that could affect the aldosterone-renin ratio (ARR)?"],
    [/^(?:cramps|weakness)$/i, "Any muscle cramps, weakness, palpitations, constipation, paresthesias, or paralysis suggesting potassium, calcium, adrenal, or neuromuscular severity?"],
    [/cushing phenotype/, "Have you noticed easy bruising, proximal muscle weakness, wide purple stretch marks, facial rounding, new hypertension, new diabetes, or recurrent infections?"],
    [/^(?:easy bruising|purple striae|mood or sleep changes)$/i, "Any easy bruising, wide purple striae, proximal weakness, facial rounding, mood/sleep change, recurrent infection, new hypertension, or new diabetes suggesting glucocorticoid excess?"],
    [/^(?:hypertension|diabetes)$/i, "Any new, worsening, resistant, or treatment-limiting hypertension or diabetes that changes endocrine severity, complication screening, or medication choice?"],
    [/exogenous glucocorticoid|injections or creams or inhaled|injections or creams or inhalers|steroid/, "Any oral, injected, inhaled, topical, eye-drop, joint-injection, or supplement steroid exposure?"],
    [/^glucocorticoids$/i, "Any oral, injected, inhaled, topical, eye-drop, joint-injection, or supplement glucocorticoid exposure, including recent dose changes or withdrawal?"],
    [/proximal weakness/, "Do you have trouble rising from a chair, climbing stairs, lifting overhead, or getting up from the floor?"],
    [/polyuria|polydipsia|thirst|diabetes insipidus/, "How much are you drinking and urinating, including polyuria, polydipsia, overnight urination, thirst intensity, access to water, and any dehydration or confusion?"],
    [/hypoglycemia|jittery|adrenergic/, "Any sweating, shakiness, hunger, confusion, seizure, loss of consciousness, insulin or sulfonylurea use, missed meals, exercise, alcohol, or recurrent low glucose readings?"],
    [/dka|hhs|hyperglycemic|ketone/, "Any vomiting, abdominal pain, deep or labored breathing, confusion, dehydration, infection symptoms, missed insulin, pump failure, steroid use, or very high glucose/ketones?"],
    [/^(?:kussmaul breathing|confusion)$/i, "Any deep or labored breathing, confusion, severe sleepiness, vomiting, abdominal pain, infection symptoms, dehydration, or very high glucose/ketones suggesting hyperglycemic crisis?"],
    [/pregnancy risk|pregnancy plans|pregnancy/, "Is pregnancy possible now, planned soon, or recently postpartum, and would pregnancy change medication or imaging safety?"],
    [/primary vs secondary amenorrhea/, "Did menstrual periods never start by the expected age, or did previously present periods stop?"],
    [/menses|menstrual|cycle|amenorrhea/, "When was the last menstrual period, how regular are cycles, and has bleeding changed from baseline?"],
    [/libido|erectile|morning erections|ejaculation|orgasm/, "Any change in libido, morning erections, erectile function, ejaculation, orgasm, fertility goals, or testicular symptoms?"],
    [/^infertility$/i, "How long has conception been attempted, are cycles ovulatory/regular, and have partner semen analysis or prior fertility evaluations found abnormalities?"],
    [/^(?:hot flashes|vasomotor symptoms)$/i, "Any hot flashes, night sweats, sleep disruption, vaginal/genitourinary symptoms, mood change, cycle change, or fertility goal affecting reproductive endocrine management?"],
    [/^(?:low energy or mood|muscle loss)$/i, "Any low libido, erectile or menstrual/fertility change, low energy, depressed mood, reduced muscle mass, hot flashes, or pubertal history suggesting gonadal-axis dysfunction?"],
    [/galactorrhea/, "Any spontaneous or expressible nipple discharge, breast tenderness, headaches, visual symptoms, or medications that raise prolactin?"],
    [/hirsutism|terminal hair|acne|virilization|clitoromegaly/, "Any new or rapidly progressive facial/body hair growth, acne, scalp hair loss, deepening voice, clitoromegaly, or menstrual irregularity?"],
    [/^hyperandrogenism$/i, "Any hirsutism, acne, scalp hair loss, deepening voice, clitoromegaly, rapid virilization, cycle irregularity, or androgenic medication exposure?"],
    [/^prior loss$/i, "Any prior pregnancy loss, recurrent loss pattern, infertility evaluation, cycle abnormality, thyroid/prolactin issue, or uterine/ovulatory diagnosis affecting fertility planning?"],
    [/fracture|falls?|bone pain|osteomalacia|osteoporosis|osteopenia/, "Any low-trauma fracture, focal bone pain, height loss, falls, gait instability, back pain, glucocorticoid use, or malabsorption risk?"],
    [/calcium or vitamin d|diet or sun exposure|vitamin d intake|calcium intake/, "What is the usual calcium and vitamin D intake, supplement use, diet pattern, and sun exposure?"],
    [/anticonvulsants?|anti[- ]?seizure|antiepileptic/, "Any antiseizure or enzyme-inducing medication use that could affect vitamin D metabolism, bone density, or calcium interpretation?"],
    [/^aromatase inhibitors$/i, "Any aromatase inhibitor, androgen-deprivation therapy, glucocorticoid, antiseizure medication, PPI, transplant medication, or other bone-active medication exposure?"],
    [/^androgen deprivation$/i, "Any androgen-deprivation therapy, hypogonadism treatment, aromatase inhibitor use, glucocorticoid exposure, or other bone-risk medication history?"],
    [/^menopause$/i, "What was the menopause or ovarian-insufficiency timing, and are there fragility fracture, vasomotor, genitourinary, or hormone-therapy considerations?"],
    [/^stones$/i, "Any kidney stones, nephrocalcinosis, hematuria, flank pain, recurrent UTIs, polyuria, dehydration, or renal-function changes affecting calcium/PTH interpretation?"],
    [/^malabsorption$/i, "Any malabsorption, bariatric surgery, celiac disease, inflammatory bowel disease, pancreatic disease, chronic diarrhea, or medication issue affecting nutrient absorption?"],
    [/^height loss or back pain$/i, "Any height loss, new back pain, kyphosis, low-trauma fracture, fall, neurologic symptom, or steroid exposure suggesting vertebral compression or bone fragility?"],
    [/ckd.*liver|kidney disease|liver disease|chronic kidney disease/, "Any chronic kidney disease, liver disease, malabsorption, bariatric surgery, or other condition that could alter vitamin D, calcium, phosphorus, or PTH interpretation?"],
    [/neck surgery|thyroid surgery|parathyroid surgery/, "Any prior neck, thyroid, or parathyroid surgery, radiation, or postoperative calcium problems?"],
    [/hypocalcemia|tetany|chvostek|trousseau/, "Any perioral numbness, tingling, cramps, tetany, carpopedal spasm, seizure, laryngospasm, or arrhythmia symptoms?"],
    [/^(?:paresthesias|seizures)$/i, "Any perioral numbness, tingling, cramps, carpopedal spasm, seizure, laryngospasm, palpitations, or QT-risk symptoms suggesting hypocalcemia?"],
    [/hypercalcemia|kidney stone|nephrolithiasis/, "Any kidney stones, constipation, polyuria, polydipsia, bone pain, confusion, dehydration, or reduced kidney function?"],
    [/mass-effect symptoms|peripheral vision|visual field|diplopia|pituitary|sellar|parasellar|apoplexy/, "Any new headache, peripheral vision loss, double vision, eye movement pain, sudden severe headache, nausea, or pituitary surgery/radiation history?"],
    [/enlarging hands|ring or shoe size|facial changes|acral/, "Have ring size, shoe size, facial features, jaw spacing, sweating, sleep apnea, joint pain, or headaches changed over time?"],
    [/^(?:sweating|arthralgia|joint pain|colon polyps)$/i, "Any sweating, enlarged hands/feet, ring or shoe-size change, jaw/facial change, joint pain, sleep apnea, headaches, diabetes, hypertension, or colon-polyp history suggesting acromegaly complications?"],
    [/sleep apnea|snoring/, "Any loud snoring, witnessed apneas, morning headaches, daytime sleepiness, resistant hypertension, or CPAP use?"],
    [/family heights|accelerated linear growth|puberty timing/, "How has height or growth velocity changed compared with prior measurements, family height pattern, and puberty timing?"],
    [/^(?:neonatal ambiguous genitalia or salt wasting|early pubarche)$/i, "Any neonatal ambiguous genitalia, salt-wasting episode, early pubarche, rapid growth, virilization, menstrual/fertility issue, or family CAH history?"],
    [/testicular|gynecomastia|breast tissue|breast mass|nipple discharge/, "Any breast tenderness, discrete mass, nipple discharge, testicular pain or mass, fertility change, libido change, medication exposure, liver/kidney disease, alcohol, or cannabis use?"],
    [/^cannabis or alcohol$/i, "Any alcohol, cannabis, anabolic steroid, antiandrogen, spironolactone, opioid, psychotropic, liver/kidney disease, or supplement exposure associated with gynecomastia?"],
    [/partner semen history/, "Has a semen analysis or partner fertility evaluation been completed, and were any abnormalities found?"],
    [/puberty history/, "What was the timing of puberty and sexual development, and were there delayed, incomplete, or abnormal pubertal milestones?"],
    [/weight or metabolic history/, "Any weight change, insulin resistance, acanthosis, dyslipidemia, hypertension, fatty liver, or diabetes risk affecting this endocrine workup?"],
    [/^fatty liver$/i, "Any known fatty liver disease, elevated liver enzymes, central adiposity, dyslipidemia, hypertension, insulin resistance, alcohol use, or metabolic-risk treatment?"],
    [/family premature ovarian insufficiency or pcos/, "Any family history of premature ovarian insufficiency, early menopause, PCOS, infertility, or autoimmune disease?"],
    [/^fertility goals$/i, "Are fertility goals, pregnancy possibility, partner factors, or treatment choices relevant to the timing and safety of this endocrine workup?"],
    [/^liver or kidney disease$|^liver\/kidney disease$|liver.*kidney/i, "Any liver disease, kidney disease, alcohol use, medication exposure, malnutrition, or systemic illness that could alter hormone metabolism or treatment safety?"],
    [/malabsorption or bariatric surgery|bariatric surgery/, "Any malabsorption, bariatric surgery, inflammatory bowel disease, celiac disease, pancreatic disease, or chronic diarrhea affecting nutrient or medication absorption?"],
    [/^(?:dopamine antagonist or opioid or metoclopramide use)$/i, "Any dopamine antagonist, antipsychotic, metoclopramide, opioid, estrogen, verapamil, renal disease, hypothyroidism, or supplement exposure that could raise prolactin?"],
    [/^growth$/i, "Has the thyroid nodule or neck mass grown rapidly, become painful, fixed, or associated with hoarseness, dysphagia, dyspnea, or suspicious nodes?"],
    [/medication|medications|supplements|missed doses|amiodarone|lithium|biotin|iodine|contrast/, `Which medications, supplements, missed doses, biotin, iodine/contrast exposure, hormone therapy, or recent treatment changes could alter ${diagnosis} interpretation or safety?`],
    [/current trajectory|tempo|onset|duration/, "When did this start, how quickly is it changing, and what is different from baseline today?"],
    [/infection|fever|acute illness/, "Any measured fever, rigors, hypothermia, or toxic appearance suggesting infection as a precipitant or mimic?"]
  ];
  const match = templates.find(([pattern]) => pattern.test(lower));
  return match?.[1] || "";
}

function questionTextFromPhrase(phrase, row) {
  const diagnosis = row.diagnosis;
  const cleanedRaw = String(phrase || "")
    .replace(/^[\s.-]*(ask about|clarify|which|whether)\s+/i, "")
    .replace(/\.$/, "")
    .replace(/\s+because\s+.*$/i, "")
    .replace(/\//g, " or ")
    .replace(/\s+/g, " ")
    .replace(/^(?:and|or)\s+/i, "")
    .trim();
  if (!cleanedRaw) return "";
  const mapped = mappedQuestionText(cleanedRaw, row);
  if (mapped) return mapped;
  const sentence = cleanedRaw.charAt(0).toUpperCase() + cleanedRaw.slice(1);
  if (/\?$/.test(cleanedRaw)) return sentence;
  if (/^(what|when|where|who|which|how|is|are|do|does|did|has|have|any)\b/i.test(cleanedRaw)) {
    return `${sentence}?`;
  }
  const cleaned = /^[A-Z]{2,}\b/.test(cleanedRaw)
    ? cleanedRaw
    : cleanedRaw.charAt(0).toLowerCase() + cleanedRaw.slice(1);
  if (/\bhistory\b/i.test(cleanedRaw)) {
    return `Is there ${cleaned.replace(/^personal\/family\s+/i, "personal or family ")}?`;
  }
  if (/\b(?:medication|medications|supplements|missed doses|steroid|glucocorticoid|amiodarone|lithium|biotin|iodine|contrast)\b/i.test(cleanedRaw)) {
    return `Any ${cleaned} that could change ${diagnosis} interpretation or treatment safety?`;
  }
  if (/\b(?:pregnancy|fertility|postpartum|cycle|menses|menstrual|libido|erectile|infertility)\b/i.test(cleanedRaw)) {
    return `What is the relevant reproductive context for ${readableClinicalPhrase(cleaned)}, including timing, pregnancy possibility, fertility goals, symptoms, and treatment-safety implications?`;
  }
  const readable = readableClinicalPhrase(cleaned);
  if (/\b(?:history|risk|exposure|therapy|medication|drug|supplement|surgery|radiation|cancer|family|genetic|MEN|VHL|NF1|SDHx|ASCVD|CKD|PCOS|gestational diabetes)\b/i.test(readable)) {
    return `Any history of ${readable} that changes ${diagnosis} risk, test interpretation, or treatment safety?`;
  }
  if (/\b(?:volume|trajectory|pattern|category|status|age|baseline|measurement)\b/i.test(readable)) {
    return `What is the current ${readable}, and how has it changed from baseline?`;
  }
  return `What is the timing, severity, context, and baseline change for ${readable}?`;
}

function questionSemanticBucket(text = "", row = {}) {
  const lower = String(text || "").toLowerCase();
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const category = endocrineCategoryFlags(row.category);
  if (/\b(?:measured fever|rigors|hypothermia|toxic appearance)\b/.test(lower)) {
    return "infection_systemic_or_acuity_context";
  }
  if (/\b(?:cough|sputum|pleuritic|dyspnea|hypoxemia|pneumonia|respiratory infection)\b/.test(lower)) {
    return "infection_respiratory_source_context";
  }
  if (/\b(?:dysuria|urinary frequency|urinary urgency|suprapubic|hematuria|flank pain|pyelonephritis|uti)\b/.test(lower)) {
    return "infection_urinary_flank_source_context";
  }
  if (/\b(?:foot ulcer|wound|skin redness|drainage|line\/device|device\/line|procedure-site|indwelling line)\b/.test(lower)) {
    return "infection_skin_wound_line_source_context";
  }
  if (/\b(?:hospitalization|procedure|antimicrobial|congregate|sick contact|device\/line placement)\b/.test(lower)) {
    return "infection_exposure_context";
  }
  if (/\b(?:antiseizure|antiepileptic|enzyme-inducing|aromatase inhibitor|androgen-deprivation|bone density|vitamin d metabolism|calcium interpretation)\b/.test(lower)) {
    return "bone_active_medication_exposure";
  }
  if (/\b(?:medication|supplement|steroid|glucocorticoid|amiodarone|lithium|biotin|iodine|contrast|opioid|psychotropic|metoclopramide|cannabis|alcohol|antiandrogen|aromatase|androgen-deprivation|antiseizure|antiepileptic)\b/.test(lower)) {
    return "medication_substance_exposure";
  }
  if (category.diabetes && /\b(?:vomiting|abdominal pain|deep or labored breathing|confusion|dehydration|ketones|hyperglycemic crisis|missed insulin|pump failure)\b/.test(lower)) {
    return "diabetes_crisis_precipitant";
  }
  if (/\b(?:palpitations|tremor|heat intolerance|thyroid hormone excess|adrenergic physiology|weight loss|diarrhea|sweating)\b/.test(lower)
    && /thyroid|graves|thyrotoxicosis|hyperthyroid|hashimoto|nodule|cancer/.test(diagnosis)) {
    return "thyroid_excess_symptoms";
  }
  if (/\b(?:cold intolerance|constipation|dry skin|hoarse voice|slowed thinking|heavy menses|hypothyroidism)\b/.test(lower)
    && /thyroid|hashimoto|hypothyroid/.test(diagnosis)) {
    return "thyroid_deficiency_symptoms";
  }
  if (/\b(?:thyroiditis|anterior neck pain|thyroid tenderness|painful swallowing|recent viral illness)\b/.test(lower)) {
    return "thyroiditis_context";
  }
  if (/\b(?:pregnancy|postpartum|breastfeeding|fertility goals|partner factors)\b/.test(lower)) {
    return "reproductive_safety_context";
  }
  if (category.diabetes && /\b(?:blurred vision|blurry vision|retinopathy|dilated eye|eye injections?|laser)\b/.test(lower)) {
    return "diabetes_eye_complication_context";
  }
  if (/\b(?:breast tissue|breast tenderness|nipple discharge|testicular|gynecomastia)\b/.test(lower)) {
    return "breast_gonadal_context";
  }
  if (/\b(?:low-trauma fracture|height loss|back pain|falls|gait instability|bone pain|kidney stones|malabsorption|calcium|vitamin d)\b/.test(lower)) {
    return "bone_mineral_context";
  }
  if (/\b(?:peripheral vision|visual field|double vision|pituitary|mass effect|galactorrhea|prolactin|sellar|parasellar)\b/.test(lower)) {
    return "pituitary_mass_or_prolactin_context";
  }
  if (/\b(?:hirsutism|hyperandrogenism|virilization|acne|scalp hair|clitoromegaly)\b/.test(lower)) {
    return "androgen_excess_context";
  }
  if (/\b(?:ring size|shoe size|facial features|acromegaly|sleep apnea|colon-polyp|growth velocity)\b/.test(lower)) {
    return "growth_hormone_complication_context";
  }
  return "";
}

function questionCompatibleWithDiagnosis(text = "", phrase = "", row = {}) {
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const category = endocrineCategoryFlags(row.category);
  const question = `${text || ""} ${phrase || ""}`.toLowerCase();
  const phraseText = String(phrase || "").toLowerCase();
  if (category.diabetes
    && !/diabetes insipidus/.test(diagnosis)
    && /\b(?:pituitary surgery|pituitary radiation|pituitary mri|visual-field review|sellar|parasellar)\b/.test(question)
    && !/\b(?:pituitary|sellar|parasellar|cranial radiation|traumatic brain injury)\b/.test(phraseText)) {
    return false;
  }
  if (/diabetes insipidus/.test(diagnosis)
    && !/\b(?:urine|urinating|polyuria|nocturia|thirst|water|hydration|dehydration|sodium|desmopressin|pituitary|headache|peripheral vision|visual field|double vision|cranial radiation|neurosurgery|traumatic brain injury|lithium|kidney|calcium|hypercalcemia)\b/.test(question)) {
    return false;
  }
  if (/\b(?:acromegaly|gigantism)\b/.test(diagnosis)
    && /\b(?:thyroid cancer|men2|salt craving|orthostasis|adrenal symptoms|access to water|desmopressin|antithyroid drug|amiodarone|iodine|contrast)\b/.test(question)) {
    return false;
  }
  if (/\b(?:adrenal insufficiency|addison)\b/.test(diagnosis)
    && /\b(?:graves orbitopathy|bulging eyes|proptosis|thyroid cancer|men2|antithyroid drug|amiodarone|iodine\/contrast)\b/.test(question)) {
    return false;
  }
  if (/gestational diabetes/.test(diagnosis)
    && /\b(?:pregnancy possible now|planned soon|recently postpartum|would pregnancy change medication|aldosterone-renin ratio|adrenal incidentaloma|hypokalemia)\b/.test(question)) {
    return false;
  }
  if (!/hyperaldosteronism|conn/.test(diagnosis)
    && /\b(?:aldosterone-renin ratio|aldosterone.*renin|\barr\b|adrenal incidentaloma)\b/.test(question)) {
    return false;
  }
  if (/gynecomastia/.test(diagnosis)
    && /\b(?:last menstrual|menstrual|menses|cycle pattern|cycle change|cycles|ovulation|pregnancy possible|pregnancy possibility|postpartum|premature ovarian|ovarian insufficiency|hot flashes|night sweats|vaginal|hirsutism|clitoromegaly|virilization)\b/.test(question)) {
    return false;
  }
  if (/\b(?:hypogonadism|erectile dysfunction)\b/.test(diagnosis)
    && /\b(?:last menstrual|menstrual|menses|cycle pattern|cycles|ovulation|pregnancy possible|pregnancy possibility|postpartum|premature ovarian|ovarian insufficiency)\b/.test(question)) {
    return false;
  }
  if (/\b(?:amenorrhea|polycystic|pcos|hirsutism|menopause|premature ovarian insufficiency)\b/.test(diagnosis)
    && /\b(?:morning erections|erectile function|ejaculation|testicular symptoms|testicular pain|semen analysis)\b/.test(question)) {
    return false;
  }
  if (/\b(?:polycystic|pcos|hirsutism)\b/.test(diagnosis)
    && /\b(?:hot flashes|vasomotor|night sweats|vaginal dryness|dyspareunia|genitourinary symptoms|premature ovarian insufficiency|early menopause)\b/.test(question)) {
    return false;
  }
  if (/\b(?:prediabetes|metabolic syndrome)\b/.test(diagnosis)
    && /\b(?:fever|infection symptoms|recent illness|procedure|hospitalization|wound|urinary symptoms|cough|sick contacts|vomiting|abdominal pain|ketone|kussmaul|pump failure)\b/.test(question)) {
    return false;
  }
  return true;
}

function examCompatibleWithDiagnosis(exam = {}, row = {}) {
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const text = `${exam.label || ""} ${exam.when_to_perform || ""} ${exam.management_change || ""} ${(exam.termsAny || []).join(" ")}`.toLowerCase();
  const femaleReproductiveDiagnosis = /\b(?:polycystic|pcos|amenorrhea|menopause|premature ovarian|hirsutism)\b/.test(diagnosis);
  const maleReproductiveDiagnosis = /\b(?:hypogonadism|low testosterone|erectile dysfunction|gynecomastia)\b/.test(diagnosis);
  if (femaleReproductiveDiagnosis && /\b(?:testicular|testes|male hypogonadism|erectile dysfunction|low testosterone|androgen deficiency)\b/.test(text)) {
    return false;
  }
  if (maleReproductiveDiagnosis && /\b(?:clitoromegaly|menstrual|menses|ovarian|pcos|premature ovarian|vasomotor|vaginal|pelvic ultrasound)\b/.test(text)) {
    return false;
  }
  if (/\bpolycystic|pcos\b/.test(diagnosis) && /\b(?:hot flashes|vasomotor|menopause|premature ovarian insufficiency)\b/.test(text)) {
    return false;
  }
  if (/\b(?:prediabetes|metabolic syndrome|gestational diabetes)\b/.test(diagnosis)
    && /\b(?:monofilament|pedal pulses|foot ulcer|foot wound|protective sensation|neuropathy)\b/.test(text)) {
    return false;
  }
  if (/\b(?:prediabetes|metabolic syndrome)\b/.test(diagnosis)
    && /\b(?:kussmaul|insulin pump|pump site|metabolic acidosis|abdomen|abdominal|mucous membranes for dehydration|mental status)\b/.test(text)) {
    return false;
  }
  if (/\bdiabetes insipidus\b/.test(diagnosis)
    && /\b(?:galactorrhea|secondary sex|pubertal stage|testicular|breast tissue|clitoromegaly|terminal hair|acral enlargement|tongue size|macroglossia)\b/.test(text)) {
    return false;
  }
  if (/\b(?:cushing's disease|cushings disease)\b/.test(diagnosis)
    && /\b(?:galactorrhea|secondary sex|pubertal stage|testicular|breast tissue|clitoromegaly|terminal hair|acral enlargement|tongue size|macroglossia)\b/.test(text)) {
    return false;
  }
  return true;
}

function splitQuestionSeed(seed = "") {
  const normalized = String(seed || "")
    .replace(/\s+including\s+/gi, ", ")
    .replace(/\s+plus\s+/gi, ", ")
    .replace(/\s+and\s+access\s+to\s+/gi, ", access to ")
    .replace(/\s+and\s+symptoms\s+of\s+/gi, ", symptoms of ")
    .trim();
  if (/^(?:What is the current trajectory|Which medications)\b/i.test(normalized)) {
    return [normalized.replace(/\.$/, "")];
  }
  if (/\?$/.test(normalized) && normalized.length <= 120) {
    return [normalized];
  }
  const withoutLead = normalized.replace(/^(Ask about|Clarify)\s+/i, "");
  return withoutLead
    .split(/,|;|\s+ and \s+|\s+ or \s+/i)
    .map((part) => part.trim())
    .map((part) => part.replace(/\.$/, ""))
    .filter((part) => part.length >= 4)
    .filter((part) => !/^(and|or|when|because)$/i.test(part));
}

function expandedQuestionPhrases(seed = "", row = {}) {
  const phrases = splitQuestionSeed(seed);
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const shouldLocalizeInfection = category.adrenal
    || (category.diabetes && !/\b(?:prediabetes|metabolic syndrome)\b/.test(diagnosis))
    || /\b(?:cushing|adrenal insufficiency|addison|congenital adrenal hyperplasia|type 1 diabetes|type 2 diabetes)\b/.test(diagnosis);
  const infectionBundlePattern = /\b(?:infections?|infectious|fever|acute illness|recent illness|sick-day triggers|sick day triggers)\b/i;
  const sourceOrExposurePattern = /\b(?:wound|urinary|cough|procedure|hospitalization|sick contact|skin|line|device|foot ulcer)\b/i;
  const expanded = [];
  for (const phrase of phrases) {
    if (shouldLocalizeInfection && infectionBundlePattern.test(phrase)) {
      expanded.push(
        "fever or rigors",
        "respiratory infection symptoms",
        "urinary or flank infection symptoms",
        category.diabetes ? "skin foot wound or line infection symptoms" : "skin wound line or procedure site infection symptoms",
        "healthcare exposure or sick contact"
      );
      continue;
    }
    if (shouldLocalizeInfection && sourceOrExposurePattern.test(phrase)) {
      if (/\b(?:cough|respiratory|pneumonia)\b/i.test(phrase)) expanded.push("respiratory infection symptoms");
      if (/\b(?:urinary|dysuria|flank|uti)\b/i.test(phrase)) expanded.push("urinary or flank infection symptoms");
      if (/\b(?:wound|skin|line|device|foot ulcer|procedure)\b/i.test(phrase)) expanded.push(category.diabetes ? "skin foot wound or line infection symptoms" : "skin wound line or procedure site infection symptoms");
      if (/\b(?:hospitalization|sick contact|procedure)\b/i.test(phrase)) expanded.push("healthcare exposure or sick contact");
      continue;
    }
    expanded.push(phrase);
  }
  return uniqueList(expanded);
}

function questionTagsForPhrase(phrase, row) {
  return uniqueList([
    slug(row.category),
    slug(row.diagnosis.replace(/\([^)]*\)/g, "")),
    ...String(phrase || "")
      .toLowerCase()
      .replace(/[()]/g, " ")
      .split(/[^a-z0-9+]+/)
      .filter((term) => term.length >= 4)
      .filter((term) => !genericClinicalTriggerTerm(term))
      .slice(0, 8)
  ]);
}

function questionAtom(phrase, row, sourceSeed = phrase) {
  const text = questionTextFromPhrase(phrase, row);
  if (!text) return null;
  if (!questionCompatibleWithDiagnosis(text, phrase, row)) return null;
  const tags = questionTagsForPhrase(phrase, row);
  return {
    label: text,
    text,
    source_seed: sourceSeed,
    options: questionOptionsForText(text, phrase, row),
    when_to_ask: `Ask when ${row.diagnosis} is the selected validated clinical intent or when this feature would change endocrine test interpretation, urgency, or treatment safety.`,
    diagnostic_purpose: clinicalRationale("question", text, row),
    management_implication: questionAction(text, row),
    tags
  };
}

function genericFallbackQuestionAtom(atom = {}) {
  const text = String(atom.text || "").toLowerCase();
  const sourceSeed = String(atom.source_seed || "").toLowerCase();
  return /^when did this start, how quickly is it changing, and what is different from baseline today\?$/i.test(atom.text || "")
    || /^what is the timing, severity, context, and baseline change for/i.test(atom.text || "")
    || (/\b(?:current trajectory|tempo|onset|duration)\b/.test(sourceSeed)
      && /\b(?:when did this start|what is different from baseline)\b/.test(text));
}

function requiredQuestionTemplates(row) {
  const atoms = [];
  for (const seed of row.questions || []) {
    for (const phrase of expandedQuestionPhrases(seed, row)) {
      const atom = questionAtom(phrase, row, seed);
      if (atom) atoms.push(atom);
    }
  }
  const specificAtoms = atoms.filter((atom) => !genericFallbackQuestionAtom(atom));
  const atomsToDedupe = specificAtoms.length >= minRequiredHistoryQuestions ? specificAtoms : atoms;
  const byText = new Map();
  const byBucket = new Map();
  for (const atom of atomsToDedupe) {
    const key = slug(atom.text);
    if (!key || byText.has(key)) continue;
    const bucket = questionSemanticBucket(atom.text, row);
    if (bucket && byBucket.has(bucket)) {
      const existing = byBucket.get(bucket);
      const existingKey = slug(existing.text);
      if (questionPriority(atom, row, atom.originalIndex || 0) > questionPriority(existing, row, existing.originalIndex || 0)) {
        byText.delete(existingKey);
        byText.set(key, atom);
        byBucket.set(bucket, atom);
      }
      continue;
    }
    byText.set(key, atom);
    if (bucket) byBucket.set(bucket, atom);
  }
  return Array.from(byText.values());
}

const maxRequiredHistoryQuestions = 10;
const minRequiredHistoryQuestions = 4;

const genericSharedQuestionSeedPattern = /\b(?:current trajectory|which medications|supplements|missed doses|recent procedures|acute illnesses|assay-interfering|comorbid complications|barriers|follow-up|psychosocial impact|technology use|shared decision|local protocols)\b/i;
const requiredSharedQuestionSeedPattern = /\b(?:which medications|supplements|missed doses|acute illnesses|pregnancy|fertility|assay-interfering|red flags?|emergency|crisis)\b/i;

function questionPriority(atom = {}, row = {}, index = 0) {
  const text = `${atom.text || ""} ${atom.source_seed || ""}`.toLowerCase();
  const sourceSeed = String(atom.source_seed || "");
  let score = Math.max(0, 120 - index);
  if (!genericSharedQuestionSeedPattern.test(sourceSeed)) score += 80;
  if (/^(?:Ask about|Clarify)\b/i.test(sourceSeed) && /[,;]|\band\b|\bor\b/i.test(sourceSeed)) score -= 70;
  if (requiredSharedQuestionSeedPattern.test(sourceSeed)) score += 35;
  if (/\b(?:diagnosis|diagnostic|criteria|severity|tempo|current|changed today|trajectory)\b/.test(text)) score += 25;
  if (/\b(?:medication|supplement|missed|steroid|amiodarone|lithium|biotin|iodine|contrast|pregnancy|fertility|procedure|acute illness|infection)\b/.test(text)) score += 22;
  if (/\b(?:red flag|crisis|shock|vomiting|dehydration|hypoglycemia|hyperglycemia|vision|headache|chest pain|dyspnea|arrhythmia)\b/.test(text)) score += 22;
  if (/\b(?:barrier|follow-up|psychosocial|shared decision|technology use|local protocol)\b/.test(text)) score -= 35;
  if (/\b(?:other|relevant to)\s+/.test(text)) score -= 8;
  return score;
}

function diagnosisExcludedTriggerTerms(row = {}) {
  const terms = new Set([
    slug(row.category),
    slug(row.diagnosis.replace(/\([^)]*\)/g, "")),
    "current",
    "trajectory",
    "baseline",
    "status",
    "prior",
    "diagnosis",
    "date",
    "today",
    "which",
    "what",
    "when",
    "where",
    "why",
    "how",
    "known",
    "change",
    "changes",
    "changed",
    "changing",
    "targets",
    "target",
    "therapy",
    "because",
    "these",
    "those",
    "this",
    "that",
    "from",
    "with",
    "associated",
    "reliable",
    "enough",
    "guide",
    "guides",
    "data",
    "work",
    "treatment",
    "relevant",
    "interpretation",
    "treatment",
    "safety",
    "endocrine",
    "workup",
    "context",
    "symptoms",
    "disease",
    "disorders",
    "disorder",
    "syndrome",
    "condition",
    "conditions",
    "type"
  ]);
  [
    row.category,
    row.diagnosis,
    row.diagnosis.replace(/\([^)]*\)/g, ""),
    ...triggerTerms(row)
  ].forEach((value) => {
    String(value || "")
      .toLowerCase()
      .replace(/[()]/g, " ")
      .split(/[^a-z0-9+]+/)
      .filter((term) => term.length >= 3)
      .forEach((term) => terms.add(slug(term)));
    terms.add(slug(value));
  });
  return terms;
}

function genericClinicalTriggerTerm(term = "") {
  return /^(?:unknown|other|current|prior|diagnosis|condition|conditions|syndrome|disease|disorder|disorders|severe|possible|relevant|interpretation|treatment|safety|endocrine|workup|context|symptom|symptoms|known|change|changes|changed|changing|target|targets|therapy|because|these|those|this|that|from|with|associated|reliable|enough|guide|guides|data|work|patient|history|modifier|modifiers|feature|features|baseline|status|today|which|what|when|where|why|how)$/i.test(String(term || "").trim());
}

function cleanClinicalTriggerTerms(terms = [], row = {}) {
  const excluded = diagnosisExcludedTriggerTerms(row);
  return uniqueList(terms)
    .map((term) => slug(term).replace(/_/g, " "))
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 3)
    .filter((term) => !genericClinicalTriggerTerm(term))
    .filter((term) => !excluded.has(slug(term)))
    .filter((term) => {
      const tokens = term.split(/\s+/).map((token) => slug(token)).filter(Boolean);
      return tokens.length > 0
        && !tokens.every((token) => excluded.has(token) || genericClinicalTriggerTerm(token));
    });
}

function questionTriggerTerms(atom = {}, row = {}) {
  return cleanClinicalTriggerTerms([
    ...(atom.tags || []),
    ...String(`${atom.label || ""} ${atom.text || ""}`)
      .toLowerCase()
      .replace(/[()]/g, " ")
      .split(/[^a-z0-9+]+/)
      .filter((term) => term.length >= 4)
  ], row)
    .slice(0, 10);
}

function modifierTriggerTerms(terms = [], row = {}) {
  return cleanClinicalTriggerTerms(terms, row)
    .slice(0, 10);
}

function conditionalExamTriggerTerms(exam = {}, row = {}) {
  const terms = modifierTriggerTerms(exam.termsAny || [], row);
  if (terms.length) return terms;
  const fallback = modifierTriggerTerms(
    String(`${exam.label || ""} ${exam.when_to_perform || ""}`)
      .toLowerCase()
      .split(/[,;/]| or | and /i)
      .map((term) => term.trim())
      .filter(Boolean),
    row
  );
  return fallback.length ? fallback : [`${slug(exam.label || "conditional exam").replace(/_/g, " ")} modifier`];
}

function tierQuestionTemplates(row) {
  const atoms = requiredQuestionTemplates(row)
    .map((atom, index) => ({
      ...atom,
      originalIndex: index,
      priority: questionPriority(atom, row, index)
    }));
  const selectedIndexes = new Set();
  const required = [];

  atoms
    .filter((atom) => atom.priority >= 100)
    .sort((a, b) => b.priority - a.priority || a.originalIndex - b.originalIndex)
    .forEach((atom) => {
      if (required.length >= maxRequiredHistoryQuestions) return;
      required.push(atom);
      selectedIndexes.add(atom.originalIndex);
    });

  atoms
    .sort((a, b) => b.priority - a.priority || a.originalIndex - b.originalIndex)
    .forEach((atom) => {
      if (required.length >= minRequiredHistoryQuestions) return;
      if (selectedIndexes.has(atom.originalIndex)) return;
      required.push(atom);
      selectedIndexes.add(atom.originalIndex);
    });

  required.sort((a, b) => a.originalIndex - b.originalIndex);
  const conditional = atoms
    .filter((atom) => !selectedIndexes.has(atom.originalIndex))
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((atom) => ({
      ...atom,
      when: { termsAny: questionTriggerTerms(atom, row) }
    }));

  return { required, conditional };
}

function conditionalQuestionAction(question = {}, row = {}) {
  const triggerSummary = clinicalTriggerDisplaySummary(question.when?.termsAny || [], question, row);
  const prefix = triggerSummary
    ? `Ask when the history or modifiers support ${triggerSummary}.`
    : `Ask when a related modifier changes the ${row.diagnosis} differential, treatment safety, or test interpretation.`;
  return `${prefix} ${question.management_implication}`;
}

function clinicalTriggerDisplaySummary(terms = [], question = {}, row = {}) {
  const text = `${question.label || ""} ${question.text || ""} ${(question.tags || []).join(" ")}`.toLowerCase();
  const termText = cleanClinicalTriggerTerms(terms, row).join(" ").toLowerCase();
  const combined = `${text} ${termText}`;
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const summaries = [];
  if (/\b(?:cgm|insulin pump|smart pen|glucometer|diabetes app|technology|device|pump)\b/.test(combined)) {
    summaries.push("diabetes technology or glucose-device use");
  }
  if (category.diabetes && /\b(?:meal|nutrition|carbohydrate|food|insecurity|work schedule|glucose target|nausea|vomiting)\b/.test(combined)) {
    summaries.push("nutrition access, vomiting, or glucose-management barriers");
  }
  if (/\b(?:retinopathy|vision|laser|dilated|eye)\b/.test(combined)) {
    summaries.push("retinopathy, vision, or eye-care concerns");
  }
  if (/\b(?:weight|appetite|fluid|systemic)\b/.test(combined)) {
    summaries.push("weight, appetite, fluid, or systemic-symptom change");
  }
  if ((category.adrenal || /\b(?:adrenal|addison|cah|hyperaldosteronism|pheochromocytoma|cushing)\b/.test(diagnosis))
    && /\b(?:vomiting|nausea|abdominal|poor intake|salt craving|orthostasis|dehydration)\b/.test(combined)) {
    summaries.push("adrenal-crisis or volume-depletion symptoms");
  }
  if (/\b(?:headache|sweat|palpitation|spell|resistant hypertension|hypokalemia)\b/.test(combined)) {
    summaries.push("adrenergic spells, resistant hypertension, or hypokalemia");
  }
  if (summaries.length) {
    return uniqueList(summaries).slice(0, 2).join("; ");
  }
  const cleanedTerms = cleanClinicalTriggerTerms(terms, row)
    .map((term) => readableClinicalPhrase(term))
    .filter(Boolean)
    .slice(0, 4);
  return cleanedTerms.length ? cleanedTerms.join(", ") : "";
}

function conditionalQuestionWhenToAsk(question = {}, row = {}) {
  const triggerSummary = clinicalTriggerDisplaySummary(question.when?.termsAny || [], question, row);
  return triggerSummary
    ? `Ask when patient context includes ${triggerSummary}.`
    : "Ask when patient context includes a relevant non-identifying modifier that changes endocrine interpretation, urgency, or treatment safety.";
}

function equipmentForBasicBedsideAtom(label) {
  const lower = String(label || "").toLowerCase();
  if (/\bblood pressure|\bbp\b|orthostatic|standing blood pressure/.test(lower)) return "blood pressure cuff";
  if (/\bheart rate\b|\bhr\b|pulse rate/.test(lower)) return "watch/timer or bedside monitor";
  if (/\brespiratory rate\b|\brr\b/.test(lower)) return "watch/timer or bedside monitor";
  if (/oxygen saturation|spo2|pulse oximetry/.test(lower)) return "pulse oximeter";
  if (/temperature|temp/.test(lower)) return "thermometer";
  if (/waist circumference/.test(lower)) return "tape measure";
  if (/body mass index|bmi/.test(lower)) return "scale and height measurement";
  if (/current weight|\bweight\b/.test(lower)) return "scale";
  if (/glucose|fingerstick/.test(lower)) return "glucometer";
  if (/general appearance|mental status|pain score/.test(lower)) return "none";
  return "";
}

function canonicalPhysicalExamLabel(label = "") {
  const text = String(label || "").trim();
  const lower = text.toLowerCase();
  const replacements = [
    [/^assess tremor with outstretched hands$/, "Observe outstretched-hands tremor"],
    [/^assess extraocular movements$/, "Test extraocular movements"],
    [/^assess voice quality$/, "Listen to voice quality"],
    [/^assess proximal hip flexor strength$/, "Test proximal hip flexor strength"],
    [/^assess gait stability if safe$/, "Observe gait stability if safe"],
    [/^assess lower leg edema$/, "Inspect and press lower leg edema"],
    [/^assess lower extremity edema$/, "Inspect and press lower extremity edema"],
    [/^assess pubertal stage$/, "Stage pubertal development"],
    [/^assess body hair distribution$/, "Inspect body hair distribution"],
    [/^assess secondary sex characteristics$/, "Inspect secondary sex characteristics"]
  ];
  const match = replacements.find(([pattern]) => pattern.test(lower));
  return match ? match[1] : text;
}

function examAtom(label, whenToPerform, managementChange, extra = {}) {
  const canonicalLabel = canonicalPhysicalExamLabel(label);
  return {
    label: canonicalLabel,
    when_to_perform: whenToPerform,
    management_change: managementChange,
    difficulty: extra.difficulty || "easy",
    time_burden_minutes: extra.time_burden_minutes || 1,
    equipment_needed: extra.equipment_needed || equipmentForBasicBedsideAtom(canonicalLabel) || "none",
    patient_cooperation_required: extra.patient_cooperation_required || "low",
    termsAny: extra.termsAny || []
  };
}

function sharedRequiredSafetyAtoms() {
  return [
    examAtom(
      "Measure blood pressure",
      "At every endocrine workup encounter",
      "Hypotension or severe hypertension changes acuity, medication safety, fluid strategy, and escalation."
    ),
    examAtom(
      "Measure heart rate",
      "At every endocrine workup encounter",
      "Tachycardia, bradycardia, or irregular rhythm changes acuity, ECG need, and treatment urgency."
    )
  ];
}

function requiredSafetyTemplates(row) {
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const safetyAtoms = [...sharedRequiredSafetyAtoms()];

  if (category.diabetes) {
    safetyAtoms.push(
      examAtom(
        "Measure current weight",
        "During diabetes or metabolic risk assessment",
        "Weight change influences insulin resistance framing, nutrition plan, and medication selection."
      )
    );
    if (/metabolic syndrome|prediabetes|gestational diabetes/.test(diagnosis)) {
      safetyAtoms.push(
        examAtom(
          "Measure waist circumference",
          "When cardiometabolic risk or metabolic syndrome is being assessed",
          "Central adiposity changes metabolic syndrome criteria and cardiometabolic risk framing."
        )
      );
    }
  }

  if (category.adrenal) {
    safetyAtoms.push(
      examAtom(
        "Measure orthostatic blood pressure",
        "When adrenal insufficiency, mineralocorticoid disorder, volume depletion, or catecholamine spells are possible",
        "Orthostasis changes crisis concern, fluid strategy, and hormone replacement urgency."
      )
    );
    if (/pheochromocytoma/.test(diagnosis)) {
      safetyAtoms.push(
        examAtom(
          "Measure standing blood pressure",
          "When pheochromocytoma or catecholamine spells are possible",
          "Paroxysmal or orthostatic BP findings change safety planning and biochemical testing urgency."
        )
      );
    }
  }

  if (category.reproductiveGonadal) {
    safetyAtoms.push(
      examAtom(
        "Measure body mass index",
        "During reproductive or gonadal endocrine evaluation",
        "BMI changes PCOS, hypogonadism, infertility, menopause, and cardiometabolic risk framing."
      )
    );
  }

  if (category.pituitary && /diabetes insipidus/.test(diagnosis)) {
    safetyAtoms.push(
      examAtom(
        "Measure orthostatic blood pressure",
        "When water-balance disorder or volume depletion is possible",
        "Orthostasis changes hypernatremia risk and need for monitored fluids."
      )
    );
    safetyAtoms.push(
      examAtom(
        "Document mental status",
        "When diabetes insipidus, hypernatremia, or acute water-balance change is possible",
        "Confusion or somnolence changes hypernatremia severity, disposition, and monitored correction strategy."
      )
    );
  }

  return atomicExamUnique(safetyAtoms);
}

function conditionalSafetyTemplates(row) {
  const category = endocrineCategoryFlags(row.category);
  const safetyAtoms = [
    examAtom(
      "Document mental status",
      "When acute illness, severe electrolyte disturbance, crisis physiology, or confusion is present",
      "Altered mental status changes urgency, disposition, and need for monitored evaluation.",
      { termsAny: ["unstable", "confusion", "altered mental status", "severe", "crisis", "hypernatremia", "hyponatremia", "hypoglycemia", "hypercalcemia"] }
    )
  ];
  if (category.thyroid) {
    safetyAtoms.push(
      examAtom(
        "Measure temperature",
        "When thyroid storm, infection, or myxedema physiology is possible",
        "Fever or hypothermia changes emergency endocrine triage.",
        { termsAny: ["thyroid storm", "fever", "hypothermia", "myxedema", "severe"] }
      )
    );
  }
  return atomicExamUnique(safetyAtoms);
}

function atomicExamUnique(items = []) {
  const byLabel = new Map();
  for (const item of items) {
    const key = String(item.label || "").toLowerCase();
    if (!key) {
      continue;
    }
    if (byLabel.has(key)) {
      const existing = byLabel.get(key);
      existing.termsAny = Array.from(new Set([...(existing.termsAny || []), ...(item.termsAny || [])]));
      continue;
    }
    byLabel.set(key, { ...item, termsAny: [...(item.termsAny || [])] });
  }
  return Array.from(byLabel.values());
}

const basicSafetyAtomPattern = /\b(?:Measure blood pressure|Measure heart rate|Measure respiratory rate|Measure oxygen saturation|Measure temperature|Measure current weight|Measure body mass index|Measure waist circumference|Calculate body mass index|Measure orthostatic blood pressure|Measure standing blood pressure|Check bedside glucose|Measure bedside glucose|Bedside glucose|Document mental status|Observe general appearance)\b/i;

function isSafetyCheckAtom(exam = {}) {
  return basicSafetyAtomPattern.test(String(exam.label || ""));
}

function examTags(label, row) {
  return uniqueList([
    slug(row.category),
    slug(row.diagnosis.replace(/\([^)]*\)/g, "")),
    ...String(label || "")
      .toLowerCase()
      .replace(/[()]/g, " ")
      .split(/[^a-z0-9+]+/)
      .filter((term) => term.length >= 4)
      .slice(0, 8)
  ]);
}

function diagnosticTargetForExam(label, row) {
  const lower = String(label || "").toLowerCase();
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  if (/blood pressure/.test(lower)) return "hemodynamic safety, hypertension or hypotension severity, and medication or fluid-safety context";
  if (/heart rate/.test(lower)) return "tachycardia, bradycardia, irregular rhythm, or acute physiologic stress";
  if (/respiratory rate/.test(lower)) return "tachypnea, hypoventilation, respiratory compensation, or acute illness severity";
  if (/temperature/.test(lower)) return "fever, hypothermia, inflammatory illness, infection, or endocrine-crisis physiology";
  if (/current weight|body mass index|waist circumference/.test(lower)) return "anthropometric risk, treatment dosing context, and cardiometabolic phenotype";
  if (/acanthosis/.test(lower)) return "insulin resistance or cardiometabolic risk phenotype";
  if (/pubertal (?:stage|development)|stage pubertal|secondary sex/.test(lower)) return "pubertal development, delayed/precocious puberty pattern, or hypogonadal phenotype";
  if (/insulin pump|device site|infusion/.test(lower)) return "insulin delivery failure, infusion-site infection, or device-related precipitant";
  if (/diaphoresis|sweating/.test(lower)) return "catecholamine excess, adrenergic spell severity, or autonomic instability";
  if (/tremor/.test(lower) && /pheochromocytoma/.test(diagnosis)) return "catecholamine excess, adrenergic spell severity, or autonomic instability";
  if (/tremor/.test(lower)) return "thyrotoxicosis adrenergic signs, medication effect, or endocrine-related neuromuscular irritability";
  if (/\bacral\b|inspect hands|hand enlargement/.test(lower)) return "growth hormone excess phenotype with acral soft-tissue or skeletal enlargement";
  if (/tongue|macroglossia/.test(lower)) return "macroglossia or soft-tissue enlargement affecting acromegaly phenotype, sleep apnea risk, or airway planning";
  if (/visual field|cranial/.test(lower)) return "pituitary/sellar mass effect or cranial nerve involvement";
  if (/extraocular/.test(lower)) {
    if (category.thyroid || /graves|hyperthyroidism|thyrotoxicosis/.test(diagnosis)) {
      return "Graves orbitopathy, diplopia, ocular motility restriction, or vision-threatening thyroid eye disease";
    }
    return "pituitary/sellar mass effect, cavernous sinus involvement, or cranial nerve III/IV/VI dysfunction";
  }
  if (/jvp|jugular/.test(lower)) return "venous congestion, right-sided pressure, or cardiopulmonary strain";
  if (/edema/.test(lower)) return "volume overload, venous disease, or medication/renal-cardiac complication";
  if (/lung|breathing|kussmaul/.test(lower)) return "respiratory compensation, pulmonary congestion, infection, obstruction, or distress";
  if (/heart rhythm|arrhythm|gallop|murmur/.test(lower)) {
    if (/hyperaldosteronism/.test(diagnosis)) return "hypokalemia-related arrhythmia, severe hypertension complication, or ECG-relevant cardiac rhythm abnormality";
    if (/pheochromocytoma/.test(diagnosis)) return "catecholamine-related tachyarrhythmia or severe hypertension complication";
    if (category.thyroid) return "thyroid-related tachycardia, atrial fibrillation, bradycardia, or heart-failure complication";
    return "cardiac rhythm, structural heart disease, or heart-failure complication";
  }
  if (/pedal/.test(lower)) return "diabetic foot perfusion, peripheral arterial disease, or vascular risk";
  if (/mucous|dehydration|skin turgor|capillary|perfusion|pulse|temperature/.test(lower)) return "volume status, dehydration severity, or peripheral perfusion";
  if (/mental status|airway/.test(lower)) return "encephalopathy, crisis severity, or airway-protection risk";
  if (/pallor|dry skin|body hair/.test(lower) && /hypopituitarism/.test(diagnosis)) return "hypopituitary phenotype, central adrenal/thyroid/gonadal deficiency clues, or chronic hormone-deficiency severity";
  if (/hyperpigmentation/.test(lower)) return "primary adrenal insufficiency, ACTH excess pattern, or congenital adrenal hyperplasia clue";
  if (/bruising|striae|supraclavicular/.test(lower)) return "hypercortisolism, Cushing phenotype, or glucocorticoid excess pattern";
  if (/chair-rise/.test(lower)) {
    if (/cushing/.test(diagnosis)) return "hypercortisolism-related proximal myopathy and functional severity";
    if (/hyperaldosteronism/.test(diagnosis)) return "hypokalemic weakness or functional impairment from mineralocorticoid excess";
    if (/adrenal insufficiency|addison|congenital adrenal hyperplasia|cah/.test(diagnosis)) return "clinically important weakness, adrenal-crisis severity, or functional impairment";
    return "proximal myopathy, endocrine-related weakness, or functional impairment";
  }
  if (/chvostek|trousseau|proximal|gait|bone|spine|kyphosis/.test(lower)) return "hypocalcemia, osteomalacia/osteoporosis complication, fracture risk, or fall risk";
  if (/feet|foot|monofilament|pedal/.test(lower)) return "diabetic neuropathy, foot ulcer risk, infection, or peripheral arterial disease";
  if (/xanthoma|xanthelasma/.test(lower)) return "dyslipidemia phenotype, familial lipid disorder clue, or severe hypertriglyceridemia complication risk";
  if (/abdomen|abdominal|guarding|tenderness/.test(lower)) return "abdominal complication, endocrine crisis mimic, or precipitating illness";
  if (/thyroid|goiter|neck|voice|airway narrowing/.test(lower)) return "thyroid structural disease, compressive features, or thyroid inflammatory/autoimmune pattern";
  if (/cervical lymph/.test(lower)) return "regional nodal disease or thyroid malignancy risk";
  if (/eyelid|proptosis|extraocular|orbit/.test(lower)) return "thyrotoxicosis adrenergic signs or Graves orbitopathy severity";
  if (/galactorrhea|secondary sex|testicular|body hair|breast|clitoromegaly|terminal hair|acne/.test(lower)) return "gonadal axis, prolactin, androgen excess/deficiency, or reproductive endocrine phenotype";
  return `focused bedside finding relevant to ${row.diagnosis}`;
}

function techniqueForExam(label) {
  const lower = String(label || "").toLowerCase();
  if (/mental status/.test(lower)) return "Assess alertness, orientation, attention, ability to follow commands, and deviation from documented baseline without delaying urgent treatment.";
  if (/capillary refill/.test(lower)) return "Apply brief pressure to a fingertip or toe and record return of color while considering temperature, perfusion, and vascular disease.";
  if (/skin turgor/.test(lower)) return "Gently pinch skin over a clinically appropriate site and observe recoil, interpreting cautiously in older adults or chronic skin changes.";
  if (/pallor|dry skin/.test(lower)) return "Inspect exposed skin, palms, and mucosa for pallor, dryness, texture change, bruising, and baseline differences relevant to hormone deficiency.";
  if (/lower leg edema|peripheral edema|dependent edema/.test(lower)) return "Inspect and press over both lower legs or dependent areas for pitting, symmetry, tenderness, and proximal extent.";
  if (/confrontation visual fields/.test(lower)) return "Test each eye separately by confrontation, comparing peripheral fields with the examiner's field while the patient fixes on a central target.";
  if (/extraocular movements/.test(lower)) return "Ask the patient to follow a target through cardinal gaze positions and observe for limitation, pain, diplopia, or nystagmus.";
  if (/galactorrhea/.test(lower)) return "Inspect for spontaneous discharge and, only when clinically appropriate, gently express from the areola toward the nipple while preserving privacy and consent.";
  if (/thyroid gland/.test(lower)) return "Inspect and palpate the thyroid from in front or behind while the patient swallows, noting size, tenderness, asymmetry, nodules, fixation, or bruit if auscultated.";
  if (/cervical lymph/.test(lower)) return "Palpate cervical and supraclavicular nodal chains systematically, noting size, tenderness, mobility, firmness, and laterality.";
  if (/heart rhythm|murmur|gallop/.test(lower)) return "Auscultate the precordium with diaphragm and bell as appropriate, noting rate regularity, extra sounds, murmurs, rubs, or gallop.";
  if (/lung sounds/.test(lower)) return "Auscultate symmetric anterior, lateral, and posterior lung fields as feasible, comparing sides for crackles, wheeze, diminished sounds, or asymmetry.";
  if (/work of breathing|kussmaul/.test(lower)) return "Observe respiratory rate, depth, accessory muscle use, speech tolerance, and breathing pattern at rest.";
  if (/mucous membranes/.test(lower)) return "Inspect oral mucosa and tongue moisture with attention to dry mucosa, cracked lips, and overall hydration context.";
  if (/skin turgor/.test(lower)) return "Gently pinch skin over a clinically appropriate site and observe recoil, interpreting cautiously in older adults or chronic skin changes.";
  if (/capillary refill/.test(lower)) return "Apply brief pressure to a fingertip or toe and record return of color while considering temperature, perfusion, and vascular disease.";
  if (/peripheral|pedal|radial|pulse/.test(lower)) return "Palpate bilateral pulses at the named sites, comparing amplitude, symmetry, rhythm, and perfusion.";
  if (/bruising|striae|supraclavicular/.test(lower)) return "Inspect exposed skin and body habitus for easy bruising, wide purple striae, supraclavicular fullness, and related Cushingoid features.";
  if (/spine posture|kyphosis/.test(lower)) return "Inspect standing posture and spinal curvature, noting kyphosis, height-loss concern, or vertebral compression pattern.";
  if (/abdomen|abdominal/.test(lower)) return "Inspect and palpate the abdomen gently, localizing tenderness and stopping if guarding, rebound, or severe pain occurs.";
  if (/tremor/.test(lower)) return "Ask the patient to extend both arms and spread fingers; observe for fine tremor and functional impact.";
  if (/proptosis|eyelid/.test(lower)) return "Inspect eyes and eyelids from the front and side for lid lag/retraction, proptosis, conjunctival injection, or exposure signs.";
  if (/voice/.test(lower)) return "Listen to voice quality during normal speech and ask about new hoarseness, weak voice, or compressive symptoms.";
  if (/airway narrowing/.test(lower)) return "Inspect neck contour and observe breathing/stridor; ask about positional dyspnea while avoiding provocative maneuvers in unstable patients.";
  if (/oral mucosa.*hyperpigmentation|hyperpigmentation/.test(lower)) return "Inspect oral mucosa, palmar creases, scars, and sun-protected skin for diffuse or patchy hyperpigmentation.";
  if (/chair-rise/.test(lower)) return "Ask the patient to rise from a chair without using arms if safe, observing proximal strength and need for assistance.";
  if (/proximal hip/.test(lower)) return "Test hip flexion strength against resistance bilaterally while the patient is seated or supine, adapting to pain and safety.";
  if (/bone tenderness|spine/.test(lower)) return "Palpate the symptomatic bone or spine area gently for focal tenderness and correlate with trauma, fracture risk, and neurologic symptoms.";
  if (/gait/.test(lower)) return "Observe standing and gait only if safe, noting balance, antalgia, assistive-device need, and fall risk.";
  if (/chvostek/.test(lower)) return "Tap over the facial nerve anterior to the ear and observe for ipsilateral facial twitching, interpreting cautiously because false positives occur.";
  if (/trousseau/.test(lower)) return "Inflate a blood-pressure cuff above systolic pressure for up to three minutes if safe and observe for carpopedal spasm.";
  if (/feet|foot/.test(lower)) return "Inspect both feet including interdigital spaces and pressure points for ulcer, callus, erythema, drainage, deformity, or infection.";
  if (/xanthoma|xanthelasma/.test(lower)) return "Inspect eyelids, extensor surfaces, Achilles tendons, elbows, knees, and pressure areas for xanthelasma, tendon xanthomas, or eruptive xanthomas.";
  if (/monofilament/.test(lower)) return "Apply a 10-g monofilament perpendicular to standard plantar sites until it bends, with eyes closed, documenting sites felt or missed.";
  if (/insulin pump/.test(lower)) return "Inspect the infusion or device site for dislodgement, leakage, erythema, tenderness, occlusion, or supply failure.";
  if (/testicular volume/.test(lower)) return "Estimate testicular volume with orchidometer when available or careful exam, documenting asymmetry, tenderness, or mass separately.";
  if (/breast tissue/.test(lower)) return "Inspect and palpate breast tissue to distinguish glandular tissue from adiposity and to identify discrete mass, tenderness, or discharge.";
  if (/terminal hair|body hair|acne|clitoromegaly/.test(lower)) return "Inspect the relevant androgen-sensitive areas respectfully and document distribution, severity, and signs of virilization.";
  if (/pubertal (?:stage|development)|stage pubertal|secondary sex/.test(lower)) return "Assess Tanner stage or secondary sex characteristics only when clinically appropriate and with consent/chaperone practices.";
  if (/hands|acral/.test(lower)) return "Inspect and compare hands, fingers, ring/shoe-size clues, acral contours, and facial soft-tissue changes with prior photos or baseline when available.";
  if (/tongue|macroglossia/.test(lower)) return "Inspect tongue size at rest and with protrusion, noting macroglossia, dental impressions, speech effects, and airway or sleep-apnea relevance.";
  if (/inspect/.test(lower)) return "Inspect the named area directly, comparing sides when relevant and documenting presence, absence, severity, and inability to assess.";
  if (/palpate/.test(lower)) return "Palpate the named area gently and systematically, documenting tenderness, size, symmetry, mobility, and patient tolerance.";
  if (/auscultate/.test(lower)) return "Auscultate the named area with appropriate stethoscope positioning and compare expected sites when relevant.";
  return "Perform the named maneuver directly at bedside, documenting positive, negative, and unable-to-assess findings.";
}

function findingsOptionsForExam(label) {
  const lower = String(label || "").toLowerCase();
  if (/heart rhythm/.test(lower)) return ["Regular", "Irregular", "Tachycardic", "Bradycardic", "Unable to assess"];
  if (/murmur/.test(lower)) return ["No murmur", "Systolic murmur", "Diastolic murmur", "New/changed murmur", "Unable to assess"];
  if (/gallop/.test(lower)) return ["No gallop", "S3", "S4", "Unable to assess"];
  if (/lung/.test(lower)) return ["Clear", "Crackles", "Wheeze", "Diminished/asymmetric", "Unable to assess"];
  if (/jvp|jugular/.test(lower)) return ["Not elevated", "Elevated", "Unable to assess"];
  if (/edema/.test(lower)) return ["None", "Trace", "1+", "2+", "3+", "4+", "Ankle or pedal", "Pretibial", "Sacral", "Unilateral", "Bilateral", "Unable to assess", "Other ___"];
  if (/mental status/.test(lower)) return ["Alert/oriented baseline", "Confused", "Somnolent", "Agitated", "Unable to assess"];
  if (/mucous|dehydration/.test(lower)) return ["Moist", "Dry", "Very dry", "Unable to assess"];
  if (/capillary refill/.test(lower)) return ["Brisk", "Delayed", "Mottled/cool", "Unable to assess"];
  if (/skin turgor/.test(lower)) return ["Normal recoil", "Reduced recoil", "Unable to assess"];
  if (/pulse/.test(lower)) return ["Symmetric/normal", "Diminished", "Absent", "Asymmetric", "Unable to assess"];
  if (/pallor|dry skin/.test(lower)) return ["No concerning change", "Pallor", "Dry/coarse skin", "Unable to assess"];
  if (/bruising|striae|supraclavicular/.test(lower)) return ["Absent", "Present", "Marked", "Unable to assess"];
  if (/abdomen|abdominal/.test(lower)) return ["Nontender", "Tender", "Guarding", "Rebound/peritoneal concern", "Unable to assess"];
  if (/visual field/.test(lower)) return ["Full", "Bitemporal deficit", "Other field deficit", "Unable to assess"];
  if (/extraocular/.test(lower)) return ["Full", "Restricted", "Diplopia", "Painful", "Unable to assess"];
  if (/thyroid/.test(lower)) return ["Normal size", "Goiter", "Nodule/asymmetry", "Tender", "Fixed/hard", "Unable to assess"];
  if (/cervical lymph/.test(lower)) return ["No concerning nodes", "Tender/mobile nodes", "Firm/fixed nodes", "Supraclavicular node", "Unable to assess"];
  if (/voice quality/.test(lower)) return ["Normal voice", "Hoarse", "Weak/breathy", "Stridor/airway concern", "Unable to assess"];
  if (/airway narrowing/.test(lower)) return ["No visible narrowing", "Large goiter/mass effect", "Stridor/positional dyspnea", "Unable to assess"];
  if (/eyelid retraction/.test(lower)) return ["Absent", "Present", "Asymmetric", "Exposure concern", "Unable to assess"];
  if (/proptosis/.test(lower)) return ["Absent", "Mild", "Marked", "Vision/exposure concern", "Unable to assess"];
  if (/chvostek|trousseau/.test(lower)) return ["Negative", "Positive", "Unable/unsafe to assess"];
  if (/monofilament/.test(lower)) return ["Protective sensation intact", "Reduced", "Absent", "Unable to assess"];
  if (/feet|foot/.test(lower)) return ["No ulcer", "Ulcer/wound", "Callus/deformity", "Infection concern", "Unable to assess"];
  if (/xanthoma|xanthelasma/.test(lower)) return ["Absent", "Xanthelasma", "Tendon xanthomas", "Eruptive xanthomas", "Unable to assess"];
  if (/galactorrhea/.test(lower)) return ["Absent", "Spontaneous discharge", "Expressible discharge", "Bloody/unilateral discharge", "Unable/deferred"];
  if (/breast tissue/.test(lower)) return ["No glandular tissue", "Tender glandular tissue", "Discrete mass", "Nipple discharge/skin change", "Unable/deferred"];
  if (/tremor/.test(lower)) return ["No tremor", "Fine tremor", "Coarse tremor", "Functionally limiting tremor", "Unable to assess"];
  if (/acanthosis/.test(lower)) return ["Absent", "Mild neck folds", "Marked neck/axillary involvement", "Unable to assess"];
  if (/chair-rise|proximal hip/.test(lower)) return ["Normal strength", "Mild weakness", "Needs arms/assistance", "Unable/unsafe to assess"];
  if (/terminal hair/.test(lower)) return ["Expected distribution", "Mild excess", "Marked excess", "Virilization concern", "Unable/deferred"];
  if (/acne/.test(lower)) return ["Absent/minimal", "Inflammatory acne", "Severe/nodulocystic", "Unable/deferred"];
  if (/clitoromegaly/.test(lower)) return ["Absent", "Present/possible", "Rapid virilization concern", "Unable/deferred"];
  if (/bone tenderness|spine.*focal tenderness|focal tenderness/.test(lower)) return ["No focal tenderness", "Focal tenderness", "Diffuse tenderness", "Unable/unsafe to assess"];
  if (/gait stability/.test(lower)) return ["Stable", "Unsteady", "Needs assistive device/help", "Unable/unsafe to assess"];
  if (/spine posture|kyphosis/.test(lower)) return ["No kyphosis/height-loss concern", "Kyphosis", "Height-loss concern", "Unable to assess"];
  if (/pubertal (?:stage|development)|stage pubertal|secondary sex/.test(lower)) return ["Age-appropriate", "Delayed/underdeveloped", "Advanced/virilized", "Unable/deferred"];
  if (/testicular volume/.test(lower)) return ["Expected volume", "Small bilaterally", "Asymmetric/mass concern", "Unable/deferred"];
  if (/body hair distribution/.test(lower)) return ["Expected distribution", "Reduced androgen-dependent hair", "Excess/virilizing pattern", "Unable/deferred"];
  if (/oral mucosa.*hyperpigmentation|hyperpigmentation/.test(lower)) return ["Absent", "Oral/palmar hyperpigmentation", "Diffuse or scar hyperpigmentation", "Unable to assess"];
  if (/kussmaul/.test(lower)) return ["Absent", "Deep/labored pattern", "Respiratory distress", "Unable to assess"];
  if (/insulin pump/.test(lower)) return ["Site intact", "Dislodged/occluded/leaking", "Erythema/tenderness/drainage", "Unable to assess"];
  if (/hands.*acral|acral enlargement/.test(lower)) return ["No acral enlargement", "Acral enlargement", "Soft-tissue swelling/ring-shoe size clue", "Unable to assess"];
  if (/tongue size|macroglossia/.test(lower)) return ["Normal size", "Macroglossia/dental impressions", "Airway/sleep-apnea concern", "Unable to assess"];
  if (/diaphoresis/.test(lower)) return ["Absent", "Present", "Profuse/during spell", "Unable to assess"];
  return ["Normal/absent", "Abnormal/present", "Unable to assess"];
}

function limitationsForExam(label, row) {
  const lower = String(label || "").toLowerCase();
  const diagnosis = row.diagnosis;
  const general = `${label} is supportive for ${diagnosis}, not diagnostic by itself; reliability can be reduced by pain, positioning, acute illness, cooperation, body habitus, baseline disability, and examiner technique.`;
  if (/jvp|thyroid|murmur|gallop|lung|visual field|extraocular|monofilament|chvostek|trousseau/.test(lower)) {
    return `${general} Pair this technique-dependent finding with the relevant labs, imaging, serial trend, or specialty exam before changing definitive therapy.`;
  }
  return general;
}

function equipmentForExam(label, current = "none") {
  const lower = String(label || "").toLowerCase();
  const basicEquipment = equipmentForBasicBedsideAtom(label);
  if (basicEquipment) return basicEquipment;
  if (/auscultate|murmur|gallop|lung/.test(lower)) return "stethoscope";
  if (/monofilament/.test(lower)) return "10-g monofilament";
  if (/trousseau/.test(lower)) return "blood pressure cuff";
  if (/testicular volume/.test(lower)) return "orchidometer optional";
  if (/visual field|extraocular/.test(lower)) return "none";
  return current || "none";
}

function examMetadata(exam, row) {
  return {
    technique: exam.technique || techniqueForExam(exam.label),
    findings_options: exam.findings_options || findingsOptionsForExam(exam.label),
    diagnostic_target: exam.diagnostic_target || diagnosticTargetForExam(exam.label, row),
    LR_plus: exam.LR_plus || "n/a",
    LR_minus: exam.LR_minus || "n/a",
    limitations: exam.limitations || limitationsForExam(exam.label, row),
    tags: exam.tags?.length ? exam.tags : examTags(exam.label, row),
    equipment_needed: equipmentForExam(exam.label, exam.equipment_needed)
  };
}

function endocrineCategoryFlags(category) {
  const normalized = String(category || "").toLowerCase();
  return {
    diabetes: normalized === "diabetes and blood sugar disorders",
    thyroid: normalized === "thyroid disorders",
    boneParathyroid: normalized === "bone and parathyroid disorders",
    adrenal: normalized === "adrenal gland disorders",
    reproductiveGonadal: normalized === "reproductive and gonadal disorders",
    pituitary: normalized === "pituitary gland disorders"
  };
}

function requiredExamTemplates(row) {
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const shared = [];
  if (category.diabetes) {
    const diabetesAtoms = [];
    if (!/prediabetes|metabolic syndrome|gestational diabetes/.test(diagnosis)) {
      diabetesAtoms.push(
        examAtom("Inspect feet for ulcers", "When established diabetes, neuropathy, infection, vascular disease, or foot symptoms are relevant", "An ulcer or wound changes infection workup, offloading, antibiotic planning, and disposition."),
        examAtom("Palpate pedal pulses", "When established diabetes, vascular symptoms, foot symptoms, or chronic complications are relevant", "Diminished pulses change vascular risk assessment and foot-wound management."),
        examAtom("Test monofilament sensation", "When neuropathy risk, established diabetes duration, foot symptoms, or fall risk is relevant", "Loss of protective sensation changes foot-care counseling, footwear planning, and ulcer prevention.")
      );
    }
    if (/metabolic syndrome|prediabetes|gestational diabetes/.test(diagnosis)) {
      diabetesAtoms.push(examAtom("Inspect neck for acanthosis", "When insulin resistance or metabolic syndrome is suspected", "Acanthosis supports insulin resistance and prompts metabolic risk counseling."));
    }
    return atomicExamUnique([...shared, ...diabetesAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.thyroid) {
    const thyroidAtoms = [
      examAtom("Palpate thyroid gland", "During thyroid hormone or thyroid structural evaluation", "Goiter, tenderness, asymmetry, or a dominant nodule changes etiology and imaging decisions."),
      examAtom("Palpate cervical lymph nodes", "When thyroid nodule, thyroid cancer, goiter, neck symptoms, or autoimmune thyroid disease is relevant", "Suspicious lymph nodes change ultrasound mapping, biopsy planning, and urgency."),
      examAtom("Auscultate heart rhythm", "When thyroid dysfunction could affect cardiac rhythm", "Irregular rhythm changes ECG need, beta-blocker consideration, and escalation."),
      examAtom("Assess tremor with outstretched hands", "When hyperthyroidism or thyrotoxicosis is possible", "Fine tremor supports adrenergic thyrotoxicosis and changes symptom-control decisions.")
    ];
    if (/graves|hyperthyroidism|thyrotoxicosis/.test(diagnosis)) {
      thyroidAtoms.push(examAtom("Inspect eyes for proptosis", "When Graves disease or orbitopathy is possible", "Proptosis changes orbitopathy severity assessment and ophthalmology urgency."));
      thyroidAtoms.push(examAtom("Assess extraocular movements", "When diplopia, eye pain, proptosis, or Graves orbitopathy is possible", "Restricted movement changes orbitopathy severity and urgent eye-care needs."));
    }
    if (/nodule|cancer|hashimoto/.test(diagnosis)) {
      thyroidAtoms.push(examAtom("Assess voice quality", "When thyroid nodule, thyroid cancer, goiter, or compressive symptoms are present", "Hoarseness changes concern for recurrent laryngeal nerve involvement and surgical urgency."));
      thyroidAtoms.push(examAtom("Inspect neck for airway narrowing", "When goiter, neck mass, dyspnea, or compressive symptoms are present", "Airway concern changes urgency and imaging or procedural planning."));
    }
    return atomicExamUnique([...shared, ...thyroidAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.boneParathyroid) {
    const boneAtoms = [
      examAtom("Assess proximal hip flexor strength", "When osteomalacia, hypercalcemia, hypocalcemia, falls, or weakness is possible", "Weakness changes fall risk, severity assessment, and urgency of calcium or vitamin D evaluation."),
      examAtom("Palpate focal bone tenderness", "When bone pain, osteomalacia, fracture, or hyperparathyroidism is possible", "Focal tenderness changes fracture concern, imaging need, and treatment urgency."),
      examAtom("Assess gait stability if safe", "When falls, fracture risk, weakness, or bone disease is relevant", "Unsafe gait changes fall precautions, disposition, and rehabilitation planning."),
      examAtom("Inspect spine posture for kyphosis", "When osteoporosis or vertebral compression fracture risk is relevant", "Kyphosis or height-loss concern changes vertebral fracture evaluation and imaging threshold.")
    ];
    if (/hypoparathyroidism|vitamin d|osteomalacia/.test(diagnosis)) {
      boneAtoms.push(examAtom("Elicit Chvostek sign", "When symptomatic hypocalcemia is possible", "Positive neuromuscular irritability changes urgency of calcium testing and treatment."));
      boneAtoms.push(examAtom("Elicit Trousseau sign", "When symptomatic hypocalcemia is possible and safe to perform", "Positive carpopedal spasm changes urgency of calcium replacement and monitoring."));
    }
    if (/primary hyperparathyroidism/.test(diagnosis)) {
      boneAtoms.push(examAtom("Inspect mucous membranes for dehydration", "When hypercalcemia symptoms or poor intake are present", "Dehydration changes fluid strategy and urgency of hypercalcemia management."));
    }
    return atomicExamUnique([...shared, ...boneAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.adrenal) {
    const adrenalAtoms = [];
    if (/adrenal insufficiency|addison|congenital adrenal hyperplasia|cah/.test(diagnosis)) {
      adrenalAtoms.push(examAtom("Inspect oral mucosa for hyperpigmentation", "When primary adrenal insufficiency, Addison disease, ACTH excess, or congenital adrenal hyperplasia is possible", "Hyperpigmentation supports primary adrenal insufficiency or ACTH excess and changes ACTH, antibody, renin/aldosterone, or steroid-replacement interpretation."));
      adrenalAtoms.push(examAtom("Inspect mucous membranes for dehydration", "When adrenal insufficiency, salt-wasting, vomiting, or poor intake is possible", "Dry mucous membranes change adrenal-crisis severity assessment, fluid urgency, and stress-dose steroid planning."));
      adrenalAtoms.push(examAtom("Test chair-rise strength", "When adrenal insufficiency, salt-wasting illness, or functional weakness is possible", "Clinically important weakness changes crisis severity, fall risk, and monitored-care threshold."));
    }
    if (/cushing/.test(diagnosis)) {
      adrenalAtoms.push(examAtom("Inspect skin for bruising", "When Cushing syndrome or glucocorticoid excess is possible", "Easy bruising supports hypercortisolism phenotype and changes testing threshold."));
      adrenalAtoms.push(examAtom("Test chair-rise strength", "When Cushing syndrome or glucocorticoid myopathy is possible", "Proximal weakness changes Cushing severity assessment and urgency of endocrine evaluation."));
      adrenalAtoms.push(examAtom("Inspect abdomen for purple striae", "When Cushing syndrome is suspected", "Wide purple striae increase clinical suspicion and justify hypercortisolism testing."));
      adrenalAtoms.push(examAtom("Inspect supraclavicular fullness", "When Cushing syndrome is suspected", "Supraclavicular fat distribution supports Cushing phenotype and affects pretest probability."));
    }
    if (/pheochromocytoma/.test(diagnosis)) {
      adrenalAtoms.push(examAtom("Auscultate heart rhythm", "When palpitations or catecholamine excess are possible", "Arrhythmia changes monitoring urgency and perioperative safety planning."));
      adrenalAtoms.push(examAtom("Inspect for diaphoresis", "When catecholamine spells, episodic symptoms, or hypertensive crisis concern is present", "Diaphoresis during a spell changes urgency, monitoring, and catecholamine-excess framing."));
      adrenalAtoms.push(examAtom("Assess tremor with outstretched hands", "When catecholamine spells, adrenergic symptoms, or hypertensive crisis concern is present", "Tremor supports adrenergic physiology and changes monitoring and medication-safety planning."));
    }
    if (/hyperaldosteronism/.test(diagnosis)) {
      adrenalAtoms.push(examAtom("Assess lower leg edema", "When hypertension, renal disease, or medication effects could affect volume status", "Edema changes medication interpretation and volume-sensitive blood pressure management."));
      adrenalAtoms.push(examAtom("Test chair-rise strength", "When hypokalemia, cramps, or weakness is possible", "Weakness changes hypokalemia severity assessment, ECG/lab urgency, and treatment safety."));
      adrenalAtoms.push(examAtom("Auscultate heart rhythm", "When primary aldosteronism, hypokalemia, palpitations, or severe hypertension is possible", "Irregular rhythm changes ECG need, potassium urgency, medication safety, and monitored-care threshold."));
    }
    if (/congenital adrenal hyperplasia|cah/.test(diagnosis)) {
      adrenalAtoms.push(examAtom("Inspect terminal hair distribution", "When androgen excess, virilization, or nonclassic CAH is possible", "Terminal hair pattern changes androgen-excess severity and testing priority."));
      adrenalAtoms.push(examAtom("Assess pubertal stage", "When pubertal timing, growth, fertility, or classic CAH phenotype is relevant", "Pubertal stage changes interpretation of adrenal androgen excess and gonadal-axis testing."));
    }
    return atomicExamUnique([...shared, ...adrenalAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.reproductiveGonadal) {
    const reproductiveAtoms = [
      examAtom("Inspect acne distribution", "When androgen excess or PCOS is possible", "Inflammatory acne supports hyperandrogenism and changes androgen testing threshold."),
      examAtom("Inspect terminal hair distribution", "When hirsutism, PCOS, or androgen excess is possible", "Terminal hair pattern changes hyperandrogenism grading and need for androgen evaluation.")
    ];
    if (/polycystic|hirsutism|amenorrhea|infertility/.test(diagnosis)) {
      reproductiveAtoms.push(examAtom("Inspect neck for acanthosis", "When PCOS, insulin resistance, or hyperandrogenic metabolic risk is possible", "Acanthosis changes metabolic-risk framing and diabetes screening urgency."));
    }
    if (/hypogonadism|erectile dysfunction|gynecomastia/.test(diagnosis)) {
      reproductiveAtoms.push(examAtom("Measure testicular volume", "When male hypogonadism, infertility, gynecomastia, or erectile dysfunction is relevant", "Small testes change primary versus central hypogonadism framing and fertility counseling."));
      reproductiveAtoms.push(examAtom("Inspect breast tissue", "When gynecomastia or hypogonadism is relevant", "True glandular tissue or suspicious mass changes endocrine versus breast-mass pathway."));
      reproductiveAtoms.push(examAtom("Assess body hair distribution", "When androgen deficiency or pubertal disorder is possible", "Reduced androgen-dependent hair supports hypogonadism and changes diagnostic framing."));
    }
    if (/amenorrhea|infertility|menopause/.test(diagnosis)) {
      reproductiveAtoms.push(examAtom("Inspect thyroid gland", "When menstrual, fertility, or menopausal symptoms could reflect thyroid disease", "Goiter changes thyroid testing interpretation and differential diagnosis."));
      reproductiveAtoms.push(examAtom("Inspect for galactorrhea", "When amenorrhea, infertility, breast symptoms, or prolactin excess is possible", "Galactorrhea changes prolactin testing and pituitary evaluation threshold."));
    }
    return atomicExamUnique([...shared, ...reproductiveAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.pituitary) {
    const pituitaryAtoms = [];
    const visualFieldAtom = examAtom("Test confrontation visual fields", "When pituitary mass, macroadenoma, headache, or visual symptoms are relevant", "Visual field loss changes urgency of MRI review, ophthalmology, and neurosurgical escalation.");
    const galactorrheaAtom = examAtom("Inspect for galactorrhea", "When prolactin excess, amenorrhea, infertility, breast symptoms, or hypogonadism is relevant", "Galactorrhea changes prolactin interpretation and pituitary workup priority.");
    const secondarySexAtom = examAtom("Assess secondary sex characteristics", "When hypopituitarism, prolactinoma, gonadal dysfunction, puberty, or growth concern is relevant", "Abnormal secondary sex characteristics change pituitary-gonadal axis testing and counseling.");
    const bodyHairAtom = examAtom("Assess body hair distribution", "When hypopituitarism or gonadal-axis deficiency is possible", "Reduced androgen-dependent hair changes pituitary-gonadal axis testing and counseling.");
    if (/prolactinoma/.test(diagnosis)) {
      pituitaryAtoms.push(visualFieldAtom, galactorrheaAtom, secondarySexAtom);
    }
    if (/hypopituitarism/.test(diagnosis)) {
      pituitaryAtoms.push(
        visualFieldAtom,
        secondarySexAtom,
        bodyHairAtom,
        examAtom("Inspect skin for pallor or dryness", "When hypopituitarism could involve central adrenal or thyroid deficiency", "Pallor, dryness, or coarse skin changes central adrenal/thyroid/gonadal deficiency framing and urgency.")
      );
    }
    if (/cushing/.test(diagnosis)) {
      pituitaryAtoms.push(examAtom("Inspect skin for bruising", "When Cushing disease or ACTH-dependent hypercortisolism is possible", "Easy bruising supports hypercortisolism phenotype and changes testing threshold."));
      pituitaryAtoms.push(examAtom("Test chair-rise strength", "When Cushing disease or glucocorticoid myopathy is possible", "Proximal weakness changes severity assessment and treatment urgency."));
      pituitaryAtoms.push(examAtom("Inspect abdomen for purple striae", "When Cushing disease is suspected", "Wide purple striae increase clinical suspicion and justify hypercortisolism testing."));
    }
    if (/acromegaly|gigantism/.test(diagnosis)) {
      pituitaryAtoms.push(visualFieldAtom);
      pituitaryAtoms.push(examAtom("Inspect hands for acral enlargement", "When growth hormone excess is possible", "Acral enlargement supports acromegaly phenotype and changes IGF-1 testing urgency."));
      pituitaryAtoms.push(examAtom("Inspect tongue size", "When acromegaly or macroglossia symptoms are possible", "Macroglossia changes sleep apnea and airway risk assessment."));
    }
    if (/gigantism/.test(diagnosis)) {
      pituitaryAtoms.push(examAtom("Assess pubertal stage", "When gigantism or pediatric growth concern is relevant", "Pubertal stage changes interpretation of growth velocity, growth-plate status, and gonadal-axis labs."));
    }
    if (/diabetes insipidus/.test(diagnosis)) {
      pituitaryAtoms.push(examAtom("Inspect mucous membranes for dehydration", "When polyuria, polydipsia, or hypernatremia is present", "Dehydration changes fluid and desmopressin monitoring urgency."));
      pituitaryAtoms.push(examAtom("Test capillary refill", "When water-balance disorder, dehydration, or hypernatremia is possible", "Delayed refill changes dehydration severity, fluid urgency, and monitored-care threshold."));
      pituitaryAtoms.push(examAtom("Test skin turgor", "When polyuria, polydipsia, dehydration, or hypernatremia is present", "Reduced turgor supports clinically important dehydration but must be interpreted cautiously with age and skin changes."));
    }
    return atomicExamUnique([...shared, ...pituitaryAtoms]).filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  return shared.filter((exam) => examCompatibleWithDiagnosis(exam, row));
}

function conditionalExamTemplates(row) {
  const category = endocrineCategoryFlags(row.category);
  const diagnosis = String(row.diagnosis || "").toLowerCase();
  const shared = [
    examAtom(
      "Inspect mucous membranes for dehydration",
      "When vomiting, poor intake, polyuria, hyperglycemia, hypercalcemia, or hypernatremia is present",
      "Dehydration changes fluid strategy, lab urgency, and monitoring needs.",
      { termsAny: ["vomiting", "dehydration", "poor intake", "polyuria", "hyperglycemia", "hypercalcemia", "hypernatremia"] }
    )
  ];
  if (category.diabetes) {
    const cardiometabolicConditionalExams = /prediabetes|metabolic syndrome/.test(diagnosis)
      ? [
          examAtom("Assess lower leg edema", "When dyspnea, kidney disease, heart failure, medication effect, or volume overload symptoms are present", "Edema changes cardiometabolic complication framing, medication safety, renal/cardiac evaluation, and follow-up urgency.", { termsAny: ["edema", "dyspnea", "heart failure", "kidney disease", "albuminuria", "volume overload"] }),
          examAtom("Inspect skin for xanthomas or xanthelasma", "When severe dyslipidemia, hypertriglyceridemia, pancreatitis risk, or familial lipid disorder is possible", "Xanthomas or xanthelasma change lipid disorder severity assessment, familial-risk framing, and urgency of lipid-focused management.", { termsAny: ["severe dyslipidemia", "hypertriglyceridemia", "pancreatitis", "familial lipid disorder", "xanthoma", "xanthelasma"] })
        ]
      : [];
    return [
      examAtom("Observe Kussmaul breathing", "When DKA or metabolic acidosis is possible", "Kussmaul breathing changes crisis severity and urgent treatment pathway.", { termsAny: ["dka", "hhs", "hyperglycemic crisis", "ketones", "acidosis", "vomiting"] }),
      examAtom("Palpate abdomen for tenderness", "When vomiting or abdominal pain accompanies hyperglycemia", "Tenderness changes precipitant evaluation and concern for surgical or pancreatitis mimic.", { termsAny: ["abdominal pain", "vomiting", "pancreatitis", "dka"] }),
      examAtom("Inspect insulin pump site", "When pump therapy or device failure is possible", "Site failure changes precipitant assessment and insulin delivery plan.", { termsAny: ["pump", "device", "missed insulin", "site"] }),
      examAtom("Inspect foot wound", "When established diabetes with foot wound, ulcer, fever, or infection is present", "A wound changes infection workup, antibiotics, and disposition.", { termsAny: ["foot wound", "ulcer", "infection", "fever", "established diabetes"] }),
      examAtom("Test monofilament sensation", "When established diabetes has neuropathy symptoms, foot ulcer, numbness, or fall risk", "Loss of protective sensation changes foot-care counseling, footwear planning, and ulcer prevention.", { termsAny: ["neuropathy", "numbness", "tingling", "foot ulcer", "foot wound", "established diabetes"] }),
      examAtom("Palpate pedal pulses", "When established diabetes has foot symptoms, ulcer, claudication, weak pulses, or vascular disease", "Diminished pulses change vascular risk assessment and foot-wound management.", { termsAny: ["claudication", "weak pulse", "vascular disease", "foot ulcer", "foot wound", "established diabetes"] }),
      ...cardiometabolicConditionalExams,
      ...shared
    ].filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.thyroid) {
    return [
      examAtom("Inspect eyelid retraction", "When Graves disease or thyrotoxicosis is possible", "Lid retraction supports Graves or adrenergic thyroid physiology and changes etiology assessment.", { termsAny: ["graves", "eye", "orbitopathy", "hyperthyroid", "thyrotoxicosis"] }),
      examAtom("Assess extraocular movements", "When diplopia, eye pain, proptosis, or Graves orbitopathy is possible", "Restriction changes orbitopathy severity and eye-care urgency.", { termsAny: ["diplopia", "eye pain", "proptosis", "orbitopathy"] }),
      examAtom("Assess voice quality", "When hoarseness, neck mass, goiter, nodule, or thyroid cancer is present", "Hoarseness changes airway and malignancy concern.", { termsAny: ["hoarseness", "neck mass", "goiter", "nodule", "thyroid cancer"] }),
      ...shared
    ].filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.boneParathyroid) {
    return [
      examAtom("Palpate spine for focal tenderness", "When fracture, vertebral pain, osteoporosis, or osteomalacia is possible", "Focal tenderness changes fracture imaging threshold.", { termsAny: ["fracture", "back pain", "spine", "osteoporosis", "osteomalacia", "fall"] }),
      examAtom("Elicit Chvostek sign", "When tingling, cramps, tetany, seizure, or hypocalcemia is possible", "Positive Chvostek sign changes urgency of calcium testing and replacement.", { termsAny: ["hypocalcemia", "tingling", "cramps", "tetany", "seizure", "low calcium"] }),
      examAtom("Elicit Trousseau sign", "When symptomatic hypocalcemia is possible and safe to perform", "Positive Trousseau sign changes urgency of calcium replacement and monitoring.", { termsAny: ["hypocalcemia", "tingling", "cramps", "tetany", "low calcium"] }),
      examAtom("Assess gait stability if safe", "When falls, fracture, weakness, or gait instability is present", "Unsafe gait changes fall precautions and disposition.", { termsAny: ["fall", "falls", "gait", "weakness", "fracture"] }),
      ...shared
    ].filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.adrenal) {
    const adrenalConditionals = [
      examAtom("Palpate abdomen for tenderness", "When adrenal crisis, vomiting, or abdominal pain is possible", "Tenderness changes adrenal crisis severity and mimic evaluation.", { termsAny: ["adrenal crisis", "vomiting", "abdominal pain", "shock"] }),
      ...shared
    ];
    if (/cushing/.test(diagnosis)) {
      adrenalConditionals.push(examAtom("Assess lower leg edema", "When severe Cushing syndrome, renal/cardiac disease, or medication effect could alter volume status", "Edema changes volume, VTE, renal-cardiac, and medication-safety interpretation.", { termsAny: ["edema", "heart failure", "kidney disease", "vte", "severe cushing"] }));
    }
    if (/pheochromocytoma/.test(diagnosis)) {
      adrenalConditionals.push(examAtom("Auscultate heart rhythm", "When catecholamine spells, palpitations, syncope, or severe hypertension are present", "Arrhythmia changes monitoring urgency and perioperative safety planning.", { termsAny: ["pheochromocytoma", "palpitations", "syncope", "severe hypertension"] }));
    }
    if (/hyperaldosteronism/.test(diagnosis)) {
      adrenalConditionals.push(examAtom("Auscultate heart rhythm", "When hypokalemia, palpitations, weakness, or severe hypertension are present", "Arrhythmia changes ECG/lab urgency and potassium replacement safety.", { termsAny: ["hypokalemia", "palpitations", "weakness", "severe hypertension"] }));
      adrenalConditionals.push(examAtom("Assess lower leg edema", "When aldosterone excess, hypertension, kidney disease, or medication effect could alter volume status", "Edema changes medication and volume interpretation.", { termsAny: ["aldosterone", "hypertension", "kidney disease", "edema"] }));
    }
    return adrenalConditionals.filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.reproductiveGonadal) {
    return [
      examAtom("Inspect for clitoromegaly", "When rapid virilization or severe androgen excess is present", "Virilization changes urgency of androgen tumor evaluation.", { termsAny: ["virilization", "rapid", "androgen", "hirsutism"] }),
      examAtom("Inspect for galactorrhea", "When amenorrhea, infertility, breast symptoms, or prolactin excess is possible", "Galactorrhea changes prolactin and pituitary testing threshold.", { termsAny: ["amenorrhea", "infertility", "galactorrhea", "prolactin", "breast"] }),
      examAtom("Measure testicular volume", "When hypogonadism, infertility, erectile dysfunction, or testicular symptoms are present", "Small testes change primary versus central hypogonadism framing.", { termsAny: ["hypogonadism", "infertility", "erectile dysfunction", "testicular", "low testosterone"] }),
      examAtom("Inspect breast tissue", "When gynecomastia, breast mass, or nipple symptoms are present", "Suspicious breast findings change endocrine versus breast-mass pathway.", { termsAny: ["gynecomastia", "breast mass", "nipple discharge", "breast"] }),
      ...shared
    ].filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  if (category.pituitary) {
    const pituitaryConditionals = [
      examAtom("Test confrontation visual fields", "When headache, visual symptoms, pituitary mass, or macroadenoma is present", "Field loss changes emergency imaging and neurosurgical urgency.", { termsAny: ["headache", "vision", "visual field", "pituitary mass", "macroadenoma", "mass effect"] }),
      examAtom("Assess extraocular movements", "When diplopia, apoplexy, cavernous sinus involvement, or cranial nerve symptoms are present", "Ophthalmoplegia changes emergency evaluation and neurosurgical urgency.", { termsAny: ["diplopia", "apoplexy", "cranial nerve", "cavernous"] }),
      ...shared
    ];
    if (/diabetes insipidus/.test(diagnosis)) {
      pituitaryConditionals.push(
        examAtom("Test skin turgor", "When dehydration, poor intake, or hypernatremia is present", "Reduced turgor supports clinically important dehydration but must be interpreted cautiously.", { termsAny: ["dehydration", "poor intake", "hypernatremia"] })
      );
    }
    if (/prolactinoma|hypopituitarism/.test(diagnosis)) {
      pituitaryConditionals.push(
        examAtom("Inspect for galactorrhea", "When breast symptoms, amenorrhea, infertility, or prolactin excess is present", "Galactorrhea changes prolactin interpretation and pituitary workup priority.", { termsAny: ["galactorrhea", "breast symptoms", "amenorrhea", "infertility", "prolactin"] }),
        examAtom("Assess secondary sex characteristics", "When hypogonadism, amenorrhea, infertility, delayed puberty, or libido symptoms are present", "Abnormal secondary sex characteristics change pituitary-gonadal axis testing and counseling.", { termsAny: ["hypogonadism", "amenorrhea", "infertility", "delayed puberty", "low libido"] })
      );
    }
    if (/acromegaly|gigantism|hypopituitarism/.test(diagnosis)) {
      pituitaryConditionals.push(
        examAtom("Assess pubertal stage", "When gigantism, delayed puberty, hypopituitarism, or pediatric growth concern is relevant", "Pubertal stage changes interpretation of growth and gonadal labs.", { termsAny: ["growth", "puberty", "delayed puberty", "pediatric"] })
      );
    }
    return pituitaryConditionals.filter((exam) => examCompatibleWithDiagnosis(exam, row));
  }
  return shared.filter((exam) => examCompatibleWithDiagnosis(exam, row));
}

function differentialMimics(row) {
  const category = endocrineCategoryFlags(row.category);
  if (category.diabetes) {
    return "Important mimics/exclusions: stress or steroid hyperglycemia, type 1/LADA versus type 2 diabetes, DKA/HHS versus uncomplicated hyperglycemia, hypoglycemia/drug effect, renal disease, infection, pregnancy, and secondary endocrine causes.";
  }
  if (category.thyroid) {
    return "Important mimics/exclusions: Graves disease, toxic nodule/multinodular goiter, thyroiditis, exogenous thyroid hormone or supplements, iodine/amiodarone effects, nonthyroidal illness, pregnancy-related thyroid disease, malignancy, and compressive nonthyroid neck disease.";
  }
  if (category.boneParathyroid) {
    return "Important mimics/exclusions: primary versus secondary or tertiary parathyroid disease, malignancy-associated calcium disorder, renal disease, vitamin D deficiency or excess, medication effects, malabsorption, osteomalacia, osteoporosis, and acute fracture.";
  }
  if (category.adrenal) {
    return "Important mimics/exclusions: exogenous glucocorticoid exposure or withdrawal, primary versus central adrenal insufficiency, adrenal incidentaloma, medication-altered renin/aldosterone testing, catecholamine excess, severe illness, infection, and electrolyte mimics.";
  }
  if (category.reproductiveGonadal) {
    return "Important mimics/exclusions: pregnancy, hypothalamic/pituitary disease, thyroid disease, hyperprolactinemia, PCOS, androgen-secreting tumor, medication or substance effects, primary gonadal failure, menopause/POI, and structural pelvic or testicular disease.";
  }
  if (category.pituitary) {
    return "Important mimics/exclusions: medication effects, pregnancy/lactation, renal/hepatic disease, sellar or parasellar mass, pituitary apoplexy, primary target-gland disease, central versus nephrogenic water-balance disorder, and age/puberty-specific normal variants.";
  }
  return "Important mimics/exclusions: medication effects, acute illness, assay interference, pregnancy or age-specific physiology, primary versus central endocrine disease, malignancy, and organ-system complications.";
}

function triggerTerms(row) {
  const cleanedDiagnosis = row.diagnosis.replace(/\([^)]*\)/g, "").trim();
  const dePossessiveDiagnosis = cleanedDiagnosis.replace(/['']s\b/gi, "").replace(/[’]s\b/gi, "").trim();
  const parentheticalTerms = Array.from(row.diagnosis.matchAll(/\(([^)]*)\)/g))
    .flatMap((match) => match[1].split(/,|\/|;/))
    .map((term) => term.trim())
    .filter(Boolean);
  return Array.from(new Set([
    row.diagnosis,
    cleanedDiagnosis,
    dePossessiveDiagnosis,
    ...parentheticalTerms,
    ...row.aliases,
    slug(cleanedDiagnosis).replace(/_/g, " "),
    slug(dePossessiveDiagnosis).replace(/_/g, " "),
    ...cleanedDiagnosis.split(/\s+\/\s+/)
  ].map((term) => String(term || "").trim()).filter(Boolean)));
}

function moduleFromWorkup(row) {
  const moduleId = diagnosisModuleId(row.diagnosis);
  const primarySourceId = row.source_ids[0];
  const sourceSectionPrefix = `${row.diagnosis} curated endocrine workup`;
  const referenceSummary = row.reference_values.join(" ");

  const questionTiers = tierQuestionTemplates(row);
  const questionItemExtra = (question) => ({
    text: question.text,
    options: question.options,
    action: question.management_implication,
    rationale: question.diagnostic_purpose,
    when_to_ask: question.when_to_ask,
    diagnostic_purpose: question.diagnostic_purpose,
    management_implication: question.management_implication,
    tags: question.tags,
    source_seed: question.source_seed
  });
  const requiredQuestions = questionTiers.required.map((question, index) => item("question", index, question.label, primarySourceId, `${sourceSectionPrefix}: required clinical questions`, questionItemExtra(question)));
  const conditionalQuestions = questionTiers.conditional.map((question, index) => item("question", index, question.label, primarySourceId, `${sourceSectionPrefix}: conditional clinical questions`, {
    ...questionItemExtra(question),
    action: conditionalQuestionAction(question, row),
    when_to_ask: conditionalQuestionWhenToAsk(question, row),
    when: question.when?.termsAny?.length ? question.when : { termsAny: [`${slug(row.diagnosis)} modifier`] }
  }));
  const requiredSafetyAtoms = requiredSafetyTemplates(row);
  const requiredExamAtoms = requiredExamTemplates(row);
  const requiredExamLabelSet = new Set(requiredExamAtoms.map((exam) => exam.label.toLowerCase()));
  const conditionalExamAtoms = atomicExamUnique(
    conditionalExamTemplates(row)
      .filter((exam) => !requiredExamLabelSet.has(exam.label.toLowerCase()))
      .map((exam) => ({
        ...exam,
        termsAny: conditionalExamTriggerTerms(exam, row)
      }))
  );
  const requiredSafetyLabelSet = new Set(requiredSafetyAtoms.map((exam) => exam.label.toLowerCase()));
  const conditionalSafetyAtoms = atomicExamUnique(
    conditionalSafetyTemplates(row)
      .filter((exam) => !requiredSafetyLabelSet.has(exam.label.toLowerCase()))
  );
  const physicalRequiredExamAtoms = requiredExamAtoms;
  const physicalConditionalExamAtoms = conditionalExamAtoms;
  const safetyChecks = [...requiredSafetyAtoms, ...conditionalSafetyAtoms].map((exam, index) => item("safety_check", index, exam.label, primarySourceId, `${sourceSectionPrefix}: basic bedside data and safety checks`, {
    action: `Check and document as baseline bedside data for this workup. ${exam.management_change}`,
    rationale: clinicalRationale("exam", exam.label, row),
    when_to_perform: exam.when_to_perform,
    findings_options: findingsOptionsForSafetyAtom(exam.label),
    diagnostic_target: diagnosticTargetForExam(exam.label, row),
    LR_plus: "n/a",
    LR_minus: "n/a",
    management_change: exam.management_change,
    difficulty: exam.difficulty,
    time_burden_minutes: exam.time_burden_minutes,
    equipment_needed: exam.equipment_needed,
    patient_cooperation_required: exam.patient_cooperation_required,
    limitations: limitationsForSafetyAtom(exam.label),
    likelihood_ratio_note: routineSafetyLikelihoodRatioNote,
    tags: exam.tags?.length ? exam.tags : questionTagsForPhrase(exam.label, row),
    ...(exam.termsAny?.length ? { when: { termsAny: exam.termsAny } } : {})
  }));
  const requiredExam = physicalRequiredExamAtoms.map((exam, index) => {
    const metadata = examMetadata(exam, row);
    return item("exam", index, exam.label, primarySourceId, `${sourceSectionPrefix}: required bedside maneuver`, {
      action: `Use this maneuver to evaluate ${metadata.diagnostic_target}. ${exam.management_change}`,
      rationale: clinicalRationale("exam", exam.label, row),
      technique: metadata.technique,
      findings_options: metadata.findings_options,
      when_to_perform: exam.when_to_perform,
      diagnostic_target: metadata.diagnostic_target,
      LR_plus: metadata.LR_plus,
      LR_minus: metadata.LR_minus,
      likelihood_ratio_note: likelihoodRatioNoteForExam(metadata.LR_plus, metadata.LR_minus),
      management_change: exam.management_change,
      difficulty: exam.difficulty,
      time_burden_minutes: exam.time_burden_minutes,
      equipment_needed: metadata.equipment_needed,
      patient_cooperation_required: exam.patient_cooperation_required,
      limitations: metadata.limitations,
      tags: metadata.tags
    });
  });
  const conditionalExam = physicalConditionalExamAtoms.map((exam, index) => {
    const metadata = examMetadata(exam, row);
    const triggerSummary = exam.termsAny?.length ? exam.termsAny.slice(0, 5).join(", ") : "the relevant modifier";
    return item("conditional_exam", index, exam.label, primarySourceId, `${sourceSectionPrefix}: conditional bedside maneuver add-ons`, {
      action: `Add when ${triggerSummary} is present; this evaluates ${metadata.diagnostic_target}. ${exam.management_change}`,
      rationale: clinicalRationale("exam", exam.label, row),
      technique: metadata.technique,
      findings_options: metadata.findings_options,
      when_to_perform: exam.when_to_perform,
      diagnostic_target: metadata.diagnostic_target,
      LR_plus: metadata.LR_plus,
      LR_minus: metadata.LR_minus,
      likelihood_ratio_note: likelihoodRatioNoteForExam(metadata.LR_plus, metadata.LR_minus),
      management_change: exam.management_change,
      difficulty: exam.difficulty,
      time_burden_minutes: exam.time_burden_minutes,
      equipment_needed: metadata.equipment_needed,
      patient_cooperation_required: exam.patient_cooperation_required,
      limitations: metadata.limitations,
      tags: metadata.tags,
      when: { termsAny: exam.termsAny }
    });
  });
  const testItems = row.tests.map((test, index) => item("test", index, test, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: diagnostic workup`, {
    action: `Interpret with local lab ranges. Reference anchors: ${referenceSummary}`,
    rationale: clinicalRationale("test", test, row),
    ...decisionItemMetadata("test", test, row, `Interpret with local lab ranges. Reference anchors: ${referenceSummary}`),
    tags: questionTagsForPhrase(test, row)
  }));
  const referenceItems = row.reference_values.map((referenceValue, index) => item("reference", index, referenceValue, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: reference ranges and diagnostic thresholds`, {
    action: "Use as a diagnostic anchor; confirm with local laboratory assay, pregnancy/age/sex context, and acute illness context.",
    rationale: clinicalRationale("test", referenceValue, row),
    ...decisionItemMetadata("test", referenceValue, row, "Use as a diagnostic anchor; confirm with local laboratory assay, pregnancy/age/sex context, and acute illness context."),
    tags: questionTagsForPhrase(referenceValue, row)
  }));
  const redFlags = row.red_flags.map((redFlag, index) => item("red_flag", index, redFlag, primarySourceId, `${sourceSectionPrefix}: red flags`, {
    action: "Escalate urgently, reassess severity, and evaluate for dangerous mimics or complications.",
    rationale: clinicalRationale("red_flag", redFlag, row),
    ...decisionItemMetadata("red_flag", redFlag, row, "Escalate urgently, reassess severity, and evaluate for dangerous mimics or complications."),
    tags: questionTagsForPhrase(redFlag, row),
    when: { termsAny: redFlag.split(/[;,]| or | and /i).map((term) => term.trim()).filter((term) => term.length >= 4).slice(0, 8) }
  }));
  const dispositionRules = row.management_changes.map((managementChange, index) => item("management", index, managementChange, row.source_ids[index % row.source_ids.length], `${sourceSectionPrefix}: results that change management`, {
    action: managementChange,
    rationale: clinicalRationale("management", managementChange, row),
    ...decisionItemMetadata("management", managementChange, row, managementChange),
    tags: questionTagsForPhrase(managementChange, row)
  }));
  const applicability = applicabilityForEndocrineWorkup(row);

  return {
    schema_version: schemaVersion,
    artifact_type: "complaint_cds_module",
    complaint_cds_schema_version: moduleSchemaVersion,
    module: {
      id: moduleId,
      schema_version: moduleSchemaVersion,
      label: row.diagnosis,
      complaint_group: slug(row.category),
      version: "1.0.0",
      status: "mvp",
      population: {
        age_group: "adult",
        setting: "clinician support"
      },
      ...(applicability ? { applicability } : {}),
      triggers: triggerTerms(row),
      differentialBuckets: [
        item("differential", 0, `${row.diagnosis}: diagnostic frame from guideline-sourced endocrine workup`, primarySourceId, `${sourceSectionPrefix}: diagnostic frame`, {
          action: `Use this frame to decide whether ${row.tests[0] || row.management_changes[0] || row.diagnosis} is the right first confirmatory step and whether urgent endocrine escalation is needed.`,
          rationale: clinicalRationale("test", row.tests[0] || row.management_changes[0] || row.diagnosis, row),
          ...decisionItemMetadata("differential", `${row.diagnosis}: diagnostic frame from guideline-sourced endocrine workup`, row, `Use this frame to decide whether ${row.tests[0] || row.management_changes[0] || row.diagnosis} is the right first confirmatory step and whether urgent endocrine escalation is needed.`),
          tags: questionTagsForPhrase(row.diagnosis, row)
        }),
        item("differential", 1, `Key thresholds and interpretation caveats: ${row.reference_values.slice(0, 2).join(" ")}`, row.source_ids[Math.min(1, row.source_ids.length - 1)], `${sourceSectionPrefix}: thresholds`, {
          action: "Use local assay and patient context; do not apply numeric anchors without clinical interpretation.",
          rationale: clinicalRationale("test", row.reference_values.slice(0, 2).join(" "), row),
          ...decisionItemMetadata("differential", `Key thresholds and interpretation caveats: ${row.reference_values.slice(0, 2).join(" ")}`, row, "Use local assay and patient context; do not apply numeric anchors without clinical interpretation."),
          tags: questionTagsForPhrase(row.reference_values.slice(0, 2).join(" "), row)
        }),
        item("differential", 2, differentialMimics(row), row.source_ids[Math.min(2, row.source_ids.length - 1)], `${sourceSectionPrefix}: mimics and exclusions`, {
          action: "Use these alternatives to avoid premature closure and to decide which confirmatory tests, imaging, or specialty pathways are needed.",
          rationale: `Improves ${row.diagnosis} diagnostic safety by requiring review of dangerous mimics, common confounders, and assay/context pitfalls before committing to a final pathway.`,
          ...decisionItemMetadata("differential", differentialMimics(row), row, "Use these alternatives to avoid premature closure and to decide which confirmatory tests, imaging, or specialty pathways are needed."),
          tags: questionTagsForPhrase(differentialMimics(row), row)
        })
      ],
      redFlags,
      safetyChecks,
      requiredQuestions,
      conditionalQuestions,
      requiredExam,
      conditionalExam,
      initialTests: [...testItems, ...referenceItems],
      dispositionRules,
      endocrine_metadata: {
        generated_from: "scripts/generate-endocrine-workups.js",
        source_diagnosis: row.diagnosis,
        category: row.category,
        aliases: row.aliases,
        source_ids: row.source_ids,
        reference_values: row.reference_values,
        quality_issues: row.quality_issues,
        activation_status: "active_guideline_workup"
      }
    }
  };
}

export { diagnosisModuleId, moduleFromWorkup };

function updateSourceRegistry(workupData) {
  const current = readJson(sourceRegistryPath);
  const byId = new Map((current.sources || []).map((row) => [row.id, row]));
  for (const [id, tuple] of Object.entries(workupData.sources || {})) {
    if (!byId.has(id)) {
      byId.set(id, sourceRegistryRow(id, tuple));
    }
  }
  const next = {
    ...current,
    generated_from: "medical-knowledge modules and endocrine workup automation",
    sources: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
  };
  writeJson(sourceRegistryPath, next);
  return next;
}

function updateManifest(modulePaths) {
  const current = readJson(manifestPath);
  const existing = (current.complaint_modules || []).filter((modulePath) => !/complaint-modules\/endocrine\//.test(modulePath));
  const next = {
    ...current,
    complaint_modules: [...existing, ...modulePaths].sort()
  };
  writeJson(manifestPath, next);
  return next;
}

function formatCompletionReport(workups, modulePaths, sourceRegistry) {
  const lines = [
    "# Endocrine Workup Completion Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Completed modules: ${workups.length}`,
    `Source registry entries: ${sourceRegistry.sources.length}`,
    "",
    "Status: mvp. These modules are active guideline-backed endocrine workups with local source/schema/PHI/regression checks.",
    "",
    "## Completed One By One",
    ""
  ];
  workups.forEach((row, index) => {
    const moduleId = diagnosisModuleId(row.diagnosis);
    const questionTiers = tierQuestionTemplates(row);
    const safetyCheckCount = requiredSafetyTemplates(row).length + conditionalSafetyTemplates(row).length;
    lines.push(
      `${index + 1}. ${row.diagnosis} (${moduleId})`,
      `   - Category: ${row.category}`,
      `   - Sources: ${row.source_ids.join("; ")}`,
      `   - Required questions: ${questionTiers.required.length}; conditional question add-ons: ${questionTiers.conditional.length}; safety checks: ${safetyCheckCount}; required exams: ${requiredExamTemplates(row).length}; conditional exam add-ons: ${conditionalExamTemplates(row).length}; tests/reference anchors: ${row.tests.length + row.reference_values.length}; red flags: ${row.red_flags.length}; management rules: ${row.management_changes.length}`,
      `   - Quality issues: ${row.quality_issues.length ? row.quality_issues.join("; ") : "none"}`,
      `   - File: ${modulePaths[index]}`
    );
    if (index < workups.length - 1) {
      lines.push("");
    }
  });
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { workups: defaultWorkupPath };
  argv.forEach((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    if (key === "workups") {
      args.workups = path.resolve(valueParts.join("="));
    }
  });
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.workups)) {
    throw new Error(`Missing endocrine workup JSON at ${args.workups}. Run npm run generate:endocrine-workups first.`);
  }
  const workupData = readJson(args.workups);
  const workups = workupData.workups || [];
  if (workups.length !== 37) {
    throw new Error(`Expected 37 endocrine workups, found ${workups.length}.`);
  }
  const incomplete = workups.filter((row) => row.quality_issues?.length);
  if (incomplete.length) {
    throw new Error(`Endocrine workups must pass quality validation before installation: ${incomplete.map((row) => row.diagnosis).join(", ")}`);
  }

  const modulePaths = [];
  mkdirSync(endocrineModuleDir, { recursive: true });
  for (const row of workups) {
    const moduleId = diagnosisModuleId(row.diagnosis);
    const modulePath = path.join(endocrineModuleDir, `${moduleId}.json`);
    writeJson(modulePath, moduleFromWorkup(row));
    modulePaths.push(path.relative(repoRoot, modulePath).replace(/\\/g, "/"));
  }
  const sourceRegistry = updateSourceRegistry(workupData);
  updateManifest(modulePaths);
  mkdirSync(path.dirname(completionReportPath), { recursive: true });
  writeFileSync(completionReportPath, formatCompletionReport(workups, modulePaths, sourceRegistry), "utf8");
  process.stdout.write(`Installed ${workups.length} endocrine workup modules.\n`);
  process.stdout.write(`Completion report: ${completionReportPath}\n`);
}

const isCliRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliRun) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
