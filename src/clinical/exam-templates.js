/**
 * Smart physical-exam templates.
 *
 * Each system is prose with INLINE SMART VARIABLES. A variable renders as a
 * pill button inside the exam text; clicking it opens an inline dropdown
 * with multi-select checkboxes. Selections compile back into the sentence.
 *
 * Schema:
 *   template: [ "literal prose", { var, label, multi, options, normal }, ... ]
 *   - var:     stable variable id (unique within the system)
 *   - label:   short human label shown on the empty pill
 *   - multi:   true  -> checkboxes, multiple selections allowed
 *              false -> single-select (radio behavior), used for GCS parts
 *   - options: full phrase fragments, e.g. "tender", "4/5 throughout"
 *   - normal:  subset of options that are the "normal" defaults. Normal
 *              options are mutually exclusive with the rest: checking an
 *              abnormal finding unchecks the normals and vice versa, so the
 *              compiled sentence can never read "non-tender, tender".
 *
 * An unselected variable compiles to "___" so unfinished documentation is
 * visible rather than silently omitted.
 *
 * Grading scales embedded in the options follow standard clinical
 * conventions: MRC muscle strength 0-5, deep tendon reflexes 0-4+, pulses
 * 0-4+, pitting edema trace/1+-4+, murmurs grade I-VI, and the Glasgow Coma
 * Scale (Eye/Verbal/Motor components).
 *
 * Sourcing note: the phrasing follows standard physical-examination
 * documentation conventions (Bates'/DeGowin-style write-ups). This catalog
 * was authored as standard clinical phrasing — it is NOT a validated,
 * item-by-item extraction from a textbook, so spot-check wording against a
 * reference before relying on any specific phrase.
 */

export const SMART_EXAM_EMPTY = "___";

function v(varId, label, options, normal, multi = true) {
  return Object.freeze({
    var: varId,
    label,
    multi,
    options: Object.freeze([...options]),
    normal: Object.freeze([...(normal || [])]),
  });
}

const STRENGTH_ABNORMAL = Object.freeze([
  "4/5 throughout",
  "3/5 throughout",
  "2/5 throughout",
  "1/5 throughout",
  "0/5 (no contraction)",
  "4/5 proximal weakness",
  "3/5 proximal weakness",
  "4/5 distal weakness",
  "3/5 distal weakness",
  "drift present",
]);

function strengthVar(varId, label) {
  return v(varId, label, ["5/5 throughout", ...STRENGTH_ABNORMAL], ["5/5 throughout"]);
}

