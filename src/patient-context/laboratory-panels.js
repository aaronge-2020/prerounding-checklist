function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedLaboratoryName(value) {
  return clean(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9%]+/g, " ").trim();
}

export function laboratoryAnalyteKey(value) {
  const normalized = normalizedLaboratoryName(value);
  const aliases = {
    "white blood cell count": "wbc",
    hgb: "hemoglobin",
    hct: "hematocrit",
    "hematocrit hct": "hematocrit",
    "platelet count": "platelets",
    platelet: "platelets",
    "red blood cell count": "rbc",
    "blood urea nitrogen": "bun",
    "carbon dioxide": "co2 total",
    bicarbonate: "co2 total"
  };
  return aliases[normalized] || normalized;
}

export function laboratoryPanelFamily(name) {
  const normalized = normalizedLaboratoryName(name);
  if (/^(?:wbc|white blood cell count|hemoglobin|hgb|hematocrit|hct|platelets?|platelet count|rbc|red blood cell count|mcv|mch|mchc|rdw|mpv|nucleated rbc|nrbc)(?:\b|%)/.test(normalized)) return "cbc";
  if (/^(?:neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?|immature granulocytes?|absolute neutrophil count|anc)(?:\b|%)/.test(normalized)) return "cbc_differential";
  if (/^(?:sodium|potassium|chloride|co2 total|carbon dioxide|bicarbonate|anion gap|bun|blood urea nitrogen|creatinine|egfr|glucose(?: bld)?|calcium)$/.test(normalized)) return "metabolic";
  if (/^(?:albumin|total protein|protein total|ast|aspartate aminotransferase|alt|alanine aminotransferase|alkaline phosphatase|alk phos|bilirubin(?: total| direct| indirect)?|ggt)$/.test(normalized)) return "hepatic";
  if (/^(?:pt|prothrombin time|inr|ptt|aptt|partial thromboplastin time|fibrinogen|d dimer)$/.test(normalized)) return "coagulation";
  if (/^(?:ph|pco2|po2|hco3|base excess|lactate|oxygen saturation|o2 saturation)(?:\b|$)/.test(normalized)) return "blood_gas";
  if (/^(?:crossmatch|transfuse|type and screen|abo|rh|antibody screen)/.test(normalized)) return "blood_bank";
  if (/^osmolality(?:\b|$)/.test(normalized)) return "osmolality";
  return "other";
}

export function splitLaboratoryRowsByPanel(rows = []) {
  const families = rows.map((row) => laboratoryPanelFamily(row.name));
  const hasMetabolic = families.includes("metabolic");
  const hasHepatic = families.includes("hepatic");
  const hasDifferential = families.includes("cbc_differential");
  const buckets = new Map();
  rows.forEach((row, index) => {
    let key = families[index];
    if ((key === "metabolic" || key === "hepatic") && hasMetabolic && hasHepatic) key = "comprehensive_metabolic";
    if (key === "cbc_differential") key = "cbc";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });
  const labels = {
    cbc: hasDifferential ? "CBC with differential" : "CBC",
    metabolic: "Basic metabolic panel",
    comprehensive_metabolic: "Comprehensive metabolic panel",
    hepatic: "Hepatic function panel",
    coagulation: "Coagulation panel",
    blood_gas: "Blood gas",
    blood_bank: "Blood bank",
    osmolality: "Osmolality",
    other: "Other laboratory results"
  };
  const order = ["cbc", "metabolic", "comprehensive_metabolic", "hepatic", "coagulation", "blood_gas", "blood_bank", "osmolality", "other"];
  return order.filter((key) => buckets.has(key)).map((key) => ({ key, label: labels[key], rows: buckets.get(key) }));
}

export function laboratoryPanelLabel(rows = []) {
  const panels = splitLaboratoryRowsByPanel(rows);
  return panels.length === 1 ? panels[0].label : "Laboratory results";
}
