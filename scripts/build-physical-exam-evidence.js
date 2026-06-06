import { readFileSync, writeFileSync } from "node:fs";

const basePath = "physical_exam_reference.csv";
const overlayPath = "physical_exam_evidence_overlay.csv";
const lastReviewed = "2026-06-06";

const baseColumns = [
  "exam_system",
  "section",
  "region_or_subsection",
  "maneuver_or_finding",
  "source_item",
  "patient_instruction_or_setup",
  "examiner_technique",
  "observe_or_positive_finding",
  "function_or_clinical_use",
  "suggested_checklist_label",
  "suggested_options",
  "include_when"
];

const overlayColumns = [
  "exam_id",
  "condition_or_syndrome",
  "diagnostic_target",
  "when_to_use_structured",
  "result_changes_management",
  "management_link",
  "evidence_source_primary",
  "source_url_or_pubmed",
  "LR_plus",
  "LR_minus",
  "evidence_tier",
  "difficulty",
  "time_burden_minutes",
  "equipment_needed",
  "care_setting",
  "contraindications_or_limitations",
  "retrieval_tags",
  "actionability_score_seed",
  "evidence_status",
  "evidence_summary",
  "last_reviewed"
];

const sourceUrls = {
  stanfordGuides: "https://med.stanford.edu/stanfordmedicine25/exam-guides-.html",
  stanfordPulmonary: "https://stanfordmedicine25.stanford.edu/the25/pulmonary.html",
  stanfordJvp: "https://stanfordmedicine25.stanford.edu/the25/neck-exam-jugular-venous-pressure-measurement.html",
  stanfordCardiac: "https://stanfordmedicine25.stanford.edu/the25/cardiac.html",
  stanfordBloodPressure: "https://stanfordmedicine25.stanford.edu/the25/bppp.html",
  stanfordReflex: "https://stanfordmedicine25.stanford.edu/the25/tendon.html",
  stanfordCerebellar: "https://stanfordmedicine25.stanford.edu/the25/cerebellar.html",
  stanfordGait: "https://stanfordmedicine25.stanford.edu/the25/gait.html",
  merckCranialNerves: "https://www.merckmanuals.com/professional/neurologic-disorders/neurologic-examination/how-to-assess-the-cranial-nerves",
  merckReflexes: "https://www.merckmanuals.com/professional/neurologic-disorders/neurologic-examination/how-to-assess-reflexes",
  hopkinsNeuro: "https://www.hopkinsmedicine.org/health/conditions-and-diseases/neurological-exam",
  heartFailureRce: "https://pubmed.ncbi.nlm.nih.gov/16234501/",
  heartFailureGuideline: "https://www.jacc.org/doi/10.1016/j.jacc.2021.12.012",
  sepsisGuideline: "https://www.sccm.org/Clinical-Resources/Guidelines/Guidelines/Surviving-Sepsis-Guidelines-2021",
  pulmonaryHypertensionReview: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8523183/",
  appendicitisPubMed: "https://pubmed.ncbi.nlm.nih.gov/?term=8918857",
  appendicitisAafp: "https://www.aafp.org/pubs/afp/issues/1999/1101/p2027.html",
  acuteAbdomenAafp: "https://www.aafp.org/afp/2023/0600/acute-abdominal-pain-adults.pdf",
  cholecystitisWses: "https://pmc.ncbi.nlm.nih.gov/articles/4908702/",
  murphyReview: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6306141/",
  cvaTendernessPubMed: "https://pubmed.ncbi.nlm.nih.gov/36605912/",
  acutePyelo: "https://www.ncbi.nlm.nih.gov/sites/books/NBK519537/",
  peripheralEdema: "https://pubmed.ncbi.nlm.nih.gov/36379502/"
};

