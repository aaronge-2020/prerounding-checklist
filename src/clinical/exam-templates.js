/**
 * Physical exam skeleton templates.
 *
 * Component lists are factual maneuver/component names compiled from standard
 * medical-education sources teaching the Bates' Guide to Physical Examination
 * and DeGowin's Diagnostic Examination frameworks (see research report
 * 2026-09-25: UW Foundations of Clinical Medicine, AAN Neurology Clerkship
 * Core Curriculum, UpToDate detailed neuro exam, Bates 12th ed. Ch. 11).
 * No textbook prose is reproduced — only standard component names.
 *
 * Each template is an array of [heading, maneuvers[]] pairs. The UI inserts
 * a compact skeleton; the student fills in findings for each maneuver.
 */

export const EXAM_TEMPLATES = Object.freeze({
  general: Object.freeze({
    id: "general",
    label: "General",
    sections: Object.freeze([
      ["General", Object.freeze([
        "Appearance (state of health, distress, age vs stated age, build/nutrition)",
        "Level of consciousness / alertness",
        "Posture, gait, motor activity",
        "Skin color, lesions",
        "Odor of breath/body"
      ])],
      ["Vitals", Object.freeze([
        "Temperature",
        "Heart rate / pulse",
        "Respiratory rate",
        "Blood pressure",
        "SpO2",
        "Pain rating"
      ])]
    ])
  }),

  neuro: Object.freeze({
    id: "neuro",
    label: "Neurological",
    sections: Object.freeze([
      ["Mental status", Object.freeze([
        "Level of alertness / attentiveness",
        "Orientation (person, place, time)",
        "Attention (digit span, spell WORLD fwd/bkwd, serial 7s)",
        "Memory (immediate, short-term, long-term)",
        "Language (fluency, comprehension, repetition, naming, reading, writing)"
      ])],
      ["Cranial nerves", Object.freeze([
        "I Olfactory: smell identification, one nostril occluded",
        "II Optic: visual acuity, confrontation fields, fundi",
        "II/III Pupils: direct + consensual light reflex, accommodation",
        "III/IV/VI EOM: six cardinal fields of gaze, nystagmus, diplopia",
        "V Trigeminal: facial sensation (V1/V2/V3), mastication strength, corneal reflex",
        "VII Facial: raise eyebrows, close eyes tight, smile, puff cheeks",
        "VIII Vestibulocochlear: hearing (whisper/finger rub)",
        "IX/X Palate: say 'ah,' uvula midline; gag reflex",
        "XI Spinal accessory: head rotation (SCM), shoulder shrug (trapezius)",
        "XII Hypoglossal: tongue protrusion midline, strength, rapid movements"
      ])],
      ["Motor", Object.freeze([
        "Bulk, fasciculations, involuntary movements; pronator drift",
        "Tone: resistance to passive movement",
        "Strength 0-5: shoulder abd; elbow flex/ext; wrist flex/ext; finger flex/ext/abd; grip",
        "Strength 0-5: hip flex/ext; knee flex/ext; ankle dorsiflex/plantarflex"
      ])],
      ["Sensory", Object.freeze([
        "Light touch",
        "Pinprick / temperature",
        "Vibration (tuning fork)",
        "Proprioception (joint position sense)"
      ])],
      ["Reflexes", Object.freeze([
        "DTRs 0-4: biceps (C5/6), brachioradialis (C6), triceps (C7), patellar (L4), Achilles (S1)",
        "Plantar response (Babinski): upgoing vs downgoing",
        "Clonus"
      ])],
      ["Coordination", Object.freeze([
        "Finger-to-nose",
        "Heel-to-shin",
        "Rapid alternating movements (diadochokinesia)",
        "Romberg test"
      ])],
      ["Gait", Object.freeze([
        "Casual gait (symmetry, arm swing, turning)",
        "Tandem gait",
        "Toe walk / heel walk"
      ])]
    ])
  }),

  heent: Object.freeze({
    id: "heent",
    label: "HEENT",
    sections: Object.freeze([
      ["Head", Object.freeze([
        "Inspect: size, shape, symmetry; hair/scalp",
        "Palpate: tenderness, deformities, masses"
      ])],
      ["Eyes", Object.freeze([
        "Visual acuity (Snellen)",
        "External: lids, conjunctiva, sclera, cornea",
        "Pupils: PERRLA (direct + consensual, accommodation)",
        "EOM: six cardinal fields of gaze",
        "Confrontation visual fields",
        "Fundi: disc, vessels, macula"
      ])],
      ["Ears", Object.freeze([
        "Inspect/palpate auricle, mastoid",
        "Otoscopy: canal, tympanic membrane",
        "Hearing: whispered voice; Weber/Rinne (512 Hz)"
      ])],
      ["Nose", Object.freeze([
        "Inspect external nose; test patency (each nostril)",
        "Mucosa, septum, turbinates",
        "Sinus tenderness (frontal, maxillary)"
      ])],
      ["Mouth/Throat", Object.freeze([
        "Lips, buccal mucosa, tongue, palate",
        "Dentition, gums",
        "Oropharynx: tonsils, pharynx",
        "TMJ: crepitus, tenderness, ROM"
      ])],
      ["Neck", Object.freeze([
        "Inspect: symmetry, masses, tracheal position",
        "Lymph nodes: pre/postauricular, occipital, tonsillar, submandibular, submental, cervical, supraclavicular",
        "Thyroid: size, consistency, nodules",
        "Carotids: palpate (one side at a time), auscultate for bruits"
      ])]
    ])
  }),

  cardiac: Object.freeze({
    id: "cardiac",
    label: "Cardiovascular",
    sections: Object.freeze([
      ["Inspection", Object.freeze([
        "General: distress, cyanosis, pallor",
        "Chest: scars, visible pulsations, PMI",
        "Neck veins: JVP (cm above sternal angle)"
      ])],
      ["Palpation", Object.freeze([
        "PMI: location (ICS/MCL), size, amplitude",
        "Heaves / lifts",
        "Thrills at valve areas",
        "Carotid pulse: rate, rhythm, volume, character (one side at a time)",
        "Peripheral pulses: radial, brachial, femoral, popliteal, PT, DP"
      ])],
      ["Auscultation", Object.freeze([
        "Aortic (R 2nd ICS), Pulmonic (L 2nd ICS), Tricuspid (LLSB), Mitral/apex (5th ICS MCL), Erb's (L 3rd ICS)",
        "S1, S2 (intensity, splitting)",
        "S3, S4, clicks, snaps",
        "Murmurs: timing, location, radiation, intensity, pitch, quality",
        "Pericardial friction rub",
        "Carotid bruits"
      ])],
      ["Extremities", Object.freeze([
        "Edema (pitting), temperature, capillary refill",
        "Clubbing, xanthomata"
      ])]
    ])
  }),

  pulmonary: Object.freeze({
    id: "pulmonary",
    label: "Pulmonary",
    sections: Object.freeze([
      ["Inspection", Object.freeze([
        "Respiratory rate, rhythm, depth; effort (accessory muscles)",
        "Chest shape/symmetry; AP diameter",
        "Expansion symmetry; retractions"
      ])],
      ["Palpation", Object.freeze([
        "Tracheal position",
        "Chest expansion / excursion",
        "Tactile fremitus ('99')"
      ])],
      ["Percussion", Object.freeze([
        "Systematic, side-to-side comparison",
        "Notes: resonance, hyperresonance, dullness, tympany"
      ])],
      ["Auscultation", Object.freeze([
        "Breath sounds: vesicular, bronchovesicular, bronchial",
        "Adventitious: crackles, wheezes, rhonchi, stridor, pleural rub",
        "Transmitted voice: bronchophony, egophony, whispered pectoriloquy (if indicated)"
      ])]
    ])
  }),

  abdominal: Object.freeze({
    id: "abdominal",
    label: "Abdominal",
    sections: Object.freeze([
      ["Inspection", Object.freeze([
        "Contour: flat/scaphoid/rounded/protuberant; symmetry",
        "Skin: scars, striae, dilated veins, Cullen/Grey Turner signs",
        "Umbilicus; visible peristalsis/pulsations; hernias"
      ])],
      ["Auscultation", Object.freeze([
        "Bowel sounds: present, frequency, character",
        "Bruits: aorta, renal, iliac/femoral"
      ])],
      ["Percussion", Object.freeze([
        "All quadrants: tympany vs dullness",
        "Liver span (R midclavicular line)",
        "Splenic percussion (Traube's space)"
      ])],
      ["Palpation", Object.freeze([
        "Light: tenderness, guarding, rigidity (all quadrants)",
        "Deep: masses (size, shape, consistency, mobility, tenderness)",
        "Liver edge; spleen tip; kidneys; aorta"
      ])],
      ["Special tests", Object.freeze([
        "Murphy's sign",
        "McBurney's point tenderness; Rovsing's, psoas, obturator signs",
        "Rebound tenderness",
        "Shifting dullness / fluid wave (if ascites suspected)",
        "CVA tenderness"
      ])]
    ])
  }),

  msk: Object.freeze({
    id: "msk",
    label: "Musculoskeletal",
    sections: Object.freeze([
      ["Gait/Spine screen", Object.freeze([
        "Gait: symmetry, smoothness, arm swing, turning; toe/heel walk",
        "Spine: inspect alignment; cervical ROM; lumbar flexion"
      ])],
      ["Inspection", Object.freeze([
        "Symmetry, posture, deformity, muscle bulk/atrophy",
        "Swelling/effusion, erythema, alignment"
      ])],
      ["Palpation", Object.freeze([
        "Bones, joints, muscles: heat, swelling, tenderness, crepitus, effusion"
      ])],
      ["Range of motion", Object.freeze([
        "Neck: flexion, extension, lateral flexion, rotation",
        "Shoulders: abduction, flexion, internal/external rotation",
        "Elbows: flexion, extension, pronation, supination",
        "Wrists/hands: flexion, extension, deviation; finger ROM, thumb opposition",
        "Hips: flexion, extension, abduction, internal/external rotation",
        "Knees: flexion, extension",
        "Ankles: dorsiflexion, plantar flexion, inversion, eversion"
      ])],
      ["Strength", Object.freeze([
        "MRC 0-5: handgrips; upper/lower extremities vs resistance"
      ])]
    ])
  }),

  gu: Object.freeze({
    id: "gu",
    label: "GU / Pelvic",
    sections: Object.freeze([
      ["Male GU", Object.freeze([
        "Inguinal/femoral lymph nodes, pulses",
        "Penis: shaft, glans, meatus (position, discharge)",
        "Scrotum/testes: size, shape, consistency, masses, tenderness; epididymis; cord",
        "Hernia: bulge with Valsalva/cough",
        "Prostate (DRE): size, shape, consistency, nodules, tenderness; stool occult blood"
      ])],
      ["Female pelvic", Object.freeze([
        "External: mons, labia, clitoris, meatus, introitus, perineum; lesions/discharge",
        "Speculum: cervix (color, position, discharge, lesions); vaginal walls",
        "Bimanual: cervix (position, mobility, tenderness); uterus (size, shape, position, consistency); adnexa/ovaries"
      ])]
    ])
  })
});

export const EXAM_TEMPLATE_IDS = Object.freeze(Object.keys(EXAM_TEMPLATES));

/**
 * Renders a template as compact skeleton text for the note.
 * Each section becomes "Heading: maneuver1; maneuver2; ..." with blank
 * space for the student to fill in findings.
 */
export function renderExamTemplate(templateId) {
  const template = EXAM_TEMPLATES[templateId];
  if (!template) return "";
  const lines = [`${template.label} exam:`];
  for (const [heading, maneuvers] of template.sections) {
    lines.push(`${heading}: ${maneuvers.join("; ")}.`);
  }
  return lines.join("\n");
}
