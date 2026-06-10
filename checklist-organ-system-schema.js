export const organSystemSchemaVersion = "organ-system-checklist-v1";

export const organSystemOrder = [
  "cardiopulmonary",
  "endocrine_metabolic",
  "abdominal_gu",
  "systemic_infectious",
  "neurologic",
  "skin_lines",
  "heent",
  "musculoskeletal",
  "functional_safety"
];

export const organSystemSchema = {
  cardiopulmonary: {
    label: "CARDIOPULMONARY",
    shortLabel: "Cardio-pulm",
    patterns: [
      /\b(?:cardio|heart|cardiac|cad|angina|murmurs?|gallop|chest|pressure|pleuritic|breath|breathing|dyspnea|shortness of breath|sob|work of breathing|respiratory|lung|crackles?|wheez|cough|sputum|oxygen|hypoxia|room air|nasal cannula|orthopnea|pnd|palpitation|syncope|faint|near-faint|calf pain|clot|dvt|pe\b|hemoptysis|jvp|edema|pedal pulses?|radial pulses?|peripheral pulses?|distal extremity warmth|extremity warmth|perfusion|cyanosis)\b/i
    ]
  },
  endocrine_metabolic: {
    label: "ENDOCRINE / METABOLIC",
    shortLabel: "Endocrine",
    patterns: [
      /\b(?:diabetes|dka|hhs|glucose|glycemic|hypoglycemia|hyperglycemia|insulin|glucagon|ketone|polyuria|polydipsia|thirst|shaky|sweaty|sweating|tremor|weight loss|weight gain|steroid|adrenal|cortisol|thyroid|pituitary|calcium|sodium|electrolyte|dehydration|mucous membranes?|skin turgor|capillary refill|monofilament|foot screen|foot wound|foot skin|supplies)\b/i
    ]
  },
  abdominal_gu: {
    label: "ABDOMEN / GU",
    shortLabel: "Abdomen-GU",
    patterns: [
      /\b(?:abdomen|abdominal|belly|stomach|nausea|vomit|appetite|oral intake|keep down|fluids?|diarrhea|constipation|stool|bowel|gas|jaundice|tenderness|burning with urination|urinary|urination|urinating|dysuria|frequency|urgency|flank|kidney|renal|bladder|urine|pelvic|vaginal|scrotal|testicular|genital|pregnancy|menstrual|bowel sounds?)\b/i
    ]
  },
  systemic_infectious: {
    label: "SYSTEMIC / INFECTIOUS",
    shortLabel: "Infectious",
    patterns: [
      /\b(?:systemic|infection|infectious|sepsis|fever|febrile|temperature|chills?|rigors?|antipyretic|antibiotic|cultures?|sick contact|travel|bite exposure|immune suppression|immunosuppression|procedure or hospital stay|hospital stay)\b/i
    ]
  },
  neurologic: {
    label: "NEUROLOGIC",
    shortLabel: "Neuro",
    patterns: [
      /\b(?:neuro|confusion|confused|mental status|somnolent|sleepy|awake|seizure|headache|neck stiffness|head injury|stroke|face droop|speech|vision loss|double vision|weakness|numb|tingling|dizziness|lightheaded|vertigo|ataxia|gait|walking trouble|bladder trouble|bowel trouble|numb groin|focal|cranial|pupil|sensation)\b/i
    ]
  },
  skin_lines: {
    label: "SKIN / LINES",
    shortLabel: "Skin-lines",
    patterns: [
      /\b(?:skin|rash|wound|ulcer|sore|redness|erythema|swelling|drainage|line|tube|device|iv access|catheter|injection site|lipohypertrophy|cellulitis|contact lens|hives|urticaria|itching|pruritus|skin peeling|expanding redness|mole|hair loss)\b/i
    ]
  },
  heent: {
    label: "HEENT",
    shortLabel: "HEENT",
    patterns: [
      /\b(?:eye|ear|nose|throat|mouth|mucosal|swallowing|voice change|neck swelling|facial swelling|light sensitivity|vision change|eye pain|conjunctiva|sinus|nasal|pharyngitis|mouth sores?|swollen glands?)\b/i
    ]
  },
  musculoskeletal: {
    label: "MUSCULOSKELETAL",
    shortLabel: "MSK",
    patterns: [
      /\b(?:muscle|joint|arthralgia|myalgia|bone|back pain|neck pain|stiffness|hot swollen joint|morning stiffness|trauma|fall|fracture|movement|stairs|dressing|reaching|grip|exertion|cramps?)\b/i
    ]
  },
  functional_safety: {
    label: "FUNCTION / SAFETY",
    shortLabel: "Function",
    patterns: [
      /\b(?:main symptom|new symptom|main concern|important change|concern|discharge|home|follow-up|safety|safe|safely|function|baseline|bedbound|get out of bed|get up|walk|stand|activity|needs help|not tried|medicine access|medicines?|medications?|treatment|team to know|food|drinking|eating|oral intake|access|question for team|sick day|arranged)\b/i
    ]
  }
};