const highYieldNeuroSourceItems = new Set([
  "Neuro 1",
  "Neuro 2",
  "Neuro 3",
  "Neuro 5",
  "Neuro 6",
  "Neuro 7",
  "Neuro 8",
  "Neuro 9",
  "Neuro 10",
  "Neuro 14",
  "Neuro 17",
  "Neuro 18",
  "Neuro 19",
  "Neuro 20",
  "Neuro 21",
  "Neuro 24",
  "Neuro 25",
  "Neuro 27",
  "Neuro 28",
  "Neuro 29",
  "Neuro 30",
  "Neuro 31",
  "Neuro 32",
  "Neuro 33",
  "Neuro 34",
  "Neuro 35",
  "Neuro 36",
  "Neuro 37",
  "Neuro 38",
  "Neuro 39",
  "Neuro 40",
  "Neuro 41",
  "Neuro 42",
  "Neuro 46"
]);

function parseCsvRow(line) {
  const fields = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function parseCsv(csvText) {
  const lines = String(csvText || "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvRow(lines[0] || "");
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvRow(line);
    if (fields.length !== headers.length) {
      throw new Error(`CSV row has ${fields.length} fields but expected ${headers.length}: ${line}`);
    }
    return headers.reduce((row, header, index) => {
      row[header] = fields[index] || "";
      return row;
    }, {});
  });
  return { headers, rows };
}

function stringifyCsv(headers, rows) {
  const escapeField = (value) => {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };
  return `${headers.map(escapeField).join(",")}\n${rows.map((row) => headers.map((header) => escapeField(row[header])).join(",")).join("\n")}\n`;
}

function slugify(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "exam";
}

