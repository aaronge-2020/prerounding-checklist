// Synthetic, PHI-free evaluation fixtures for comparing the deterministic
// primary-team-note parser against the browser-local LLM section splitter.
//
// Each fixture is built from labeled blocks; `text` is rendered from the
// blocks so every ground-truth sentence is an exact substring of the note.
// Labels are the shared field ids used by both parsers.

function blocksToFixture(id, noteType, description, blocks) {
  const sentences = [];
  const text = blocks
    .map((block) => {
      const lines = [];
      if (block.heading) lines.push(block.heading);
      for (const sentence of block.sentences) {
        lines.push(sentence.text);
        sentences.push(sentence);
      }
      return lines.join("\n");
    })
    .join("\n\n");
  return { id, noteType, description, text, sentences };
}

export const LOCAL_LLM_EVAL_FIXTURES = [
  // ------------------------------------------------------------------ H&P 1
  blocksToFixture("hp-standard", "hp", "H&P with classic headings", [
    {
      heading: "Chief Complaint:",
      sentences: [
        { text: "Shortness of breath for 3 days.", label: "chief_complaint" }
      ]
    },
    {
      heading: "HPI:",
      sentences: [
        { text: "Ms. Alvarez is a 68-year-old woman with heart failure who presents with worsening dyspnea on exertion over 3 days.", label: "history_of_present_illness" },
        { text: "She reports orthopnea and paroxysmal nocturnal dyspnea.", label: "history_of_present_illness" },
        { text: "She denies chest pain or fever.", label: "history_of_present_illness" }
      ]
    },
    {
      heading: "PMH:",
      sentences: [
        { text: "Heart failure with reduced EF, hypertension, type 2 diabetes.", label: "past_medical_history" }
      ]
    },
    {
      heading: "Meds:",
      sentences: [
        { text: "Furosemide 40mg daily.", label: "medications" },
        { text: "Metoprolol 50mg twice daily.", label: "medications" }
      ]
    },
    {
      heading: "Allergies:",
      sentences: [{ text: "Penicillin (rash).", label: "allergies" }]
    },
    {
      heading: "Social history:",
      sentences: [{ text: "Former smoker, quit 2015. Lives alone.", label: "social_history" }]
    },
    {
      heading: "ROS:",
      sentences: [{ text: "Denies cough, wheeze, or leg swelling.", label: "review_of_systems" }]
    },
    {
      heading: "Exam:",
      sentences: [
        { text: "BP 142/88, HR 96, RR 22, O2 sat 93% on room air.", label: "physical_exam" },
        { text: "Lungs with bibasilar crackles.", label: "physical_exam" },
        { text: "1+ pedal edema bilaterally.", label: "physical_exam" }
      ]
    },
    {
      heading: "Labs:",
      sentences: [{ text: "BNP 1800, creatinine 1.3, potassium 4.1.", label: "objective" }]
    },
    {
      heading: "Assessment:",
      sentences: [{ text: "Acute decompensated heart failure.", label: "assessment" }]
    },
    {
      heading: "Plan:",
      sentences: [
        { text: "Admit to telemetry.", label: "plan" },
        { text: "IV furosemide 40mg twice daily.", label: "plan" },
        { text: "Cardiology consult.", label: "plan" }
      ]
    }
  ]),

  // ------------------------------------------------------------------ H&P 2
  blocksToFixture("hp-nonstandard", "hp", "H&P with nonstandard headings and mixed prose", [
    {
      heading: "Why they came:",
      sentences: [
        { text: "Mr. Chen, 54, came in because his left leg has been swollen and painful for two days.", label: "history_of_present_illness" },
        { text: "The pain started suddenly after a long car ride.", label: "history_of_present_illness" },
        { text: "He has no chest pain and no shortness of breath.", label: "history_of_present_illness" }
      ]
    },
    {
      heading: "Background:",
      sentences: [
        { text: "History of DVT five years ago.", label: "past_medical_history" },
        { text: "Takes apixaban 5mg twice daily but admits missing doses this week.", label: "medications" },
        { text: "No known drug allergies.", label: "allergies" },
        { text: "Works as a truck driver, sits most of the day.", label: "social_history" }
      ]
    },
    {
      heading: "What I found:",
      sentences: [
        { text: "Left calf 4cm larger than right, tender to palpation.", label: "physical_exam" },
        { text: "No chest wall tenderness.", label: "physical_exam" },
        { text: "D-dimer 2.4, otherwise labs unremarkable.", label: "objective" },
        { text: "Duplex ultrasound shows left femoral DVT.", label: "objective" }
      ]
    },
    {
      heading: "Impression and next steps:",
      sentences: [
        { text: "Acute left lower extremity DVT, likely provoked by missed anticoagulation.", label: "assessment" },
        { text: "Restart therapeutic apixaban and arrange hematology follow-up.", label: "plan" },
        { text: "Counsel on adherence and warning signs of PE.", label: "plan" }
      ]
    }
  ]),

  // ------------------------------------------------------------------ H&P 3
  blocksToFixture("hp-prose", "hp", "H&P as a single prose paragraph with no headings", [
    {
      heading: null,
      sentences: [
        { text: "Ms. Okafor is a 32-year-old woman at 28 weeks gestation presenting for routine prenatal care with complaints of headache for one day.", label: "history_of_present_illness" },
        { text: "The headache is frontal, rated 6/10, and did not improve with acetaminophen.", label: "history_of_present_illness" },
        { text: "She denies visual changes, right upper quadrant pain, or decreased fetal movement.", label: "history_of_present_illness" },
        { text: "Her history is notable for chronic hypertension.", label: "past_medical_history" },
        { text: "She takes labetalol 200mg twice daily and a prenatal vitamin.", label: "medications" },
        { text: "On exam her blood pressure is 158/102, heart rate 88, and she has 1+ proteinuria on dipstick.", label: "physical_exam" },
        { text: "Fetal heart tones are 140s and reactive.", label: "physical_exam" },
        { text: "Labs are pending.", label: "objective" },
        { text: "This is concerning for preeclampsia with severe features.", label: "assessment" },
        { text: "She will be sent to labor and delivery triage for evaluation and magnesium seizure prophylaxis per protocol.", label: "plan" }
      ]
    }
  ]),

  // ------------------------------------------------------------- progress 1
  blocksToFixture("progress-standard", "progress", "Progress note with classic SOAP headings", [
    {
      heading: "One-liner:",
      sentences: [
        { text: "68F with HFrEF admitted for ADHF, hospital day 3.", label: "one_liner" }
      ]
    },
    {
      heading: "Interval events:",
      sentences: [
        { text: "No acute overnight events.", label: "interval_events" },
        { text: "Reports improved breathing after yesterday's diuresis.", label: "interval_events" }
      ]
    },
    {
      heading: "Exam:",
      sentences: [
        { text: "BP 128/76, HR 82, O2 sat 96% on 2L.", label: "physical_exam" },
        { text: "Lungs clear except faint basilar crackles.", label: "physical_exam" },
        { text: "Trace pedal edema.", label: "physical_exam" }
      ]
    },
    {
      heading: "Labs:",
      sentences: [
        { text: "Creatinine 1.1 (down from 1.3), potassium 4.0.", label: "objective" },
        { text: "Net negative 1.2L in 24 hours.", label: "objective" }
      ]
    },
    {
      heading: "Assessment:",
      sentences: [{ text: "ADHF, improving on diuresis.", label: "assessment" }]
    },
    {
      heading: "Plan:",
      sentences: [
        { text: "Continue furosemide 40mg IV twice daily.", label: "plan" },
        { text: "Advance diet as tolerated.", label: "plan" },
        { text: "VTE prophylaxis: heparin 5000 units TID.", label: "vte_prophylaxis" }
      ]
    }
  ]),

  // ------------------------------------------------------------- progress 2
  blocksToFixture("progress-nonstandard", "progress", "Progress note with fragmented, nonstandard formatting", [
    {
      heading: "overnight —",
      sentences: [
        { text: "pt spiked to 101.8F around 2am, blood cultures drawn x2", label: "interval_events" },
        { text: "given vancomycin per sepsis protocol", label: "interval_events" },
        { text: "morning: afebrile, says nausea is better", label: "patient_report" }
      ]
    },
    {
      heading: "numbers:",
      sentences: [
        { text: "WBC 14.2 (was 11.0), lactate 2.1", label: "objective" },
        { text: "still on norepi at 6 mcg/min, MAPs >65", label: "medications" }
      ]
    },
    {
      heading: "exam quick:",
      sentences: [
        { text: "alert, uncomfortable; abdomen tender LLQ", label: "physical_exam" },
        { text: "foley draining clear yellow urine", label: "lda" }
      ]
    },
    {
      heading: "thinking:",
      sentences: [
        { text: "septic picture, likely intra-abdominal source", label: "assessment" },
        { text: "CT abdomen/pelvis today, surgery consulted", label: "plan" },
        { text: "keep NPO for now", label: "fen" }
      ]
    }
  ]),

  // ------------------------------------------------------------- progress 3
  blocksToFixture("progress-prose", "progress", "Progress note as prose with no headings", [
    {
      heading: null,
      sentences: [
        { text: "Mr. Davis is a 71-year-old man with COPD on hospital day 2 for exacerbation.", label: "one_liner" },
        { text: "Overnight he remained stable with no desaturations on 2 liters.", label: "interval_events" },
        { text: "This morning he reports his breathing is somewhat better but he still cannot walk to the bathroom without stopping.", label: "patient_report" },
        { text: "He continues on albuterol nebulizers every 4 hours and prednisone 40mg daily.", label: "medications" },
        { text: "On exam he is speaking in short phrases with diffuse wheezes.", label: "physical_exam" },
        { text: "His white count is normal and chest x-ray shows no new infiltrate.", label: "objective" },
        { text: "Overall this is a COPD exacerbation that is slowly improving.", label: "assessment" },
        { text: "We will continue steroids and bronchodilators, start pulmonary rehab referral, and plan discharge in 1 to 2 days if he keeps improving.", label: "plan" }
      ]
    }
  ])
];

// Sanity: every ground-truth sentence is an exact substring of its note text.
for (const fixture of LOCAL_LLM_EVAL_FIXTURES) {
  for (const sentence of fixture.sentences) {
    if (!fixture.text.includes(sentence.text)) {
      throw new Error(`Fixture ${fixture.id}: sentence not found in text: ${sentence.text}`);
    }
  }
}
