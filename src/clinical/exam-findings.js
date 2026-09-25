/**
 * Structured physical exam findings catalog.
 *
 * Each finding has a curated list of standard options drawn from established
 * medical references. Sources are cited per-system below. No textbook prose
 * is reproduced — only standard clinical terminology (finding names and
 * descriptive phrases) that appears consistently across these references.
 *
 * SOURCES:
 * - General, Skin, HEENT, Neck, Cardiac, Pulmonary, Abdomen: Bates' Guide to
 *   Physical Examination (12th ed.); DeGowin's Diagnostic Examination (11th ed.);
 *   University of Washington Foundations of Clinical Medicine guides.
 * - Neurological (mental status, cranial nerves, motor, sensory, reflexes,
 *   coordination): AAN Neurology Clerkship Core Curriculum; UpToDate "Detailed
 *   adult neurologic examination"; Bates' Ch. 24 (Nervous System).
 * - Visual field defects: standard neuro-ophthalmology terminology (confrontation
 *   field patterns — quadrantanopia, hemianopia, altitudinal defects) as
 *   documented in Bates', DeGowin, and the AAN core curriculum.
 * - Musculoskeletal: Bates' musculoskeletal chapters; DeGowin.
 *
 * Each finding: { id, system, label, normal, options[], source }
 * - `normal` is the default normal finding (also first in options).
 * - `options` are selectable; the UI also allows free-text override.
 */

export const EXAM_FINDING_SOURCES = Object.freeze({
  bates: "Bates' Guide to Physical Examination",
  degowin: "DeGowin's Diagnostic Examination",
  uw: "UW Foundations of Clinical Medicine",
  aan: "AAN Neurology Clerkship Core Curriculum",
  uptodate: "UpToDate: Detailed adult neurologic examination"
});