function buildExamIds(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const base = slugify([
      row.exam_system,
      row.section,
      row.region_or_subsection,
      row.maneuver_or_finding
    ].filter(Boolean).join(" "));
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${String(count).padStart(2, "0")}`;
  });
}

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+%/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagify(value) {
  return slugify(value).replace(/_{2,}/g, "_");
}

function addTag(tags, value) {
  const tag = tagify(value);
  if (tag && tag.length > 1) {
    tags.add(tag);
  }
}

function buildTags(row) {
  const tags = new Set();
  const text = normalizedText(Object.values(row).join(" "));
  [row.exam_system, row.section, row.region_or_subsection, row.maneuver_or_finding].forEach((part) => addTag(tags, part));
  String(row.include_when || "").split(/[;]/).forEach((part) => addTag(tags, part));

  const synonymRules = [
    [/\b(dyspnea|shortness|hypoxia|respiratory|pulmonary|oxygen)\b/, ["dyspnea", "hypoxia", "respiratory_status", "pulmonary_exam"]],
    [/\b(pneumonia|infection|fever|sepsis)\b/, ["infection", "sepsis", "pneumonia"]],
    [/\b(heart failure|jvp|pmi|edema|volume overload|cardiomyopathy)\b/, ["heart_failure", "volume_status", "volume_overload", "diuresis"]],
    [/\b(shock|hypotension|syncope|heart rate|blood pressure|pulse)\b/, ["shock", "hemodynamics", "perfusion"]],
    [/\b(murmur|heart sound|aortic|pulmonic|tricuspid|mitral)\b/, ["murmur", "valvular_disease", "cardiac_auscultation"]],
    [/\b(vascular|carotid|femoral|dorsalis|posterior tibial|limb ischemia)\b/, ["vascular_disease", "peripheral_pulses"]],
    [/\b(diabetes|foot)\b/, ["diabetes_foot", "vascular_screen"]],
    [/\b(abdominal|abdomen|bowel|gi|gu)\b/, ["abdominal_pain", "abdominal_exam"]],
    [/\b(appendicitis|rlq|psoas|obturator)\b/, ["appendicitis", "rlq_pain"]],
    [/\b(cholecystitis|murphy|ruq|liver|biliary)\b/, ["ruq_pain", "biliary_disease", "cholecystitis"]],
    [/\b(cva|pyelonephritis|flank|renal|aki|kidney|urinary|renal colic)\b/, ["flank_pain", "pyelonephritis", "renal_colic", "aki"]],
    [/\b(neuro|stroke|weakness|numb|sensory|motor|reflex|babinski|gait|romberg|ataxia)\b/, ["neuro_exam", "neurologic_localization"]],
    [/\b(visual|pupil|pupillary|eye|cranial nerve|facial|tongue|palate)\b/, ["cranial_nerve_exam", "stroke"]],
    [/\b(reflex|babinski|myelopathy|upper motor)\b/, ["upper_motor_neuron", "myelopathy"]],
    [/\b(gait|romberg|falls|balance|ataxia|cerebellar)\b/, ["falls", "balance", "ataxia"]],
    [/\b(heent|ear|mouth|oropharynx|lymph|thyroid|sinus|sclera)\b/, ["heent_exam"]],
    [/\b(thyroid|endocrine)\b/, ["thyroid_disease", "endocrine"]],
    [/\b(msk|joint|shoulder|wrist|hand|hip|knee|ankle|foot|back|spine|range of motion)\b/, ["msk_exam", "pain", "functional_status"]]
  ];

  for (const [pattern, additions] of synonymRules) {
    if (pattern.test(text)) {
      additions.forEach((tag) => addTag(tags, tag));
    }
  }

  return Array.from(tags).sort().join(";");
}

function inferDifficulty(row) {
  const text = normalizedText(`${row.maneuver_or_finding} ${row.examiner_technique} ${row.section}`);
  if (/jvp|ophthalmoscope|weber|rinne|murphy|psoas|obturator|straight leg|yergason|hawkins|empty can|finkelstein|romberg|heel-to-toe|tandem|reflex|babinski/.test(text)) {
    return "medium";
  }
  if (/gait|palpate spleen|percuss liver|auscultate heart/.test(text)) {
    return "medium";
  }
  return "low";
}

function inferTimeBurden(row) {
  const text = normalizedText(`${row.maneuver_or_finding} ${row.examiner_technique} ${row.section}`);
  if (/setup|positioning|draping|hygiene/.test(text)) {
    return "0.5";
  }
  if (/cranial nerve|gait|romberg|weber|rinne|visual fields|psoas|obturator|murphy|reflex|babinski|ophthalmoscope|spleen|liver span|heart with diaphragm/.test(text)) {
    return "2";
  }
  if (/range of motion|strength|auscultate|percuss|palpate|tactile fremitus|blood pressure/.test(text)) {
    return "1.5";
  }
  return "1";
}

function inferEquipment(row) {
  const text = normalizedText(`${row.maneuver_or_finding} ${row.examiner_technique} ${row.patient_instruction_or_setup}`);
  const equipment = new Set();
  if (/stethoscope|auscult/.test(text)) equipment.add("stethoscope");
  if (/blood pressure|korotkoff/.test(text)) equipment.add("blood pressure cuff");
  if (/pupill|light|penlight/.test(text)) equipment.add("penlight");
  if (/visual acuity|screening chart/.test(text)) equipment.add("pocket visual acuity chart");
  if (/weber|rinne|vibration|tuning fork/.test(text)) equipment.add("128 Hz tuning fork");
  if (/reflex|babinski/.test(text)) equipment.add("reflex hammer or tongue blade");
  if (/cotton|sharp|sensation|light touch/.test(text)) equipment.add("cotton-tipped applicator");
  if (/ophthalmoscope|fundus/.test(text)) equipment.add("ophthalmoscope");
  if (/otoscope|ear canal|nose otoscope/.test(text)) equipment.add("otoscope");
  return equipment.size ? Array.from(equipment).join("; ") : "none";
}

function inferCareSetting(row) {
  if (row.exam_system === "MSK") {
    return "inpatient bedside; outpatient clinic; ED";
  }
  if (/vital|shock|sepsis|dyspnea|acute|stroke|weakness/i.test(`${row.include_when} ${row.maneuver_or_finding}`)) {
    return "inpatient bedside; ED; clinic";
  }
  return "inpatient bedside; outpatient clinic";
}

function inferCondition(row) {
  const tags = String(row.include_when || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return tags.join("; ") || "general bedside assessment";
}

function inferDiagnosticTarget(row) {
  const text = normalizedText(`${row.exam_system} ${row.section} ${row.region_or_subsection} ${row.maneuver_or_finding} ${row.function_or_clinical_use}`);
  if (/heart rate|respiratory rate|blood pressure/.test(text)) return "bedside vital-sign instability and trend";
  if (/jvp/.test(text)) return "elevated right-sided filling pressure or venous congestion";
  if (/edema/.test(text)) return "peripheral edema pattern and volume overload clue";
  if (/pulse|carotid|femoral|dorsalis|posterior tibial/.test(text)) return "perfusion deficit, vascular disease, or limb ischemia clue";
  if (/lung|thorax|fremitus|pulmonary/.test(text)) return "focal consolidation, effusion, wheeze, work of breathing, or ventilation abnormality";
  if (/heart sound|auscult|aortic|pulmonic|tricuspid|mitral/.test(text)) return "murmur, abnormal heart sound, or S3/S4 clue";
  if (/pmi|apical impulse|precordium/.test(text)) return "cardiomegaly or displaced/hyperdynamic precordial impulse";
  if (/murphy/.test(text)) return "acute cholecystitis or biliary inflammation";
  if (/psoas|obturator/.test(text)) return "appendiceal irritation pattern";
  if (/rebound|peritoneal/.test(text)) return "peritoneal irritation or acute abdomen";
  if (/cva/.test(text)) return "renal colic or pyelonephritis-associated renal tenderness";
  if (/abdomen|bowel|liver|spleen/.test(text)) return "tenderness pattern, bowel activity, organomegaly, or ascites clue";
  if (/visual field|visual acuity|pupill|extraocular/.test(text)) return "cranial nerve II/III/IV/VI deficit or neuro-ophthalmic localization";
  if (/facial|masseter|palate|tongue/.test(text)) return "cranial nerve motor or sensory asymmetry";
  if (/pronator|strength|motor/.test(text)) return "focal motor weakness or upper motor neuron pattern";
  if (/light touch|sharp|vibration|proprioception|sensation/.test(text)) return "sensory deficit, neuropathy, posterior column, or localization clue";
  if (/reflex|babinski/.test(text)) return "upper versus lower motor neuron localization";
  if (/finger-to-nose|rapid alternating|heel-to-shin|gait|romberg/.test(text)) return "coordination, gait safety, cerebellar, vestibular, or proprioceptive pattern";
  return row.function_or_clinical_use || "bedside finding characterization";
}

function inferManagementImpact(row) {
  const text = normalizedText(`${row.include_when} ${row.maneuver_or_finding} ${row.diagnostic_target}`);
  if (/heart failure|volume overload|jvp|edema|pmi/.test(text)) return "Abnormal congestion findings can support diuresis decisions, escalation of respiratory support assessment, daily volume trending, or need for cardiac evaluation in context.";
  if (/shock|sepsis|blood pressure|heart rate|respiratory rate/.test(text)) return "Abnormal vitals or perfusion findings can trigger urgent reassessment, resuscitation, sepsis/shock pathway review, or escalation.";
  if (/pneumonia|effusion|dyspnea|lung|pulmonary/.test(text)) return "New focal pulmonary findings can prompt oxygen/support reassessment, imaging review, antibiotics/bronchodilator consideration, or escalation.";
  if (/appendicitis|cholecystitis|acute abdomen|rebound|murphy|psoas|obturator/.test(text)) return "Positive acute-abdomen signs can prompt senior review, imaging, surgical consultation, NPO/analgesia planning, or serial abdominal exams.";
  if (/pyelonephritis|renal colic|aki|cva/.test(text)) return "Renal tenderness or flank findings can support urine testing, imaging consideration, antimicrobial review, obstruction concern, or serial reassessment.";
  if (/stroke|weakness|neuro|cranial|reflex|babinski|gait|romberg|ataxia/.test(text)) return "New focal neurologic findings can prompt urgent localization, stroke/neuro escalation, fall precautions, imaging review, or therapy planning.";
  if (/vascular|pulse|limb ischemia|diabetes foot/.test(text)) return "Pulse or foot abnormalities can prompt vascular/wound evaluation, limb-risk documentation, or perfusion imaging consideration.";
  return "Abnormal or changed findings improve focused bedside documentation and can prompt targeted reassessment, diagnostics, or escalation in context.";
}

function inferManagementLink(row) {
  const text = normalizedText(`${row.include_when} ${row.maneuver_or_finding} ${row.section}`);
  if (/heart failure|volume overload|jvp|pmi|edema|heart sound/.test(text)) return sourceUrls.heartFailureGuideline;
  if (/sepsis|shock|infection|blood pressure|heart rate|respiratory rate/.test(text)) return sourceUrls.sepsisGuideline;
  if (/appendicitis|psoas|obturator/.test(text)) return sourceUrls.appendicitisPubMed;
  if (/cholecystitis|murphy|ruq/.test(text)) return sourceUrls.cholecystitisWses;
  if (/abdominal|rebound|bowel|liver|spleen|acute abdomen/.test(text)) return sourceUrls.acuteAbdomenAafp;
  if (/pyelonephritis|renal colic|cva|aki|flank/.test(text)) return sourceUrls.acutePyelo;
  if (/stroke|neuro|weakness|gait|reflex|cranial|sensation/.test(text)) return sourceUrls.hopkinsNeuro;
  if (/edema/.test(text)) return sourceUrls.peripheralEdema;
  return "";
}

function inferContraindications(row) {
  const text = normalizedText(`${row.maneuver_or_finding} ${row.examiner_technique} ${row.include_when}`);
  if (/romberg|gait|toe walking|heel walking|tandem/.test(text)) return "Guard closely; avoid unsupported testing when fall risk, severe weakness, or unsafe standing.";
  if (/psoas|obturator|rebound|murphy|palpation|mtp squeeze|straight leg|patellar grind/.test(text)) return "Use gentle technique; stop if severe pain, guarding, instability, or patient preference limits exam.";
  if (/blood pressure/.test(text)) return "Use appropriate cuff size and avoid affected limbs when contraindicated by lines, injury, fistula, or surgical precautions.";
  if (/carotid/.test(text)) return "Do not palpate both carotids at once; use caution with syncope, bruits, or known vascular disease.";
  if (/ophthalmoscope|pupill|light/.test(text)) return "Limit bright light if severe photophobia or ocular injury; interpret cautiously after eye drops or ocular procedures.";
  if (/sensory|sharp|cotton/.test(text)) return "Use clean disposable stimulus; avoid skin breakdown or open wounds.";
  if (/stethoscope|auscult/.test(text)) return "Clean equipment before patient contact and interpret cautiously in noisy rooms.";
  return "Interpret in clinical context; patient cooperation, pain, body habitus, positioning, and examiner skill may limit reliability.";
}

function inferActionability(row) {
  const text = normalizedText(`${row.exam_system} ${row.section} ${row.maneuver_or_finding} ${row.include_when}`);
  if (/blood pressure|heart rate|respiratory rate|jvp|edema|cva|murphy|rebound|psoas|obturator|babinski|pronator|pupill|gait|romberg/.test(text)) return "9";
  if (/lung|auscultate|percuss|fremitus|heart sound|pmi|pulse|strength|reflex|sensation|visual field|extraocular|palate|tongue/.test(text)) return "8";
  if (/inspection|setup|hygiene|draping|positioning/.test(text)) return "5";
  return "6";
}

function baseOverlay(row) {
  return {
    exam_id: row.exam_id,
    condition_or_syndrome: inferCondition(row),
    diagnostic_target: inferDiagnosticTarget(row),
    when_to_use_structured: row.include_when,
    result_changes_management: inferManagementImpact(row),
    management_link: inferManagementLink(row),
    evidence_source_primary: "",
    source_url_or_pubmed: "",
    LR_plus: "",
    LR_minus: "",
    evidence_tier: "insufficient_public_evidence",
    difficulty: inferDifficulty(row),
    time_burden_minutes: inferTimeBurden(row),
    equipment_needed: inferEquipment(row),
    care_setting: inferCareSetting(row),
    contraindications_or_limitations: inferContraindications(row),
    retrieval_tags: buildTags(row),
    actionability_score_seed: inferActionability(row),
    evidence_status: "pending",
    evidence_summary: "",
    last_reviewed: ""
  };
}

function sourceForCuratedRow(row) {
  const text = normalizedText(`${row.section} ${row.region_or_subsection} ${row.maneuver_or_finding} ${row.include_when}`);
  if (/jvp/.test(text)) return ["Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension", sourceUrls.pulmonaryHypertensionReview, "systematic_review"];
  if (/blood pressure/.test(text)) return ["Stanford Medicine 25 blood pressure measurement techniques; Surviving Sepsis Campaign guideline", sourceUrls.stanfordBloodPressure, "guideline"];
  if (/heart rate|respiratory rate/.test(text)) return ["Surviving Sepsis Campaign guideline; vital-sign trend interpreted in clinical context", sourceUrls.sepsisGuideline, "guideline"];
  if (/heart sound|auscultate heart/.test(text)) return ["JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds", sourceUrls.heartFailureRce, "rce_or_meta_analysis"];
  if (/pulmonary|lung|thorax|fremitus/.test(text)) return ["Stanford Medicine 25 pulmonary exam guide", sourceUrls.stanfordPulmonary, "teaching_reference"];
  if (/aortic|pulmonic|tricuspid|mitral/.test(text)) return ["Stanford Medicine 25 cardiac second sounds", sourceUrls.stanfordCardiac, "teaching_reference"];
  if (/pmi|apical|precordium|cardiac/.test(text)) return ["2022 AHA/ACC/HFSA heart failure guideline; Stanford Medicine 25 cardiac exam resources", sourceUrls.heartFailureGuideline, "guideline"];
  if (/carotid|radial|femoral|dorsalis|posterior tibial|pulse|vascular|edema/.test(text)) return ["2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources", sourceUrls.heartFailureGuideline, "guideline"];
  if (/murphy/.test(text)) return ["Open review of abdominal eponyms; WSES acute calculous cholecystitis guideline", sourceUrls.murphyReview, "systematic_review"];
  if (/psoas/.test(text)) return ["AAFP appendicitis review citing clinical likelihood ratios; JAMA Rational Clinical Examination PubMed record", sourceUrls.appendicitisAafp, "rce_or_meta_analysis"];
  if (/obturator/.test(text)) return ["JAMA Rational Clinical Examination appendicitis PubMed record; open acute-abdomen review", sourceUrls.appendicitisPubMed, "rce_or_meta_analysis"];
  if (/cva/.test(text)) return ["PubMed study of CVA tenderness in suspected ureteral stone; NCBI acute pyelonephritis review", sourceUrls.cvaTendernessPubMed, "systematic_review"];
  if (/abdomen|abdominal|bowel|spleen|liver|rebound/.test(text)) return ["Open acute abdominal pain review and guideline-style public references", sourceUrls.acuteAbdomenAafp, "guideline"];
  if (/reflex|babinski/.test(text)) return ["Stanford Medicine 25 deep tendon reflex guide; Merck Manual reflex exam", sourceUrls.stanfordReflex, "teaching_reference"];
  if (/finger-to-nose|rapid alternating|heel-to-shin|romberg/.test(text)) return ["Stanford Medicine 25 cerebellar exam guide", sourceUrls.stanfordCerebellar, "teaching_reference"];
  if (/gait/.test(text)) return ["Stanford Medicine 25 gait abnormalities guide", sourceUrls.stanfordGait, "teaching_reference"];
  if (/visual|extraocular|pupill|facial|masseter|palate|tongue|cranial/.test(text)) return ["Merck Manual cranial nerve exam; Johns Hopkins neurological exam overview", sourceUrls.merckCranialNerves, "teaching_reference"];
  if (/strength|motor|sensation|light touch|sharp|vibration|proprioception/.test(text)) return ["Johns Hopkins neurological exam overview; Merck Manual weakness/neuro exam resources", sourceUrls.hopkinsNeuro, "teaching_reference"];
  return ["Stanford Medicine 25 exam guides", sourceUrls.stanfordGuides, "teaching_reference"];
}

function curateOverlay(row, overlay) {
  const text = normalizedText(`${row.maneuver_or_finding} ${row.include_when} ${row.section}`);
  const [source, url, tier] = sourceForCuratedRow(row);
  overlay.evidence_source_primary = source;
  overlay.source_url_or_pubmed = url;
  overlay.evidence_tier = tier;
  overlay.evidence_status = "public_lr_unavailable";
  overlay.last_reviewed = lastReviewed;
  overlay.evidence_summary = "Public source supports bedside technique or clinical use; no public row-specific LR found for this exact maneuver/target.";

  if (/jvp/.test(text)) {
    overlay.LR_plus = "2.47";
    overlay.LR_minus = "0.42";
    overlay.evidence_status = "curated";
    overlay.evidence_summary = "JVP elevation is management-relevant for venous congestion; public pulmonary-hypertension review reports LR+ 2.47 and LR- 0.42 for JVP elevation threshold.";
  } else if (/auscultate heart with diaphragm and bell/.test(text)) {
    overlay.LR_plus = "11";
    overlay.evidence_status = "curated";
    overlay.evidence_summary = "In dyspneic adults, S3 gallop substantially increases probability of heart failure in the public JAMA Rational Clinical Examination PubMed abstract.";
  } else if (/murphy/.test(text)) {
    overlay.LR_plus = "2.8";
    overlay.evidence_status = "curated";
    overlay.evidence_summary = "Positive Murphy sign modestly increases concern for acute cholecystitis; open review reports LR+ 2.8 with broad CI.";
  } else if (/psoas/.test(text)) {
    overlay.LR_plus = "2.38";
    overlay.evidence_status = "curated";
    overlay.evidence_summary = "Positive psoas sign modestly increases likelihood of appendicitis; public AAFP review reports LR+ 2.38.";
  } else if (/cva/.test(text)) {
    overlay.LR_plus = "1.3";
    overlay.LR_minus = "0.7";
    overlay.evidence_status = "curated";
    overlay.evidence_summary = "For suspected ureteral stone, PubMed abstract reports CVA tenderness sensitivity/specificity with LR+ 1.3 and LR- 0.7; interpret separately for pyelonephritis.";
  } else if (/heart rate|respiratory rate|blood pressure/.test(text)) {
    overlay.evidence_summary = "Vital-sign abnormalities are management-changing in sepsis, shock, dyspnea, and monitoring pathways; no diagnostic LR is assigned.";
  } else if (/neuro|visual|extraocular|pupill|facial|masseter|palate|tongue|pronator|strength|sensation|reflex|babinski|finger-to-nose|rapid alternating|heel-to-shin|gait|romberg/.test(text)) {
    overlay.evidence_summary = "Public neuro-exam references support this maneuver for localization and bedside safety decisions; no diagnostic LR is assigned.";
  }

  return overlay;
}

function shouldCurate(row) {
  if (row.exam_system === "Cardiopulmonary") return true;
  if (row.exam_system === "Abdomen") return true;
  return row.exam_system === "Neuro" && highYieldNeuroSourceItems.has(row.source_item);
}

const parsed = parseCsv(readFileSync(basePath, "utf8"));
const missingBaseColumns = baseColumns.filter((column) => !parsed.headers.includes(column));
if (missingBaseColumns.length) {
  throw new Error(`physical_exam_reference.csv missing expected columns: ${missingBaseColumns.join(", ")}`);
}

const examIds = buildExamIds(parsed.rows);
const rowsWithIds = parsed.rows.map((row, index) => ({ ...row, exam_id: examIds[index] }));
const baseHeadersWithId = parsed.headers.includes("exam_id") ? parsed.headers : [...parsed.headers, "exam_id"];
writeFileSync(basePath, stringifyCsv(baseHeadersWithId, rowsWithIds), "utf8");

const overlayRows = rowsWithIds.map((row) => {
  const overlay = baseOverlay(row);
  return shouldCurate(row) ? curateOverlay(row, overlay) : overlay;
});

const curatedCount = overlayRows.filter((row) => row.evidence_status !== "pending").length;
if (curatedCount !== 75) {
  throw new Error(`Expected exactly 75 evidence-populated rows, got ${curatedCount}`);
}

writeFileSync(overlayPath, stringifyCsv(overlayColumns, overlayRows), "utf8");

console.log(`Wrote ${rowsWithIds.length} base rows with exam_id and ${overlayRows.length} overlay rows (${curatedCount} evidence-populated).`);