export const EXAM_SYSTEMS = Object.freeze([
  Object.freeze({
    id: "general",
    name: "General",
    template: Object.freeze([
      "General: ",
      v("appearance", "appearance",
        ["well-appearing", "no acute distress", "alert",
         "ill-appearing", "mild distress", "moderate distress", "severe distress",
         "lethargic", "anxious", "disheveled", "cachectic", "thin", "obese"],
        ["well-appearing", "no acute distress", "alert"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "skin",
    name: "Skin",
    template: Object.freeze([
      "Skin: ",
      v("inspection", "inspection",
        ["no rashes", "no lesions",
         "erythematous rash", "maculopapular rash", "vesicular rash",
         "ecchymosis", "petechiae", "purpura",
         "jaundiced", "pale", "flushed", "diaphoretic"],
        ["no rashes", "no lesions"]),
      ". Wounds/ulcers: ",
      v("wounds", "wounds",
        ["no open wounds", "no ulcers",
         "laceration", "abrasion", "ulcer",
         "surgical incision, clean and dry", "surgical incision with erythema",
         "pressure injury"],
        ["no open wounds", "no ulcers"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "heent",
    name: "HEENT",
    template: Object.freeze([
      "HEENT: Head ",
      v("head", "head",
        ["atraumatic", "normocephalic",
         "laceration", "hematoma", "deformity", "tenderness"],
        ["atraumatic", "normocephalic"]),
      ". Eyes ",
      v("eyes", "eyes",
        ["PERRL", "EOMI",
         "anisocoria", "nystagmus", "limited EOM", "diplopia",
         "periorbital edema", "ptosis", "exophthalmos"],
        ["PERRL", "EOMI"]),
      ". Sclerae ",
      v("sclerae", "sclerae",
        ["anicteric", "icteric", "injected"],
        ["anicteric"]),
      ". Conjunctivae ",
      v("conjunctivae", "conjunctivae",
        ["pink", "pale", "injected"],
        ["pink"]),
      ". Ears ",
      v("ears", "ears",
        ["canals clear", "TMs intact",
         "effusion", "discharge", "erythema", "cerumen impaction"],
        ["canals clear", "TMs intact"]),
      ". Nose ",
      v("nose", "nose",
        ["patent bilaterally",
         "congestion", "rhinorrhea", "epistaxis", "septal deviation"],
        ["patent bilaterally"]),
      ". Mouth and pharynx ",
      v("mouth", "mouth/pharynx",
        ["moist mucous membranes", "oropharynx clear",
         "dry mucous membranes", "erythema", "exudate",
         "tonsillar hypertrophy", "poor dentition", "oral lesions"],
        ["moist mucous membranes", "oropharynx clear"]),
      ". Palpation ",
      v("palpation", "palpation",
        ["non-tender", "no deformities", "no masses",
         "tender", "deformities", "masses", "crepitus", "sinus tenderness"],
        ["non-tender", "no deformities", "no masses"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "neck",
    name: "Neck",
    template: Object.freeze([
      "Neck: ",
      v("inspection", "inspection",
        ["supple", "no masses",
         "stiffness", "mass", "swelling", "scar"],
        ["supple", "no masses"]),
      ". ROM ",
      v("rom", "range of motion",
        ["full ROM", "limited ROM", "pain with ROM"],
        ["full ROM"]),
      ". Lymph nodes ",
      v("nodes", "lymph nodes",
        ["no lymphadenopathy",
         "tender LAD", "shotty LAD", "fixed LAD", "supraclavicular LAD"],
        ["no lymphadenopathy"]),
      ". Thyroid ",
      v("thyroid", "thyroid",
        ["non-palpable", "non-tender",
         "enlarged", "nodule", "tender"],
        ["non-palpable", "non-tender"]),
      ". Trachea ",
      v("trachea", "trachea",
        ["midline", "deviated"],
        ["midline"]),
      ". JVD ",
      v("jvd", "JVD",
        ["not elevated", "elevated"],
        ["not elevated"]),
      ". Carotids ",
      v("carotids", "carotids",
        ["2+ bilaterally", "no bruits",
         "1+ (diminished)", "bruit present", "absent"],
        ["2+ bilaterally", "no bruits"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "cardiac",
    name: "Cardiac",
    template: Object.freeze([
      "Cardiac: Inspection ",
      v("inspection", "inspection",
        ["no chest wall deformity",
         "pectus excavatum", "pectus carinatum", "scar"],
        ["no chest wall deformity"]),
      ". Palpation ",
      v("palpation", "palpation",
        ["PMI non-displaced", "no thrills", "no heaves",
         "PMI displaced", "thrill present", "heave present"],
        ["PMI non-displaced", "no thrills", "no heaves"]),
      ". Rhythm ",
      v("rhythm", "rhythm",
        ["regular rate and rhythm",
         "irregularly irregular", "regularly irregular",
         "tachycardic", "bradycardic"],
        ["regular rate and rhythm"]),
      ". Murmur ",
      v("murmur", "murmur",
        ["no murmurs",
         "systolic murmur, grade I/VI", "systolic murmur, grade II/VI",
         "systolic murmur, grade III/VI", "systolic murmur, grade IV/VI",
         "systolic murmur, grade V/VI", "systolic murmur, grade VI/VI",
         "diastolic murmur", "continuous murmur"],
        ["no murmurs"]),
      ". Extra sounds ",
      v("extra", "extra sounds",
        ["no rubs", "no gallops",
         "S3 gallop", "S4 gallop", "pericardial friction rub"],
        ["no rubs", "no gallops"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "pulmonary",
    name: "Pulmonary",
    template: Object.freeze([
      "Pulmonary: Inspection ",
      v("inspection", "inspection",
        ["no respiratory distress", "symmetric chest expansion",
         "respiratory distress", "accessory muscle use",
         "asymmetric expansion", "tachypneic"],
        ["no respiratory distress", "symmetric chest expansion"]),
      ". Palpation ",
      v("palpation", "palpation",
        ["symmetric expansion", "no tenderness",
         "decreased expansion", "increased tactile fremitus", "tenderness"],
        ["symmetric expansion", "no tenderness"]),
      ". Percussion ",
      v("percussion", "percussion",
        ["resonant throughout", "dullness", "hyperresonance"],
        ["resonant throughout"]),
      ". Auscultation ",
      v("auscultation", "auscultation",
        ["clear to auscultation bilaterally",
         "wheezes", "crackles", "rhonchi",
         "diminished breath sounds", "absent breath sounds",
         "prolonged expiratory phase", "stridor", "pleural friction rub"],
        ["clear to auscultation bilaterally"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "abdomen",
    name: "Abdomen",
    template: Object.freeze([
      "Abdomen: Inspection ",
      v("inspection", "inspection",
        ["flat", "soft",
         "distended", "scars", "striae", "caput medusae", "visible peristalsis"],
        ["flat", "soft"]),
      ". Bowel sounds ",
      v("bowel", "bowel sounds",
        ["normoactive bowel sounds",
         "hypoactive bowel sounds", "hyperactive bowel sounds", "absent bowel sounds"],
        ["normoactive bowel sounds"]),
      ". Palpation ",
      v("palpation", "palpation",
        ["non-tender", "no guarding", "no rebound",
         "tender", "guarding", "rebound tenderness", "rigidity", "voluntary guarding"],
        ["non-tender", "no guarding", "no rebound"]),
      ". Masses ",
      v("masses", "masses",
        ["no palpable masses", "palpable mass"],
        ["no palpable masses"]),
      ". Liver/spleen ",
      v("organs", "liver/spleen",
        ["no hepatosplenomegaly",
         "hepatomegaly", "splenomegaly", "palpable liver edge"],
        ["no hepatosplenomegaly"]),
      ". CVA tenderness ",
      v("cva", "CVA tenderness",
        ["no CVA tenderness", "CVA tenderness present"],
        ["no CVA tenderness"]),
      ". Hernias ",
      v("hernias", "hernias",
        ["no hernias", "inguinal hernia", "umbilical hernia", "incisional hernia"],
        ["no hernias"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "neuro",
    name: "Neurological",
    template: Object.freeze([
      "Neuro: Mental status ",
      v("mental", "mental status",
        ["alert", "oriented x3",
         "disoriented", "inattentive", "lethargic", "obtunded", "agitated"],
        ["alert", "oriented x3"]),
      ". Speech ",
      v("speech", "speech",
        ["fluent", "normal prosody",
         "non-fluent", "dysarthric", "paraphasic errors"],
        ["fluent", "normal prosody"]),
      ". CN II ",
      v("cn2", "CN II",
        ["visual fields full to confrontation", "fundi normal",
         "field cut", "hemianopia", "quadrantanopia", "papilledema"],
        ["visual fields full to confrontation", "fundi normal"]),
      ". CN III/IV/VI ",
      v("cn346", "CN III/IV/VI",
        ["EOMI", "no nystagmus",
         "nystagmus", "limited EOM", "diplopia"],
        ["EOMI", "no nystagmus"]),
      ". CN V ",
      v("cn5", "CN V",
        ["facial sensation intact to light touch",
         "decreased facial sensation", "jaw weakness"],
        ["facial sensation intact to light touch"]),
      ". CN VII ",
      v("cn7", "CN VII",
        ["face symmetric", "facial droop", "forehead sparing"],
        ["face symmetric"]),
      ". CN VIII ",
      v("cn8", "CN VIII",
        ["hearing intact to finger rub", "hearing loss"],
        ["hearing intact to finger rub"]),
      ". CN IX/X ",
      v("cn910", "CN IX/X",
        ["palate elevates symmetrically", "gag intact",
         "uvular deviation", "decreased gag", "dysphagia"],
        ["palate elevates symmetrically", "gag intact"]),
      ". CN XI ",
      v("cn11", "CN XI",
        ["shoulder shrug intact", "weak trapezius", "weak SCM"],
        ["shoulder shrug intact"]),
      ". CN XII ",
      v("cn12", "CN XII",
        ["tongue midline", "no fasciculations",
         "tongue deviation", "fasciculations"],
        ["tongue midline", "no fasciculations"]),
      ". Strength RUE ",
      strengthVar("motor_rue", "strength RUE"),
      ". Strength LUE ",
      strengthVar("motor_lue", "strength LUE"),
      ". Strength RLE ",
      strengthVar("motor_rle", "strength RLE"),
      ". Strength LLE ",
      strengthVar("motor_lle", "strength LLE"),
      ". Tone ",
      v("tone", "tone",
        ["normal tone",
         "spastic", "rigid", "flaccid", "cogwheeling", "paratonia"],
        ["normal tone"]),
      ". DTRs ",
      v("dtr", "DTRs",
        ["2+ throughout",
         "0 (absent) throughout", "1+ (diminished) throughout",
         "3+ (brisk) throughout", "4+ (clonus)"],
        ["2+ throughout"]),
      ". Plantars ",
      v("plantar", "plantars",
        ["downgoing bilaterally",
         "upgoing bilaterally (Babinski)", "mute"],
        ["downgoing bilaterally"]),
      ". Sensation ",
      v("sensation", "sensation",
        ["intact to light touch",
         "decreased", "absent",
         "stocking-glove distribution", "dermatomal loss"],
        ["intact to light touch"]),
      ". Coordination ",
      v("coordination", "coordination",
        ["finger-to-nose intact", "no dysmetria",
         "dysmetria", "intention tremor", "dysdiadochokinesia"],
        ["finger-to-nose intact", "no dysmetria"]),
      ". Gait ",
      v("gait", "gait",
        ["steady gait", "normal base",
         "unsteady", "wide-based", "shuffling",
         "requires assistance", "unable to ambulate", "positive Romberg"],
        ["steady gait", "normal base"]),
      ". GCS ",
      v("gcs_e", "GCS eye",
        ["E4 - spontaneous", "E3 - to voice", "E2 - to pressure", "E1 - none"],
        ["E4 - spontaneous"], false),
      " ",
      v("gcs_v", "GCS verbal",
        ["V5 - oriented", "V4 - confused", "V3 - inappropriate words",
         "V2 - incomprehensible sounds", "V1 - none", "V-T - intubated"],
        ["V5 - oriented"], false),
      " ",
      v("gcs_m", "GCS motor",
        ["M6 - obeys commands", "M5 - localizes pain", "M4 - withdraws",
         "M3 - flexion", "M2 - extension", "M1 - none"],
        ["M6 - obeys commands"], false),
      ".",
    ]),
  }),

  Object.freeze({
    id: "msk",
    name: "Musculoskeletal",
    template: Object.freeze([
      "MSK: Inspection ",
      v("inspection", "inspection",
        ["no deformities", "no swelling",
         "deformity", "swelling", "erythema", "ecchymosis"],
        ["no deformities", "no swelling"]),
      ". Palpation ",
      v("palpation", "palpation",
        ["non-tender", "tender"],
        ["non-tender"]),
      ". Range of motion ",
      v("rom", "range of motion",
        ["full ROM", "limited ROM", "crepitus", "instability"],
        ["full ROM"]),
      ". Pulses ",
      v("pulses", "pulses",
        ["2+ throughout",
         "0 (absent)", "1+ (diminished)", "3+ (bounding)"],
        ["2+ throughout"]),
      ". Edema ",
      v("edema", "edema",
        ["no edema",
         "trace pitting edema", "1+ pitting edema", "2+ pitting edema",
         "3+ pitting edema", "4+ pitting edema", "non-pitting edema"],
        ["no edema"]),
      ".",
    ]),
  }),

  Object.freeze({
    id: "psych",
    name: "Psychiatric",
    template: Object.freeze([
      "Psych: Behavior ",
      v("behavior", "behavior",
        ["cooperative", "appropriate eye contact", "normal psychomotor activity",
         "agitated", "withdrawn", "poor eye contact",
         "psychomotor retardation", "psychomotor agitation"],
        ["cooperative", "appropriate eye contact", "normal psychomotor activity"]),
      ". Mood and affect ",
      v("mood", "mood/affect",
        ["euthymic", "full range affect",
         "depressed mood", "anxious", "labile",
         "flat affect", "blunted affect", "elevated mood"],
        ["euthymic", "full range affect"]),
      ". Thought process ",
      v("thought_process", "thought process",
        ["linear", "goal-directed",
         "disorganized", "tangential", "circumstantial", "flight of ideas"],
        ["linear", "goal-directed"]),
      ". Thought content ",
      v("thought_content", "thought content",
        ["no SI", "no HI", "no psychosis",
         "suicidal ideation", "homicidal ideation",
         "auditory hallucinations", "visual hallucinations",
         "delusions", "paranoia"],
        ["no SI", "no HI", "no psychosis"]),
      ".",
    ]),
  }),
]);

export const EXAM_SYSTEM_IDS = Object.freeze(EXAM_SYSTEMS.map((s) => s.id));

export function getExamSystem(systemId) {
  return EXAM_SYSTEMS.find((s) => s.id === systemId) || null;
}

export function getExamVar(systemId, varId) {
  const system = getExamSystem(systemId);
  if (!system) return null;
  for (const seg of system.template) {
    if (seg && typeof seg === "object" && seg.var === varId) return seg;
  }
  return null;
}

/**
 * Validate/normalize persisted smart-exam state.
 * { systems: [ids...], selections: { [systemId]: { [varId]: [strings] } }, freeText: "" }
 * Unknown system/var ids are dropped; selections are trimmed non-empty strings.
 */
export function normalizeSmartExam(value) {
  const out = { systems: [], selections: {}, freeText: "", segments: {} };
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value.systems)) {
    for (const id of value.systems) {
      const sysId = String(id || "").trim();
      if (sysId && getExamSystem(sysId) && !out.systems.includes(sysId)) out.systems.push(sysId);
    }
    // Keep canonical system order.
    out.systems.sort((a, b) => EXAM_SYSTEM_IDS.indexOf(a) - EXAM_SYSTEM_IDS.indexOf(b));
  }
  const selections = value.selections;
  if (selections && typeof selections === "object") {
    for (const [sysId, vars] of Object.entries(selections)) {
      if (!getExamSystem(sysId) || !vars || typeof vars !== "object") continue;
      const cleanVars = {};
      for (const [varId, vals] of Object.entries(vars)) {
        if (!getExamVar(sysId, varId) || !Array.isArray(vals)) continue;
        const clean = [...new Set(vals.map((x) => String(x ?? "").trim()).filter(Boolean))];
        if (clean.length) cleanVars[varId] = clean;
      }
      if (Object.keys(cleanVars).length) out.selections[sysId] = cleanVars;
    }
  }
  out.freeText = String(value.freeText ?? "");
  // Per-system editable segments: the student's free text plus variable
  // placeholders, in document order. When absent or invalid the system
  // template is the starting point, so older saved exams keep working.
  const rawSegments = value.segments;
  for (const sysId of out.systems) {
    const system = getExamSystem(sysId);
    const raw = rawSegments && typeof rawSegments === "object" ? rawSegments[sysId] : null;
    out.segments[sysId] = cleanSegments(raw, system) || templateToSegments(system);
  }
  return out;
}

/**
 * Convert a system template into editable segments: literal prose becomes
 * { t: "text" } and each smart variable becomes { t: "var" }.
 */
export function templateToSegments(system) {
  if (!system) return [];
  const segments = [];
  for (const seg of system.template || []) {
    if (typeof seg === "string") {
      if (seg) segments.push({ t: "text", s: seg });
    } else if (seg && seg.var) {
      segments.push({ t: "var", var: seg.var });
    }
  }
  return segments;
}

function cleanSegments(raw, system) {
  if (!Array.isArray(raw) || !raw.length || !system) return null;
  const out = [];
  for (const seg of raw) {
    if (!seg || typeof seg !== "object") continue;
    if (seg.t === "text") {
      const s = String(seg.s ?? "");
      if (!s) continue;
      const last = out[out.length - 1];
      if (last && last.t === "text") last.s += s;
      else out.push({ t: "text", s });
    } else if (seg.t === "var" && typeof seg.var === "string" && getExamVar(system.id, seg.var)) {
      if (!out.some((x) => x.t === "var" && x.var === seg.var)) out.push({ t: "var", var: seg.var });
    }
  }
  return out.length ? out : null;
}

/**
 * Compile smart-exam state into note prose. Each inserted system becomes one
 * paragraph; unselected variables render as "___" so unfinished documentation
 * stays visible instead of silently vanishing. Free-text notes are appended
 * as their own paragraph.
 */
export function compileSmartExam(smartExam) {
  const state = normalizeSmartExam(smartExam);
  const lines = [];
  for (const sysId of state.systems) {
    const system = getExamSystem(sysId);
    if (!system) continue;
    const sel = state.selections[sysId] || {};
    const segments = state.segments[sysId] || templateToSegments(system);
    let prose = "";
    for (const seg of segments) {
      if (seg.t === "text") {
        prose += seg.s;
      } else {
        const vals = (sel[seg.var] || []).filter(Boolean);
        prose += vals.length ? vals.join(", ") : SMART_EXAM_EMPTY;
      }
    }
    lines.push(prose.trim());
  }
  const free = state.freeText.trim();
  if (free) lines.push(free);
  return lines.join("\n");
}