export const EXAM_FINDINGS = Object.freeze([
  // ─── GENERAL ──────────────────────────────────────────────────────────
  {
    id: "gen_appearance",
    system: "General",
    label: "Appearance",
    normal: "well-appearing, no acute distress",
    options: Object.freeze([
      "well-appearing, no acute distress",
      "well-appearing, in no distress",
      "alert and comfortable",
      "pleasant",
      "well-nourished",
      "disheveled",
      "cachectic",
      "ill-appearing",
      "toxic-appearing",
      "in mild distress",
      "in moderate distress",
      "in severe distress",
      "diaphoretic",
      "pale",
      "flushed"
    ]),
    source: "bates"
  },
  {
    id: "gen_consciousness",
    system: "General",
    label: "Level of consciousness",
    normal: "alert",
    options: Object.freeze([
      "alert",
      "alert and attentive",
      "drowsy but arousable to voice",
      "drowsy but arousable to tactile stimulation",
      "lethargic",
      "obtunded",
      "stuporous",
      "comatose"
    ]),
    source: "bates"
  },
  {
    id: "gen_orientation",
    system: "General",
    label: "Orientation",
    normal: "oriented to person, place, and time",
    options: Object.freeze([
      "oriented to person, place, and time",
      "oriented x3 (person, place, time)",
      "oriented x4 (person, place, time, situation)",
      "oriented to person and place only",
      "oriented to person only",
      "disoriented to time",
      "disoriented to place and time",
      "disoriented to person, place, and time"
    ]),
    source: "aan"
  },
  {
    id: "gen_build",
    system: "General",
    label: "Build / nutrition",
    normal: "normal build and nutrition",
    options: Object.freeze([
      "normal build and nutrition",
      "well-nourished",
      "obese",
      "overweight",
      "thin",
      "cachectic",
      "muscular build"
    ]),
    source: "bates"
  },
  {
    id: "gen_posture_gait",
    system: "General",
    label: "Posture / gait / motor activity",
    normal: "normal posture and gait, no abnormal movements",
    options: Object.freeze([
      "normal posture and gait, no abnormal movements",
      "normal posture, gait not tested",
      "antalgic gait",
      "shuffling gait",
      "ataxic gait",
      "hemiparetic gait",
      "restless / agitated",
      "psychomotor slowing",
      "tremor at rest",
      "postural tremor"
    ]),
    source: "bates"
  },

  // ─── SKIN ─────────────────────────────────────────────────────────────
  {
    id: "skin_color",
    system: "Skin",
    label: "Color",
    normal: "normal color, no pallor or jaundice",
    options: Object.freeze([
      "normal color, no pallor or jaundice",
      "pink, warm, and dry",
      "pale",
      "flushed",
      "cyanotic",
      "jaundiced",
      "mottled"
    ]),
    source: "bates"
  },
  {
    id: "skin_lesions",
    system: "Skin",
    label: "Lesions / rashes",
    normal: "no rashes or lesions",
    options: Object.freeze([
      "no rashes or lesions",
      "no suspicious lesions",
      "erythematous macular rash",
      "erythematous papular rash",
      "petechiae",
      "purpura",
      "ecchymoses",
      "excoriations",
      "pressure injury",
      "surgical incision, clean and dry, no erythema"
    ]),
    source: "bates"
  },
  {
    id: "skin_turgor",
    system: "Skin",
    label: "Turgor / moisture",
    normal: "normal turgor, dry",
    options: Object.freeze([
      "normal turgor, dry",
      "normal turgor",
      "decreased turgor",
      "tenting",
      "diaphoretic",
      "clammy"
    ]),
    source: "bates"
  },

  // ─── HEENT ────────────────────────────────────────────────────────────
  {
    id: "heent_head",
    system: "HEENT",
    label: "Head",
    normal: "normocephalic, atraumatic",
    options: Object.freeze([
      "normocephalic, atraumatic",
      "normocephalic, atraumatic, no tenderness",
      "tenderness to palpation",
      "laceration",
      "hematoma",
      "scalp lesion"
    ]),
    source: "bates"
  },
  {
    id: "heent_eyes_general",
    system: "HEENT",
    label: "Eyes (general)",
    normal: "PERRL, EOMI, no nystagmus",
    options: Object.freeze([
      "PERRL, EOMI, no nystagmus",
      "pupils equal, round, reactive to light",
      "pupils equal, round, reactive to light and accommodation",
      "anisocoria",
      "nystagmus present",
      "diplopia on lateral gaze",
      "ptosis",
      "scleral icterus",
      "conjunctival pallor",
      "conjunctival injection"
    ]),
    source: "bates"
  },
  {
    id: "heent_visual_fields",
    system: "HEENT",
    label: "Visual fields (confrontation)",
    normal: "visual fields intact to confrontation bilaterally",
    options: Object.freeze([
      "visual fields intact to confrontation bilaterally",
      "full visual fields by confrontation",
      "right superior quadrantanopia",
      "left superior quadrantanopia",
      "right inferior quadrantanopia",
      "left inferior quadrantanopia",
      "right homonymous hemianopia",
      "left homonymous hemianopia",
      "bitemporal hemianopia",
      "binasal hemianopia",
      "right altitudinal defect",
      "left altitudinal defect",
      "constricted visual fields bilaterally",
      "central scotoma, right eye",
      "central scotoma, left eye",
      "unable to assess (patient cooperation)"
    ]),
    source: "aan"
  },
  {
    id: "heent_ears",
    system: "HEENT",
    label: "Ears",
    normal: "normal external ears, no discharge",
    options: Object.freeze([
      "normal external ears, no discharge",
      "tympanic membranes intact bilaterally",
      "cerumen impaction",
      "otitis externa",
      "hemotympanum",
      "hearing intact to whisper bilaterally",
      "hearing decreased bilaterally"
    ]),
    source: "bates"
  },
  {
    id: "heent_nose",
    system: "HEENT",
    label: "Nose / sinuses",
    normal: "no nasal discharge, no sinus tenderness",
    options: Object.freeze([
      "no nasal discharge, no sinus tenderness",
      "nares patent bilaterally",
      "nasal congestion",
      "rhinorrhea",
      "epistaxis",
      "sinus tenderness to palpation",
      "nasal polyps"
    ]),
    source: "bates"
  },
  {
    id: "heent_throat",
    system: "HEENT",
    label: "Mouth / throat",
    normal: "oropharynx clear, moist mucous membranes",
    options: Object.freeze([
      "oropharynx clear, moist mucous membranes",
      "moist mucous membranes",
      "dry mucous membranes",
      "pharyngeal erythema",
      "tonsillar exudates",
      "dental caries",
      "oral lesions",
      "uvula midline, palate elevates symmetrically"
    ]),
    source: "bates"
  },

  // ─── NECK ─────────────────────────────────────────────────────────────
  {
    id: "neck_lymph",
    system: "Neck",
    label: "Lymph nodes",
    normal: "no cervical lymphadenopathy",
    options: Object.freeze([
      "no cervical lymphadenopathy",
      "no palpable lymphadenopathy",
      "cervical lymphadenopathy",
      "tender cervical lymphadenopathy",
      "supraclavicular lymphadenopathy",
      "axillary lymphadenopathy",
      "inguinal lymphadenopathy"
    ]),
    source: "bates"
  },
  {
    id: "neck_thyroid",
    system: "Neck",
    label: "Thyroid",
    normal: "thyroid not enlarged, no nodules",
    options: Object.freeze([
      "thyroid not enlarged, no nodules",
      "no thyromegaly",
      "thyromegaly",
      "thyroid nodule palpable",
      "thyroid tender to palpation"
    ]),
    source: "bates"
  },
  {
    id: "neck_jvd",
    system: "Neck",
    label: "JVD / venous pressure",
    normal: "no jugular venous distention",
    options: Object.freeze([
      "no jugular venous distention",
      "JVP not elevated",
      "jugular venous distention present",
      "JVP elevated",
      "positive hepatojugular reflux"
    ]),
    source: "bates"
  },
  {
    id: "neck_carotid",
    system: "Neck",
    label: "Carotids",
    normal: "carotids 2+ bilaterally, no bruits",
    options: Object.freeze([
      "carotids 2+ bilaterally, no bruits",
      "no carotid bruits",
      "carotid bruit, right",
      "carotid bruit, left",
      "carotid bruits bilaterally",
      "diminished carotid upstroke"
    ]),
    source: "bates"
  },
  {
    id: "neck_rom",
    system: "Neck",
    label: "Range of motion / meningismus",
    normal: "full ROM, no nuchal rigidity",
    options: Object.freeze([
      "full ROM, no nuchal rigidity",
      "supple neck",
      "nuchal rigidity",
      "limited ROM due to pain",
      "positive Kernig sign",
      "positive Brudzinski sign"
    ]),
    source: "bates"
  },

  // ─── CARDIAC ──────────────────────────────────────────────────────────
  {
    id: "card_rhythm",
    system: "Cardiac",
    label: "Rhythm / rate",
    normal: "regular rate and rhythm",
    options: Object.freeze([
      "regular rate and rhythm",
      "regular rhythm",
      "irregularly irregular rhythm",
      "regularly irregular rhythm",
      "tachycardic",
      "bradycardic"
    ]),
    source: "bates"
  },
  {
    id: "card_murmur",
    system: "Cardiac",
    label: "Murmurs / sounds",
    normal: "no murmurs, rubs, or gallops",
    options: Object.freeze([
      "no murmurs, rubs, or gallops",
      "normal S1 and S2, no murmurs",
      "systolic murmur",
      "diastolic murmur",
      "holosystolic murmur",
      "systolic ejection murmur",
      "S3 gallop",
      "S4 gallop",
      "pericardial friction rub",
      "murmur radiates to carotids",
      "murmur radiates to axilla"
    ]),
    source: "bates"
  },
  {
    id: "card_pulses",
    system: "Cardiac",
    label: "Peripheral pulses",
    normal: "2+ pulses throughout, no edema",
    options: Object.freeze([
      "2+ pulses throughout, no edema",
      "pulses 2+ and symmetric",
      "diminished pulses",
      "bounding pulses",
      "1+ pedal edema",
      "2+ pedal edema",
      "3+ pedal edema",
      "4+ pedal edema",
      "pretibial edema",
      "anasarca"
    ]),
    source: "bates"
  },
  {
    id: "card_pmi",
    system: "Cardiac",
    label: "PMI / palpation",
    normal: "PMI non-displaced, no thrill",
    options: Object.freeze([
      "PMI non-displaced, no thrill",
      "PMI at 5th intercostal space, midclavicular line",
      "PMI displaced laterally",
      "PMI diffuse / hyperdynamic",
      "thrill palpable",
      "right ventricular heave"
    ]),
    source: "bates"
  },

  // ─── PULMONARY ────────────────────────────────────────────────────────
  {
    id: "pulm_effort",
    system: "Pulmonary",
    label: "Respiratory effort",
    normal: "no respiratory distress, unlabored breathing",
    options: Object.freeze([
      "no respiratory distress, unlabored breathing",
      "unlabored breathing on room air",
      "tachypneic",
      "in respiratory distress",
      "accessory muscle use",
      "intercostal retractions",
      "pursed-lip breathing",
      "on supplemental oxygen"
    ]),
    source: "bates"
  },
  {
    id: "pulm_auscultation",
    system: "Pulmonary",
    label: "Lung sounds",
    normal: "clear to auscultation bilaterally",
    options: Object.freeze([
      "clear to auscultation bilaterally",
      "clear bilaterally, no wheezes or crackles",
      "crackles, bilateral bases",
      "crackles, right base",
      "crackles, left base",
      "wheezes bilaterally",
      "expiratory wheezes",
      "rhonchi",
      "diminished breath sounds, right base",
      "diminished breath sounds, left base",
      "absent breath sounds, right",
      "absent breath sounds, left",
      "bronchial breath sounds"
    ]),
    source: "bates"
  },
  {
    id: "pulm_percussion",
    system: "Pulmonary",
    label: "Percussion / tactile fremitus",
    normal: "resonant to percussion bilaterally",
    options: Object.freeze([
      "resonant to percussion bilaterally",
      "dull to percussion, right base",
      "dull to percussion, left base",
      "hyperresonant bilaterally",
      "tactile fremitus symmetric"
    ]),
    source: "bates"
  },

  // ─── ABDOMEN ──────────────────────────────────────────────────────────
  {
    id: "abd_inspection",
    system: "Abdomen",
    label: "Inspection",
    normal: "soft, non-distended, no visible lesions",
    options: Object.freeze([
      "soft, non-distended, no visible lesions",
      "flat, no striae",
      "distended",
      "tympanitic",
      "visible peristalsis",
      "caput medusae",
      "surgical scars",
      "striae"
    ]),
    source: "bates"
  },
  {
    id: "abd_bowel_sounds",
    system: "Abdomen",
    label: "Bowel sounds",
    normal: "normoactive bowel sounds",
    options: Object.freeze([
      "normoactive bowel sounds",
      "bowel sounds present in all quadrants",
      "hyperactive bowel sounds",
      "hypoactive bowel sounds",
      "absent bowel sounds",
      "high-pitched rushes"
    ]),
    source: "bates"
  },
  {
    id: "abd_palpation",
    system: "Abdomen",
    label: "Palpation",
    normal: "soft, non-tender, no organomegaly",
    options: Object.freeze([
      "soft, non-tender, no organomegaly",
      "non-tender to palpation",
      "tenderness, right upper quadrant",
      "tenderness, left upper quadrant",
      "tenderness, right lower quadrant",
      "tenderness, left lower quadrant",
      "tenderness, epigastric",
      "tenderness, suprapubic",
      "diffuse tenderness",
      "guarding",
      "rigidity",
      "rebound tenderness",
      "positive Murphy sign",
      "positive McBurney point tenderness",
      "positive Rovsing sign",
      "positive psoas sign",
      "positive obturator sign"
    ]),
    source: "bates"
  },
  {
    id: "abd_organs",
    system: "Abdomen",
    label: "Liver / spleen",
    normal: "no hepatosplenomegaly",
    options: Object.freeze([
      "no hepatosplenomegaly",
      "liver edge not palpable",
      "hepatomegaly",
      "splenomegaly",
      "liver tender to palpation",
      "positive fluid wave",
      "shifting dullness"
    ]),
    source: "bates"
  },

  // ─── NEUROLOGICAL ─────────────────────────────────────────────────────
  {
    id: "neuro_language",
    system: "Neurological",
    label: "Language",
    normal: "fluent, comprehension intact, no aphasia",
    options: Object.freeze([
      "fluent, comprehension intact, no aphasia",
      "fluent speech, intact comprehension and repetition",
      "non-fluent speech",
      "fluent but paraphasic speech",
      "impaired comprehension",
      "impaired repetition",
      "anomia (naming difficulty)"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn2_acuity",
    system: "Neurological",
    label: "CN II — Visual acuity",
    normal: "visual acuity intact bilaterally",
    options: Object.freeze([
      "visual acuity intact bilaterally",
      "20/20 bilaterally",
      "decreased acuity, right eye",
      "decreased acuity, left eye",
      "decreased acuity bilaterally",
      "count fingers only, right eye",
      "count fingers only, left eye"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn3_4_6",
    system: "Neurological",
    label: "CN III/IV/VI — Extraocular movements",
    normal: "EOMI, no nystagmus or diplopia",
    options: Object.freeze([
      "EOMI, no nystagmus or diplopia",
      "extraocular movements intact in all directions",
      "limited abduction, right eye",
      "limited abduction, left eye",
      "limited adduction, right eye",
      "limited adduction, left eye",
      "nystagmus on lateral gaze",
      "diplopia reported"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn5",
    system: "Neurological",
    label: "CN V — Trigeminal",
    normal: "facial sensation intact V1-V3 bilaterally",
    options: Object.freeze([
      "facial sensation intact V1-V3 bilaterally",
      "decreased sensation, V1 right",
      "decreased sensation, V2 right",
      "decreased sensation, V3 right",
      "decreased sensation, V1 left",
      "decreased sensation, V2 left",
      "decreased sensation, V3 left",
      "masseter strength intact bilaterally",
      "jaw deviation"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn7",
    system: "Neurological",
    label: "CN VII — Facial movement",
    normal: "facial movements symmetric, no droop",
    options: Object.freeze([
      "facial movements symmetric, no droop",
      "forehead sparing, lower facial droop right (central pattern)",
      "forehead sparing, lower facial droop left (central pattern)",
      "complete right facial droop including forehead (peripheral pattern)",
      "complete left facial droop including forehead (peripheral pattern)",
      "unable to close eye tightly, right",
      "unable to close eye tightly, left"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn8",
    system: "Neurological",
    label: "CN VIII — Hearing",
    normal: "hearing intact to whisper bilaterally",
    options: Object.freeze([
      "hearing intact to whisper bilaterally",
      "hearing intact to finger rub bilaterally",
      "decreased hearing, right ear",
      "decreased hearing, left ear",
      "Weber midline",
      "Weber lateralizes to right",
      "Weber lateralizes to left"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn9_10",
    system: "Neurological",
    label: "CN IX/X — Palate / gag",
    normal: "uvula midline, palate elevates symmetrically",
    options: Object.freeze([
      "uvula midline, palate elevates symmetrically",
      "uvula deviates to right",
      "uvula deviates to left",
      "decreased gag reflex",
      "dysphagia",
      "dysarthria"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn11",
    system: "Neurological",
    label: "CN XI — SCM / trapezius",
    normal: "5/5 SCM and trapezius bilaterally",
    options: Object.freeze([
      "5/5 SCM and trapezius bilaterally",
      "weakness, right SCM",
      "weakness, left SCM",
      "weakness, right trapezius",
      "weakness, left trapezius"
    ]),
    source: "aan"
  },
  {
    id: "neuro_cn12",
    system: "Neurological",
    label: "CN XII — Tongue",
    normal: "tongue midline, no atrophy or fasciculations",
    options: Object.freeze([
      "tongue midline, no atrophy or fasciculations",
      "tongue deviates to right",
      "tongue deviates to left",
      "tongue atrophy",
      "fasciculations present"
    ]),
    source: "aan"
  },
  {
    id: "neuro_motor_bulk",
    system: "Neurological",
    label: "Motor — Bulk / tone",
    normal: "normal bulk and tone, no fasciculations",
    options: Object.freeze([
      "normal bulk and tone, no fasciculations",
      "no pronator drift",
      "pronator drift, right arm",
      "pronator drift, left arm",
      "muscle atrophy",
      "fasciculations",
      "increased tone (spasticity), right",
      "increased tone (spasticity), left",
      "decreased tone (flaccidity)",
      "rigidity",
      "cogwheeling"
    ]),
    source: "aan"
  },
  {
    id: "neuro_motor_strength",
    system: "Neurological",
    label: "Motor — Strength",
    normal: "5/5 strength throughout",
    options: Object.freeze([
      "5/5 strength throughout",
      "5/5 bilateral upper and lower extremities",
      "4/5 right upper extremity",
      "4/5 left upper extremity",
      "4/5 right lower extremity",
      "4/5 left lower extremity",
      "3/5 right upper extremity",
      "3/5 left upper extremity",
      "hemiparesis, right",
      "hemiparesis, left",
      "paraparesis",
      "quadriparesis",
      "grip strength symmetric"
    ]),
    source: "aan"
  },
  {
    id: "neuro_sensory",
    system: "Neurological",
    label: "Sensory",
    normal: "intact to light touch throughout",
    options: Object.freeze([
      "intact to light touch throughout",
      "intact to light touch and pinprick",
      "decreased light touch, right upper extremity",
      "decreased light touch, left upper extremity",
      "decreased light touch, right lower extremity",
      "decreased light touch, left lower extremity",
      "stocking-glove distribution sensory loss",
      "dermatomal sensory loss",
      "decreased proprioception",
      "decreased vibration sense",
      "extinction to double simultaneous stimulation"
    ]),
    source: "aan"
  },
  {
    id: "neuro_reflexes",
    system: "Neurological",
    label: "Deep tendon reflexes",
    normal: "2+ DTRs throughout, downgoing plantars",
    options: Object.freeze([
      "2+ DTRs throughout, downgoing plantars",
      "2+ and symmetric throughout",
      "hyperreflexic (3+) throughout",
      "hyporeflexic (1+) throughout",
      "areflexic",
      "hyperreflexia, right upper extremity",
      "hyperreflexia, left upper extremity",
      "upgoing plantar (Babinski), right",
      "upgoing plantar (Babinski), left",
      "upgoing plantars bilaterally",
      "clonus present"
    ]),
    source: "aan"
  },
  {
    id: "neuro_coordination",
    system: "Neurological",
    label: "Coordination",
    normal: "finger-to-nose and heel-to-shin intact",
    options: Object.freeze([
      "finger-to-nose and heel-to-shin intact",
      "no dysmetria",
      "dysmetria, right upper extremity",
      "dysmetria, left upper extremity",
      "intention tremor",
      "dysdiadochokinesia",
      "ataxic heel-to-shin"
    ]),
    source: "aan"
  },
  {
    id: "neuro_gait",
    system: "Neurological",
    label: "Gait / stance",
    normal: "normal gait, steady stance",
    options: Object.freeze([
      "normal gait, steady stance",
      "steady gait, no assistance needed",
      "wide-based gait",
      "shuffling gait",
      "positive Romberg",
      "unable to tandem walk",
      "requires assistance to ambulate"
    ]),
    source: "aan"
  },

  // ─── MUSCULOSKELETAL ──────────────────────────────────────────────────
  {
    id: "msk_inspection",
    system: "Musculoskeletal",
    label: "Inspection / palpation",
    normal: "no deformities, no tenderness",
    options: Object.freeze([
      "no deformities, no tenderness",
      "no joint swelling or deformity",
      "joint swelling",
      "joint erythema",
      "joint tenderness",
      "crepitus",
      "muscle tenderness"
    ]),
    source: "bates"
  },
  {
    id: "msk_rom",
    system: "Musculoskeletal",
    label: "Range of motion",
    normal: "full ROM all joints",
    options: Object.freeze([
      "full ROM all joints",
      "full active ROM",
      "limited ROM due to pain",
      "limited ROM, right shoulder",
      "limited ROM, left shoulder",
      "limited ROM, right hip",
      "limited ROM, left hip",
      "limited ROM, right knee",
      "limited ROM, left knee"
    ]),
    source: "bates"
  },

  // ─── PSYCHIATRIC (brief) ──────────────────────────────────────────────
  {
    id: "psych_mood_affect",
    system: "Psychiatric",
    label: "Mood / affect",
    normal: "euthymic, affect full range",
    options: Object.freeze([
      "euthymic, affect full range",
      "euthymic",
      "depressed mood",
      "anxious mood",
      "irritable mood",
      "flat affect",
      "blunted affect",
      "labile affect"
    ]),
    source: "bates"
  },
  {
    id: "psych_thought",
    system: "Psychiatric",
    label: "Thought process / content",
    normal: "linear thought process, no SI/HI",
    options: Object.freeze([
      "linear thought process, no SI/HI",
      "no suicidal or homicidal ideation",
      "disorganized thought process",
      "tangential",
      "circumstantial",
      "auditory hallucinations",
      "visual hallucinations",
      "paranoid ideation",
      "suicidal ideation",
      "homicidal ideation"
    ]),
    source: "bates"
  }
]);

/**
 * Compile selected findings into concise prose for the note.
 * Groups by system, joins with "; ". Only includes findings with values.
 * Example: "General: well-appearing, no acute distress; alert; oriented x3."
 */
export function compileExamFindings(selections) {
  const bySystem = new Map();
  for (const finding of EXAM_FINDINGS) {
    const value = selections?.[finding.id];
    if (!value || !String(value).trim()) continue;
    if (!bySystem.has(finding.system)) bySystem.set(finding.system, []);
    bySystem.get(finding.system).push(`${finding.label}: ${String(value).trim()}`);
  }
  const parts = [];
  for (const [system, items] of bySystem) {
    parts.push(`${system}: ${items.join("; ")}.`);
  }
  return parts.join("\n");
}

/**
 * Get the display name for a source key.
 */
export function examFindingSourceName(key) {
  return EXAM_FINDING_SOURCES[key] || key;
}
