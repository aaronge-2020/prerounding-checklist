// MDCalc-style supporting content for all 25 clinical calculators.
// Pure module: no DOM, no storage, no network.
//
// Each entry powers the Instructions / When to Use / Pearls-Pitfalls /
// Why Use accordions and the Next Steps / Evidence / Creator tabs in the
// Models tab. All text is original paraphrase grounded in the cited
// primary references — never copied verbatim from MDCalc.
// nextSteps keys match the interpret() band strings in each calculator
// definition exactly (plus a "default" fallback).

const BATCH1_GUIDES = {
  "bishop": {
    description:
      "Estimates the likelihood of successful vaginal delivery from five cervical exam findings, to guide decisions about induction of labor.",
    instructions:
      "Score each of the five components — dilation, effacement, station, position, and consistency — from the most recent cervical examination. The total ranges from 0 to 13, and the interpretation appears once all five are entered.",
    whenToUse: [
      "When considering induction of labor, to judge whether the cervix is favorable.",
      "When counseling a patient about the likely success of induction versus expectant management.",
      "To decide whether cervical ripening is needed before oxytocin induction."
    ],
    pearlsPitfalls: [
      "Scores of 8 or higher are associated with a favorable cervix and a higher chance of vaginal delivery; scores of 5 or lower suggest an unfavorable cervix where induction is often considered.",
      "The score is one input among many — parity, gestational age, estimated fetal weight, and maternal preference all shape the plan.",
      "Cervical exam findings are subjective; inter-examiner variation can shift the total by a point or two.",
      "A simplified score using only dilation, effacement, and station performs similarly in some studies."
    ],
    whyUse:
      "The Bishop score standardizes the cervical exam into a single number that predicts induction success, helping clinicians and patients choose between induction, cervical ripening, and waiting.",
    nextSteps: {
      "favorable":
        "A favorable cervix: induction (for example with oxytocin, with or without amniotomy) has a good chance of leading to vaginal delivery. Proceed per local induction protocol and patient preference.",
      "unfavorable":
        "An unfavorable cervix: consider cervical ripening (mechanical methods or prostaglandins) before oxytocin induction, or discuss expectant management if induction is not urgent.",
      "intermediate":
        "Scores of 6-7 fall between the published thresholds. Weigh parity, indication urgency, and patient preference; cervical ripening is often reasonable in this range.",
      "default":
        "Use the score alongside the indication for delivery, maternal and fetal status, and patient preference to choose between induction, ripening, and expectant management."
    },
    evidence: [
      { label: "Bishop EH. Pelvic scoring for elective induction. Obstet Gynecol. 1964;24:266-8.", url: "https://pubmed.ncbi.nlm.nih.gov/14199536/" },
      { label: "Laughon SK et al. Using a simplified Bishop score to predict vaginal delivery. Obstet Gynecol. 2011;117:805-11.", url: "https://doi.org/10.1097/AOG.0b013e3182114ad2" },
      { label: "MDCalc: Bishop Score for Vaginal Delivery and Induction of Labor", url: "https://www.mdcalc.com/calc/3320/bishop-score-vaginal-delivery-induction-labor" }
    ],
    creator:
      "Developed by Dr. Edward H. Bishop and published in 1964 to score the pelvis for elective induction of labor."
  },

  "apgar": {
    description:
      "Standardized assessment of a newborn's condition at 1 and 5 minutes after birth, based on five clinical signs.",
    instructions:
      "Assign 0, 1, or 2 points for each of the five signs — activity, pulse, grimace, appearance, and respirations — at 1 and 5 minutes of life. Record the assessment time; it does not change the score.",
    whenToUse: [
      "At 1 and 5 minutes after every birth, as a standardized record of newborn condition.",
      "At 5-minute intervals thereafter (10, 15, 20 minutes) when the 5-minute score is below 7.",
      "To communicate the infant's status clearly between delivery-room team members."
    ],
    pearlsPitfalls: [
      "The five components are not equally important: heart rate and respiratory effort carry the most weight, while color is the least reliable.",
      "The 5-minute score predicts survival better than the 1-minute score.",
      "A low score at 5 minutes or later is a nonspecific marker of illness, not a diagnosis of asphyxia or a predictor of individual neurologic outcome.",
      "Scores are affected by prematurity, maternal medications, congenital anomalies, and resuscitation itself."
    ],
    whyUse:
      "The APGAR score gives every delivery team a common language for the newborn's condition and a consistent baseline for comparing outcomes across practices and over time.",
    nextSteps: {
      "reassuring":
        "Scores of 7-10 are typically normal. Continue routine newborn care and monitoring.",
      "moderately-abnormal":
        "Scores of 4-6 suggest the infant may need intervention such as drying, warming, stimulation, suctioning, or positive-pressure ventilation per NRP. If the score is 5 or less at 5 minutes, obtain an umbilical artery blood gas.",
      "low":
        "Scores of 0-3 indicate a depressed infant needing prompt resuscitation per NRP. Continue scoring at 5-minute intervals; a score of 0 at 10 minutes may inform discussions about continuing resuscitation given the poor prognosis.",
      "default":
        "Begin resuscitation based on the infant's condition before the 1-minute score is assigned — the score must never delay resuscitation. Follow NRP guidance for ongoing management."
    },
    evidence: [
      { label: "Apgar V. A proposal for a new method of evaluation of the newborn infant. Curr Res Anesth Analg. 1953;32:260-7.", url: "https://doi.org/10.1213/00000539-195301000-00041" },
      { label: "AAP Committee on Fetus and Newborn; ACOG Committee on Obstetric Practice. The Apgar Score. Pediatrics. 2015;136:819-22.", url: "https://doi.org/10.1542/peds.2015-2651" },
      { label: "MDCalc: APGAR Score", url: "https://www.mdcalc.com/calc/23/apgar-score" }
    ],
    creator:
      "Devised by Dr. Virginia Apgar, an anesthesiologist at Columbia University, and published in 1953 to standardize evaluation of the newborn infant."
  },

  "vbac-flamm": {
    description:
      "Predicts the likelihood of successful vaginal birth after cesarean (VBAC) using five factors known at hospital admission.",
    instructions:
      "Enter the five admission factors — maternal age, vaginal birth history, indication for the first cesarean, cervical effacement, and dilation. The score (0-10) maps to a predicted success rate.",
    whenToUse: [
      "On admission for delivery, when a patient with a prior cesarean is considering trial of labor.",
      "When counseling about VBAC versus repeat cesarean, to give an individualized success estimate.",
      "When a patient having second thoughts in early labor wants data to revisit the delivery plan."
    ],
    pearlsPitfalls: [
      "Predicted success rises with the score, from about 49% at scores 0-2 up to about 95% at scores 8-10.",
      "A low score does not predict failure — nearly half of patients scoring 0-2 still achieve vaginal birth.",
      "The model was derived from term patients attempting trial of labor; apply cautiously outside that population.",
      "Prior vaginal birth, especially after the cesarean, is the strongest favorable factor."
    ],
    whyUse:
      "The Flamm score translates admission findings into a concrete success probability, making VBAC counseling specific to the patient rather than based on population averages alone.",
    nextSteps: {
      "high":
        "Predicted success around 89-95%. For an eligible candidate who wants vaginal birth, proceeding with trial of labor is well supported; counsel on uterine rupture signs and monitoring as usual.",
      "moderate":
        "Predicted success around 67-77%. Trial of labor remains reasonable for most candidates; use the estimate in shared decision-making alongside the patient's values and risk tolerance.",
      "lower":
        "Predicted success around 49-60%. A low score does not predict failure — counsel that roughly half of similar patients still deliver vaginally, and weigh this against the risks of repeat cesarean in shared decision-making.",
      "default":
        "Use the predicted probability to inform — not dictate — the choice between trial of labor and repeat cesarean, together with contraindications, patient preference, and facility resources."
    },
    evidence: [
      { label: "Flamm BL, Geiger AM. Vaginal birth after cesarean delivery: an admission scoring system. Obstet Gynecol. 1997;90:907-10.", url: "https://doi.org/10.1016/S0029-7844(97)00531-0" },
      { label: "MDCalc: VBAC Risk Score for Successful Vaginal Delivery (Flamm Model)", url: "https://www.mdcalc.com/calc/3317/vbac-risk-score-successful-vaginal-delivery-flamm-model" }
    ],
    creator:
      "Developed by Dr. Bruce L. Flamm and published in 1997 from a study of over 5,000 trials of labor after cesarean."
  },

  "vbac-mfmu": {
    description:
      "Estimates the chance of successful vaginal birth after cesarean using a logistic regression model built from first-visit variables, without race or ethnicity.",
    instructions:
      "Enter age, pre-pregnancy weight, height, whether the prior cesarean was for an arrest disorder, obstetric history, and treated chronic hypertension. The model returns a predicted probability.",
    whenToUse: [
      "Early in pregnancy, when counseling a patient with a prior cesarean about trial of labor versus planned repeat cesarean.",
      "When an individualized risk estimate would help shared decision-making about delivery planning.",
      "As a complement to the admission-based Flamm score later in pregnancy."
    ],
    pearlsPitfalls: [
      "The 2021 revision removed race and ethnicity from the original 2007 model; discrimination is similar (AUC about 0.75).",
      "Prior VBAC is the strongest positive predictor in the model.",
      "The model applies to term gestations; it was not designed for preterm or anomalous pregnancies.",
      "A predicted probability is a population-derived estimate, not a guarantee for the individual."
    ],
    whyUse:
      "This model gives an early, individualized VBAC success estimate from routinely available prenatal variables, supporting informed delivery planning months before admission.",
    nextSteps: {
      "higher":
        "Predicted chance at or above 60%. For an otherwise eligible patient interested in vaginal birth, trial of labor is a reasonable plan; document counseling and revisit if conditions change.",
      "lower":
        "Predicted chance below 60%. Discuss what the number means, explore the patient's priorities, and weigh trial of labor against planned repeat cesarean — a lower probability still means many similar patients succeed.",
      "default":
        "Use the estimate as one input to shared decision-making about trial of labor after cesarean, alongside contraindications, prior uterine surgery details, and patient values."
    },
    evidence: [
      { label: "Grobman WA et al. Prediction of vaginal birth after cesarean delivery in term gestations: a calculator without race and ethnicity. Am J Obstet Gynecol. 2021;225:664.e1-7.", url: "https://doi.org/10.1016/j.ajog.2021.05.021" },
      { label: "Grobman WA et al. Development of a nomogram for prediction of vaginal birth after cesarean delivery. Obstet Gynecol. 2007;109:806-12.", url: "https://doi.org/10.1097/01.AOG.0000259312.36053.02" },
      { label: "MDCalc: Vaginal Birth After Cesarean (VBAC)", url: "https://www.mdcalc.com/calc/10433/vaginal-birth-after-cesarean-vbac" }
    ],
    creator:
      "Developed by Dr. William A. Grobman and the NICHD Maternal-Fetal Medicine Units Network; the race-free 2021 revision replaced the original 2007 model."
  },

  "due-dates": {
    description:
      "Calculates estimated due date, gestational age, and date of conception from the last menstrual period, a known gestational age, or a known due date.",
    instructions:
      "Choose which date you know — first day of the last menstrual period, gestational age as of today or another date, estimated conception date, or a known due date — then enter it. Adjust cycle length if it differs from 28 days.",
    whenToUse: [
      "To date a pregnancy and estimate the due date at the first prenatal visit.",
      "To compute gestational age on any given date for scheduling screening, ultrasounds, and interventions.",
      "To reconcile dating when the menstrual history and ultrasound disagree."
    ],
    pearlsPitfalls: [
      "First-trimester ultrasound (through 13 6/7 weeks) is the most accurate dating method and takes precedence over menstrual dating when they differ meaningfully.",
      "Naegele's rule assumes a 28-day cycle; longer or shorter cycles shift the due date, which this calculator adjusts for.",
      "Enter the first day of the last menstrual period, not the last day of bleeding.",
      "Gestational age is conventionally reported as completed weeks and days (for example, 39 2/7)."
    ],
    whyUse:
      "Accurate dating anchors nearly every obstetric decision — from aneuploidy screening windows to timing of delivery — and this calculator derives all key dates from whichever one is known.",
    nextSteps: {
      "default":
        "Use the estimated due date to schedule first-trimester dating ultrasound if not yet done, plan gestational-age-dependent screening, and document the dating method. If ultrasound dating differs from menstrual dating beyond ACOG thresholds, redating by the ultrasound is recommended."
    },
    evidence: [
      { label: "ACOG Committee Opinion No. 700: Methods for Estimating the Due Date. Obstet Gynecol. 2017;129:e150-4.", url: "https://doi.org/10.1097/AOG.0000000000002046" },
      { label: "MDCalc: Pregnancy Due Dates Calculator", url: "https://www.mdcalc.com/calc/423/pregnancy-due-dates-calculator" }
    ],
    creator:
      "Based on Naegele's rule, attributed to the German obstetrician Franz Naegele in the early 19th century, with cycle-length adjustment."
  }
};

const BATCH2_GUIDES = {
  ascvd: {
    description:
      "Estimates 10-year risk of hard ASCVD (myocardial infarction, stroke, or coronary/stroke death) in adults 40-75 without known ASCVD, using the 2013 ACC/AHA Pooled Cohort Equations, to guide statin decisions in primary prevention.",
    instructions:
      "Enter age (40-75 only), sex, race, total and HDL cholesterol, systolic blood pressure, whether the patient is treated for hypertension, diabetes status, and smoking status. The calculator selects the matching sex/race equation automatically.",
    whenToUse: [
      "Adults 40-75 without established ASCVD when deciding whether to start a statin for primary prevention.",
      "Annual or periodic prevention visits where an absolute 10-year risk number supports shared decision-making about lipid-lowering therapy.",
      "Reassessment every 4-6 years, or after major risk-factor changes such as smoking cessation or new diabetes."
    ],
    pearlsPitfalls: [
      "Do not use in patients with known ASCVD, LDL >=190 mg/dL, or age outside 40-75 — the equations were not derived for those groups.",
      "The equations were derived in non-Hispanic White and African American cohorts; for other races the guideline directs using the White equations, which this calculator does explicitly.",
      "As of 2026 the ACC/AHA dyslipidemia guidelines recommend the race-free PREVENT equations over this tool for primary prevention; PREVENT typically gives risk estimates 40-50% lower for the same profile.",
      "Smoking, systolic pressure, and diabetes dominate the estimate — a patient who quits smoking can drop an entire risk band, which is worth showing them the number."
    ],
    whyUse:
      "Statins prevent heart attacks and strokes, but only when the right patients take them. ASCVD risk converts a scattered risk-factor list into one number and a treatment threshold, so the statin conversation is about absolute benefit instead of vibes.",
    nextSteps: {
      low: "Low risk (<5%). Emphasize lifestyle modification and reassess risk factors every 4-6 years.",
      borderline:
        "Borderline risk (5% to <7.5%). Evaluate risk-enhancing factors (family history of premature ASCVD, LDL >=160, metabolic syndrome, CKD, chronic inflammatory disorders, high-risk ethnicity, triglycerides >=175) and consider statin therapy if present; coronary artery calcium scoring can refine the decision.",
      intermediate:
        "Intermediate risk (7.5% to <20%). After clinician-patient discussion, consider moderate-intensity statin therapy to reduce LDL-C by 30% or more.",
      high: "High risk (>=20%). Consider high-intensity statin therapy to reduce LDL-C by 50% or more, after clinician-patient discussion.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Match the statin decision to the risk band per current dyslipidemia guidance, discuss absolute benefit and patient preferences, and recheck lipids 4-12 weeks after starting or adjusting therapy."
    },
    evidence: [
      {
        label: "Goff DC Jr et al. Circulation 2014 — 2013 ACC/AHA Guideline on the Assessment of Cardiovascular Risk",
        url: "https://doi.org/10.1161/01.cir.0000437741.48606.98"
      },
      {
        label: "MDCalc — ASCVD 2013 Risk Calculator from AHA/ACC",
        url: "https://www.mdcalc.com/calc/3398/ascvd-atherosclerotic-cardiovascular-disease-2013-risk-calculator-aha-acc"
      }
    ],
    creator:
      "Developed by the 2013 ACC/AHA Risk Assessment Work Group (Goff, Lloyd-Jones, Bennett and colleagues) from pooled prospective cohort data."
  },
  chadsvasc: {
    description:
      "Estimates annual stroke risk in patients with non-valvular atrial fibrillation to guide decisions about oral anticoagulation.",
    instructions:
      "Answer each risk-factor question from the patient's history. The score sums automatically; per current guidance, female sex counts as a risk modifier rather than an automatic indication on its own.",
    whenToUse: [
      "Adults with newly diagnosed or established non-valvular atrial fibrillation or atrial flutter when deciding on stroke prophylaxis.",
      "Periodic reassessment of stroke risk, since risk factors accumulate with age and new comorbidities.",
      "Shared decision-making visits where an absolute annual stroke risk helps weigh the benefit of anticoagulation."
    ],
    pearlsPitfalls: [
      "Do not apply to valvular AF (moderate-to-severe mitral stenosis or a mechanical valve) — those patients need anticoagulation regardless of score.",
      "Female sex alone (score 1 in an otherwise healthy woman) does not warrant anticoagulation; treat it as a modifier, not an indication.",
      "Assess bleeding risk (e.g., HAS-BLED) in parallel — high stroke risk does not erase bleeding risk, but bleeding risk alone rarely negates the net benefit of anticoagulation.",
      "Some clinicians now use CHA2DS2-VA, which drops the sex criterion; confirm which version your local protocol expects."
    ],
    whyUse:
      "Stroke is the most feared complication of atrial fibrillation, and anticoagulation prevents most of it — but only when the right patients are treated. CHA2DS2-VASc is the guideline-endorsed tool that converts a list of risk factors into an actionable annual risk estimate.",
    nextSteps: {
      low: "Anticoagulation is not recommended (score 0 in men, 1 in women). Reassess stroke risk periodically as risk factors change.",
      moderate:
        "Consider anticoagulation based on patient preference and individual risk profile (score 1 in men, 2 in women). Discuss bleeding risk explicitly and use shared decision-making.",
      high: "Start oral anticoagulation, preferably a direct oral anticoagulant unless contraindicated (score \u22652 in men, \u22653 in women). Assess bleeding risk and address reversible bleeding risk factors.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Base anticoagulation decisions on the score band per current AF guidelines, reassess bleeding risk with a validated tool, and revisit the decision as risk factors evolve."
    },
    evidence: [
      {
        label: "Lip GYH et al. Chest 2010 — derivation of CHA2DS2-VASc",
        url: "https://doi.org/10.1378/chest.10-0039"
      },
      {
        label: "Friberg L et al. Eur Heart J 2012 — Swedish AF cohort validation",
        url: "https://doi.org/10.1093/eurheartj/ehr488"
      },
      {
        label: "MDCalc — CHA2DS2-VASc calculator",
        url: "https://www.mdcalc.com/calc/801/cha2ds2-vasc-score-atrial-fibrillation-stroke-risk"
      }
    ],
    creator:
      "Developed by Gregory Lip and colleagues and published in 2010, refining the older CHADS2 scheme by adding vascular disease, age 65\u201374, and female sex as risk modifiers."
  },
  hasbled: {
    description:
      "Estimates 1-year risk of major bleeding in patients with atrial fibrillation on anticoagulation, to inform the risk-benefit discussion — not to deny anticoagulation outright.",
    instructions:
      "Answer each of the nine questions from history, vitals, and labs. Uncontrolled hypertension means systolic above 160 mmHg; labile INR means time in therapeutic range below 60%.",
    whenToUse: [
      "Before starting or continuing oral anticoagulation for atrial fibrillation, alongside CHA2DS2-VASc.",
      "When bleeding risk needs quantification for shared decision-making or documentation.",
      "To identify reversible bleeding risk factors — uncontrolled blood pressure, NSAIDs, alcohol — that can be addressed before or during therapy."
    ],
    pearlsPitfalls: [
      "A high HAS-BLED score is a flag to fix reversible risks and monitor closely, not an automatic reason to withhold anticoagulation, since stroke risk usually dominates the trade-off.",
      "The labile-INR point applies to warfarin users; it is generally not scored for patients on direct oral anticoagulants.",
      "Scores above 5 were too rare in derivation to quantify precisely; treat them as very high risk.",
      "Reassess periodically — renal function, medications, and alcohol use change over time."
    ],
    whyUse:
      "Every anticoagulation decision trades stroke prevention against bleeding. HAS-BLED puts a number on the bleeding side of that trade and, more usefully, highlights which risk factors are modifiable.",
    nextSteps: {
      low: "Bleeding risk is low (about 1 per 100 patient-years). Anticoagulation should be considered per the stroke-risk assessment, with routine monitoring.",
      moderate:
        "Bleeding risk is moderate. Anticoagulation can be considered; address reversible risk factors and arrange closer follow-up.",
      high: "Bleeding risk is high. Consider alternatives to anticoagulation or, if anticoagulation proceeds, correct reversible factors (blood pressure control, stop NSAIDs, limit alcohol) and monitor closely.",
      "very-high":
        "Bleeding risk is very high (likely above 10%). Alternatives to anticoagulation should be strongly considered, with careful shared decision-making.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Use the score to identify and correct reversible bleeding risks, then weigh residual bleeding risk against stroke risk together with the patient."
    },
    evidence: [
      {
        label: "Pisters R et al. Chest 2010 — derivation (Euro Heart Survey)",
        url: "https://doi.org/10.1378/chest.10-0134"
      },
      {
        label: "Lip GYH et al. J Am Coll Cardiol 2011 — validation",
        url: "https://doi.org/10.1016/j.jacc.2010.09.024"
      },
      {
        label: "MDCalc — HAS-BLED calculator",
        url: "https://www.mdcalc.com/calc/807/has-bled-score-major-bleeding-risk"
      }
    ],
    creator:
      "Developed by Ron Pisters, Gregory Lip, and colleagues from the Euro Heart Survey on atrial fibrillation and published in 2010 as a bedside-friendly bleeding risk tool."
  },
  heart: {
    description:
      "Risk-stratifies ED chest pain patients by 6-week risk of major adverse cardiac events (death, MI, or coronary revascularization) to guide admission-versus-discharge decisions.",
    instructions:
      "Score the five elements — History, EKG, Age, Risk factors, Troponin — 0 to 2 points each from the current presentation, using the initial troponin. The history component is the most subjective; apply it consistently.",
    whenToUse: [
      "Adults presenting to the emergency department with chest pain concerning for possible acute coronary syndrome.",
      "After the initial EKG and first troponin result, to decide between discharge, observation, and admission.",
      "Handoff and documentation, to communicate a standardized risk estimate."
    ],
    pearlsPitfalls: [
      "A positive troponin should prompt admission and further workup even with a low total score — the score does not overrule an abnormal biomarker.",
      "The history component is subjective; the line between slightly and moderately suspicious drives the score, so apply it consistently.",
      "Validated for undifferentiated chest pain; do not use it to risk-stratify obvious STEMI or clearly non-cardiac pain.",
      "Low risk is not zero risk (roughly 1\u20132%); ensure timely outpatient follow-up for discharged patients."
    ],
    whyUse:
      "Chest pain is one of the highest-volume, highest-liability ED presentations. The HEART score outperformed older approaches for undifferentiated chest pain and gives genuinely low-risk patients a safe, evidence-based path home.",
    nextSteps: {
      low: "Low 6-week MACE risk (0.9\u20131.7%). In the validation studies these patients were discharged with timely outpatient follow-up. Admit and work up further if troponin is positive.",
      moderate:
        "Moderate 6-week MACE risk (12\u201316.6%). Admit for observation, serial troponins, and cardiology input; pursue noninvasive or invasive evaluation per local protocol.",
      high: "High 6-week MACE risk (50\u201365%). Admit and consider early invasive management with cardiology involvement.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Match disposition intensity to the risk band, never discharge on a positive troponin, and arrange follow-up for low-risk discharges."
    },
    evidence: [
      {
        label: "Backus BE et al. Int J Cardiol 2013 — prospective validation",
        url: "https://doi.org/10.1016/j.ijcard.2013.01.166"
      },
      {
        label: "MDCalc — HEART Score calculator",
        url: "https://www.mdcalc.com/calc/1752/heart-score-major-cardiac-events"
      }
    ],
    creator:
      "Developed by Barbra Backus and Dutch colleagues specifically for the undifferentiated ED chest pain population, with prospective multicenter validation published in 2013."
  },
  timi: {
    description:
      "Predicts 14-day risk of death, MI, or severe recurrent ischemia requiring urgent revascularization in unstable angina and NSTEMI.",
    instructions:
      "Answer the seven yes/no questions from history, EKG, and cardiac markers. Each yes adds one point; the 14-day risk is read from the validated point-to-risk table.",
    whenToUse: [
      "Patients with diagnosed unstable angina or NSTEMI — not undifferentiated chest pain — to quantify short-term risk.",
      "Deciding the intensity of medical therapy and the timing of an invasive strategy.",
      "Prognostic counseling for patients and families after an ACS diagnosis."
    ],
    pearlsPitfalls: [
      "A score of 0 does not mean zero risk (roughly 5% event rate) — it is not a discharge tool for confirmed ACS.",
      "For undifferentiated ED chest pain, the HEART score stratifies risk better than TIMI.",
      "TIMI was derived before high-sensitivity troponins and modern early-invasive care; treat it as one input among several.",
      "All seven inputs are binary — borderline findings still count as yes, with no partial credit."
    ],
    whyUse:
      "Once ACS is diagnosed, clinicians need a quick, memorable way to communicate how sick the patient is likely to get in the next two weeks. TIMI's seven yes/no questions do that in under a minute and remain the most widely recognized ACS risk language.",
    nextSteps: {
      low: "Lower short-term risk, but not negligible (about 5% at 14 days). Further risk-stratify per institutional protocol; low scores alone do not justify discharge in confirmed ACS.",
      moderate:
        "Intermediate risk (about 8\u201320%). Escalate medical therapy and consider early invasive management per guidelines.",
      high: "High risk (26\u201341%). Pursue aggressive medical therapy and an early invasive strategy with cardiology involvement.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Escalate care intensity with the risk band, and remember that even low scores carry meaningful residual risk in confirmed ACS."
    },
    evidence: [
      {
        label: "Antman EM et al. JAMA 2000 — derivation (TIMI 11B / ESSENCE)",
        url: "https://doi.org/10.1001/jama.284.7.835"
      },
      {
        label: "MDCalc — TIMI UA/NSTEMI calculator",
        url: "https://www.mdcalc.com/calc/111/timi-risk-score-ua-nstemi"
      }
    ],
    creator:
      "Developed by Elliott Antman and the TIMI study group from the TIMI 11B and ESSENCE trial populations and published in JAMA in 2000."
  },
  grace: {
    description:
      "Estimates in-hospital and 6-month mortality in confirmed acute coronary syndrome using eight admission variables, from the original published GRACE nomogram (not GRACE 2.0).",
    instructions:
      "Enter age, heart rate, systolic blood pressure, and creatinine as numbers, then answer the four categorical questions (Killip class, cardiac arrest at admission, ST deviation, elevated markers). Points follow the published nomogram tables.",
    whenToUse: [
      "Confirmed ACS (unstable angina, NSTEMI, or STEMI) at presentation to estimate mortality risk.",
      "Identifying high-risk patients (score above 140) who may benefit from an early invasive strategy.",
      "Prognostic discussions with patients and families."
    ],
    pearlsPitfalls: [
      "This is the ORIGINAL 2003/2006 nomogram — MDCalc now runs GRACE 2.0, so point totals and percentages here will not match MDCalc's current calculator.",
      "In STEMI, do not let the score delay reperfusion; use it for prognosis, not triage timing.",
      "The score supplements but never replaces clinical judgment, EKG findings, troponin trends, and hemodynamic stability.",
      "Killip class requires a real exam assessment of heart failure signs — estimate it carefully, since it carries heavy points."
    ],
    whyUse:
      "ACS patients vary enormously in risk, and gestalt alone misclassifies many. The GRACE nomogram, derived from tens of thousands of registry patients across the ACS spectrum, remains the most broadly validated ACS mortality predictor and directly informs the early-invasive decision.",
    nextSteps: {
      low: "Low mortality risk (in-hospital under 1%, 6-month under 3%). Provide guideline-directed medical therapy and routine ACS care with appropriate follow-up.",
      moderate:
        "Intermediate mortality risk (in-hospital 1\u20133%, 6-month 3\u20138%). Ensure guideline-directed care, monitor closely, and involve cardiology in management planning.",
      high: "High mortality risk (in-hospital above 3%, 6-month above 8%). A score above 140 supports consideration of an early invasive strategy; ensure intensive guideline-directed care and close follow-up.",
      incomplete: "Complete all required fields to calculate the score.",
      default:
        "Align care intensity and invasiveness of strategy with the risk category, and use the estimate to frame goals-of-care conversations."
    },
    evidence: [
      {
        label: "Granger CB et al. Arch Intern Med 2003 — in-hospital mortality model",
        url: "https://doi.org/10.1001/archinte.163.19.2345"
      },
      {
        label: "Fox KAA et al. BMJ 2006 — 6-month death/MI model",
        url: "https://doi.org/10.1136/bmj.38985.646481.55"
      },
      {
        label: "MDCalc — GRACE calculator (runs GRACE 2.0; values will differ)",
        url: "https://www.mdcalc.com/calc/1099/grace-acs-risk-mortality-calculator"
      }
    ],
    creator:
      "Derived from the Global Registry of Acute Coronary Events by Christopher Granger and colleagues for in-hospital mortality (2003), and extended to 6-month death and MI by Keith Fox and colleagues (2006)."
  }
};

const BATCH3_GUIDES = {
  "wells-dvt": {
    description: "Estimates the pre-test probability of deep vein thrombosis from bedside clinical findings, to guide whether the next step is D-dimer testing, venous ultrasound, or neither.",
    instructions: "Answer yes or no for each of the 10 criteria after completing a history and physical examination. The final item subtracts 2 points when an alternative diagnosis is as likely as, or more likely than, DVT.",
    whenToUse: [
      "When DVT is on the differential in an outpatient or ED patient with leg pain or swelling, after history and physical examination",
      "To decide between D-dimer testing, venous ultrasound, or no further testing",
      "Before ordering imaging, to avoid unnecessary ultrasounds in low-risk patients"
    ],
    pearlsPitfalls: [
      "Apply only when DVT is genuinely being considered; risk stratification is unnecessary when there is no clinical concern",
      "The alternative-diagnosis item (-2 points) is the most subjective — document which alternative diagnosis you considered",
      "Do not let a low score alone rule out DVT when clinical concern remains high; a negative proximal ultrasound in a moderate- or high-risk patient may need repeat imaging in about a week",
      "Screen for concurrent pulmonary embolism symptoms (chest pain, dyspnea), which escalate the urgency of the workup"
    ],
    whyUse: "The Wells DVT criteria are among the most widely validated pre-test probability tools for DVT. Combined with D-dimer testing, the score safely reduces unnecessary venous ultrasounds while catching the patients who need imaging.",
    nextSteps: {
      "unlikely": "DVT is unlikely. Obtain a moderate- or high-sensitivity D-dimer: a negative result reduces post-test probability below 1% and no imaging is required. A positive D-dimer prompts venous ultrasound — treat if positive; a negative ultrasound is sufficient to rule out DVT.",
      "moderate": "Moderate risk. Obtain a high-sensitivity D-dimer (moderate-sensitivity assays are not sufficient at this tier). A negative high-sensitivity D-dimer rules out DVT; a positive result prompts venous ultrasound.",
      "likely": "DVT is likely. Proceed directly to diagnostic venous ultrasound rather than D-dimer. A positive ultrasound warrants anticoagulation after assessing bleeding risk and contraindications. If the ultrasound is negative but concern persists, repeat ultrasound within about a week.",
      "default": "Pair the score with D-dimer and ultrasound according to the risk tier, and never let a low score override strong clinical concern."
    },
    evidence: [
      { label: "Wells PS et al. Lancet. 1997 — primary derivation study", url: "https://doi.org/10.1016/S0140-6736(97)08140-3" },
      { label: "Wells PS et al. Ann Intern Med. 2003 — widely validated version", url: "https://doi.org/10.7326/0003-4819-139-12-200312160-00003" },
      { label: "MDCalc — Wells' Criteria for DVT", url: "https://www.mdcalc.com/calc/362/wells-criteria-dvt" }
    ],
    creator: "Developed by Dr. Philip Wells and colleagues at the University of Ottawa; the widely used version derives from the 1997 Lancet derivation study, with refinements published in 2003."
  },
  "wells-pe": {
    description: "Estimates the pre-test probability of pulmonary embolism to determine whether to rule out with D-dimer testing or proceed directly to CT pulmonary angiography.",
    instructions: "Score each of the 7 clinical criteria, noting the 1.5-point increments for tachycardia, immobilization or recent surgery, and prior VTE. Both the three-tier (low / moderate / high) and two-tier (unlikely / likely, threshold above 4 points) interpretations are accepted in practice.",
    whenToUse: [
      "In ED or inpatient patients with symptoms suggesting PE — dyspnea, pleuritic chest pain, tachycardia, hypoxia — before ordering D-dimer or CT angiography",
      "To identify low-risk patients in whom a negative high-sensitivity D-dimer safely excludes PE",
      "To identify high-risk patients who should go straight to imaging without D-dimer testing"
    ],
    pearlsPitfalls: [
      "Clinical suspicion of PE must come first; the score refines probability, it does not create it",
      "The \u201CPE is the #1 diagnosis or equally likely\u201D item (+3 points) is subjective — be explicit about your differential",
      "Guidelines favor the two-tier model with high-sensitivity D-dimer; intermediate three-tier patients still require further risk stratification",
      "Never delay resuscitation for diagnostic testing in the unstable patient"
    ],
    whyUse: "The Wells PE score is the most widely validated pre-test probability tool for pulmonary embolism. Paired with high-sensitivity D-dimer, it safely excludes PE in low-risk patients and spares them unnecessary CT scans.",
    nextSteps: {
      "low": "Low risk. Consider high-sensitivity D-dimer to rule out PE, or apply the PERC rule if the patient qualifies. A D-dimer below threshold rules out PE; an elevated one prompts CT pulmonary angiography or V/Q scan. Age-adjusted D-dimer cutoffs are validated in patients over 50.",
      "moderate": "Moderate risk. Obtain high-sensitivity D-dimer testing or proceed to CT pulmonary angiography. A negative high-sensitivity D-dimer rules out PE; otherwise obtain imaging.",
      "high": "High risk. Proceed directly to CT pulmonary angiography (or V/Q scan if CT is contraindicated). D-dimer testing is not recommended at this tier.",
      "default": "Match workup intensity to the risk tier, and resuscitate unstable patients before pursuing diagnostics."
    },
    evidence: [
      { label: "Wells PS et al. Thromb Haemost. 2000 — primary derivation study", url: "https://doi.org/10.1055/s-0037-1614333" },
      { label: "MDCalc — Wells' Criteria for Pulmonary Embolism", url: "https://www.mdcalc.com/calc/115/wells-criteria-pulmonary-embolism-pe" }
    ],
    creator: "Derived by Dr. Philip Wells and colleagues, published in 2000, from emergency department patients with suspected PE — incorporating D-dimer to define the low-risk rule-out pathway."
  },
  "perc": {
    description: "A rule-out tool that identifies low-risk patients in whom pulmonary embolism can be excluded on clinical grounds alone, without D-dimer or imaging.",
    instructions: "Apply only after clinical gestalt — or a validated score such as Wells — has already classified the patient as low risk (pre-test probability below about 15%). Answer yes or no to all 8 criteria; the rule is negative only when every answer is no.",
    whenToUse: [
      "In ED patients with possible PE whose pre-test probability is already low (<15%) by gestalt or a Wells score",
      "To avoid D-dimer testing and imaging in patients who meet all 8 rule-out criteria",
      "As an alternative to D-dimer after a low-risk Wells assessment"
    ],
    pearlsPitfalls: [
      "Never apply PERC to moderate- or high-risk patients, or in high-prevalence settings — its sensitivity falls outside low-risk populations",
      "Not validated in pregnancy; use caution there",
      "A negative PERC does not mean zero risk — it means the risk is low enough (under ~2%) to forgo testing",
      "If any single criterion is positive, PERC cannot rule out PE — move to D-dimer testing"
    ],
    whyUse: "In properly selected low-risk patients, a negative PERC rule safely obviates D-dimer and CT imaging, reducing cost, contrast and radiation exposure, and emergency department length of stay.",
    nextSteps: {
      "negative": "PE can be safely excluded; no D-dimer or imaging is required. Maintain a broad differential for the presenting symptoms, particularly pleuritic complaints.",
      "positive": "PERC cannot rule out PE. Obtain a high-sensitivity D-dimer (consider age-adjusted cutoffs in patients over 50); if negative and pre-test probability remains below 15%, no further testing is needed. If positive, proceed to CT angiography or V/Q scan.",
      "default": "PERC applies only to low pre-test probability patients; any positive criterion sends the patient down the D-dimer pathway."
    },
    evidence: [
      { label: "Kline JA et al. J Thromb Haemost. 2004 — primary derivation study", url: "https://doi.org/10.1111/j.1538-7836.2004.00845.x" },
      { label: "MDCalc — PERC Rule for Pulmonary Embolism", url: "https://www.mdcalc.com/calc/347/perc-rule-pulmonary-embolism" }
    ],
    creator: "Derived by Dr. Jeffrey Kline and colleagues and published in 2004, from a multicenter emergency department study of patients with suspected pulmonary embolism."
  },
  "curb65": {
    description: "Estimates 30-day mortality in community-acquired pneumonia to guide the core disposition decision: outpatient, inpatient, or ICU-level care.",
    instructions: "Assign one point for each of the five criteria present: new confusion, BUN above 19 mg/dL, respiratory rate of 30 or more, low blood pressure (systolic below 90 or diastolic 60 or below), and age 65 or older.",
    whenToUse: [
      "In adults presenting with community-acquired pneumonia, to decide on outpatient versus inpatient versus ICU disposition",
      "At initial presentation, alongside clinical judgment and oxygenation assessment",
      "To standardize disposition decisions and handoff communication"
    ],
    pearlsPitfalls: [
      "CURB-65 does not capture hypoxemia, multilobar disease, or comorbidities — a low score does not mandate discharge if the patient is hypoxic, frail, or unreliable for follow-up",
      "High scorers should also be screened for sepsis, which changes management urgency",
      "Disposition dictates downstream care (cultures, labs, monitoring), so the decision carries weight beyond the score itself",
      "Many pneumonias are viral, but antibiotics are typically still given when bacterial infection cannot be excluded"
    ],
    whyUse: "CURB-65 is a simple, internationally validated predictor of pneumonia mortality whose score maps directly to a disposition recommendation endorsed by major guidelines.",
    nextSteps: {
      "low": "Low risk (0-1 points). Consider outpatient treatment with oral antibiotics and close follow-up, provided the patient is not hypoxic and can reliably return if worsening.",
      "moderate": "Moderate risk (2 points). Consider short inpatient or observation admission with monitoring and parenteral antibiotics.",
      "high": "High risk (3 or more points). Admit; with scores of 4-5 consider ICU-level care. Evaluate for sepsis, obtain cultures, and start empiric antibiotics promptly.",
      "default": "Use the score to anchor disposition, but integrate oxygenation, comorbidities, and social factors before finalizing the plan."
    },
    evidence: [
      { label: "Lim WS et al. Thorax. 2003 — international derivation and validation study", url: "https://doi.org/10.1136/thorax.58.5.377" },
      { label: "MDCalc — CURB-65 Score for Pneumonia Severity", url: "https://www.mdcalc.com/calc/324/curb-65-score-pneumonia-severity" }
    ],
    creator: "Derived and validated by W. S. Lim and colleagues in an international study of patients presenting to hospital with community-acquired pneumonia, published in Thorax in 2003."
  },
  "qsofa": {
    description: "A three-item bedside prompt that flags infected patients at high risk of poor outcome. It predicts mortality — it does not diagnose sepsis.",
    instructions: "Score one point each for respiratory rate of 22/min or more, systolic blood pressure of 100 mmHg or less, and altered mentation (GCS below 15). A total of 2 or more is a positive screen.",
    whenToUse: [
      "In non-ICU patients with suspected infection, to flag those needing deeper evaluation for organ dysfunction",
      "As a repeatable bedside screen when a patient's clinical status changes",
      "Outside the ICU, where it has shown stronger predictive value than the full SOFA score"
    ],
    pearlsPitfalls: [
      "qSOFA predicts mortality; it is not a diagnostic test for sepsis — a positive score alone should not trigger broad-spectrum antibiotics",
      "A positive score should prompt calculation of the full SOFA score and workup for organ dysfunction, including serum lactate",
      "A negative score does not exclude sepsis — repeat qSOFA if the clinical picture changes",
      "It was designed for non-ICU settings; its performance characteristics differ inside the ICU"
    ],
    whyUse: "qSOFA distills sepsis risk stratification to three bedside variables, giving clinicians outside the ICU a fast, validated trigger for deeper organ-dysfunction assessment under the Sepsis-3 framework.",
    nextSteps: {
      "positive": "High risk. Assess for organ dysfunction with blood testing including serum lactate, and calculate the full SOFA score. Consider infection even if previously unsuspected, and increase monitoring frequency.",
      "negative": "Not high risk. If sepsis is still suspected, continue monitoring and evaluation with serial qSOFA assessments, and treat as clinically indicated.",
      "default": "Treat qSOFA as a prompt for further assessment, not a treatment trigger; manage sepsis itself per current Surviving Sepsis Campaign guidance."
    },
    evidence: [
      { label: "Seymour CW et al. JAMA. 2016 — Sepsis-3 clinical criteria", url: "https://doi.org/10.1001/jama.2016.0287" },
      { label: "MDCalc — qSOFA (Quick SOFA) Score for Sepsis", url: "https://www.mdcalc.com/calc/2654/qsofa-quick-sofa-score-sepsis" }
    ],
    creator: "Introduced by the Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3) task force, led by Dr. Christopher Seymour and colleagues and published in JAMA in 2016."
  },
  "sofa": {
    description: "Grades dysfunction across six organ systems — respiratory, coagulation, liver, cardiovascular, neurologic, and renal — to track severity of illness and predict ICU mortality.",
    instructions: "For each organ system, use the most abnormal value over the preceding 24 hours. Enter FiO2 as a percent (21 = room air). Respiratory scores of 3-4 require mechanical ventilation or CPAP. If the patient is sedated, estimate the GCS off sedatives.",
    whenToUse: [
      "In ICU patients with suspected infection, to confirm sepsis under Sepsis-3 (a rise of 2 or more points from baseline)",
      "At ICU admission to establish a baseline, then serially to track disease trajectory",
      "To inform prognosis discussions with patients and families, and for risk adjustment in research and quality assessment"
    ],
    pearlsPitfalls: [
      "Establish a baseline as soon as the patient arrives in the ICU — the change in score matters as much as the absolute value",
      "Use the most abnormal value in each 24-hour window, not a single admission snapshot",
      "The score describes organ dysfunction; it does not validate whether a therapy is succeeding or failing",
      "Cardiovascular scoring uses vasoactive doses in mcg/kg/min — confirm units before scoring"
    ],
    whyUse: "SOFA is the reference standard for describing organ dysfunction in critical care. Serial scores track trajectory, and a 2-point rise in suspected infection defines sepsis under Sepsis-3.",
    nextSteps: {
      "calculated": "Use the score to track organ dysfunction over time, assess mortality risk, and guide goals-of-care discussions. A rise of 2 or more points with suspected infection meets Sepsis-3 sepsis criteria — manage per the Surviving Sepsis Campaign. Re-score daily using the most abnormal 24-hour values.",
      "default": "Reassess serially; management follows the underlying cause of the organ dysfunction, not the number alone."
    },
    evidence: [
      { label: "Vincent JL et al. Intensive Care Med. 1996 — original SOFA description", url: "https://doi.org/10.1007/BF01709751" },
      { label: "MDCalc — SOFA (Sequential Organ Failure Assessment) Score", url: "https://www.mdcalc.com/calc/691/sofa-sequential-organ-failure-assessment-score" }
    ],
    creator: "Developed by Dr. Jean-Louis Vincent and colleagues in 1996 at a consensus conference of the European Society of Intensive Care Medicine, to describe the sequence of organ dysfunction in sepsis."
  }
};

const BATCH4_GUIDES = {
  "meldna": {
    description: "Estimates 3-month mortality in end-stage liver disease and determines priority for liver transplant allocation under the UNOS/OPTN system.",
    instructions: "Enter the six required values: dialysis frequency and CVVHD status over the past week, plus the most recent creatinine, total bilirubin, INR, and serum sodium. Per UNOS rules, bilirubin, creatinine, and INR values below 1.0 are set to 1.0, creatinine is capped at 4.0 mg/dL (or set to 4.0 with recent dialysis or CVVHD), and the final score is capped at 40.",
    whenToUse: [
      "Prioritizing adult candidates (age 12 and older) on the liver transplant waiting list.",
      "Estimating short-term (3-month) mortality in patients with end-stage liver disease.",
      "Reassessing prognosis as laboratory values change during the course of decompensated cirrhosis."
    ],
    pearlsPitfalls: [
      "Sodium only adds points when the initial MELD exceeds 11; hyponatremia in low-MELD patients does not change the score.",
      "Creatinine is automatically set to 4.0 mg/dL with dialysis twice in the past week or CVVHD for 24 hours or more — do not enter a lower value to adjust for renal replacement.",
      "MELDNa does not capture complications such as refractory ascites, encephalopathy, or hepatocellular carcinoma, which are handled through standard MELD exception points.",
      "A single MELDNa is a snapshot; the score must be recalculated with fresh labs because it shifts with bilirubin, creatinine, INR, and sodium."
    ],
    whyUse: "MELDNa is the allocation standard for donor livers in the United States because it predicts waitlist mortality more accurately than clinical judgment or the Child-Pugh score, and the sodium component identifies high-risk hyponatremic patients whose MELD alone underestimates mortality.",
    nextSteps: {
      "very-low": "Estimated 3-month mortality is under 2%. Continue routine cirrhosis care: hepatocellular carcinoma surveillance with ultrasound with or without AFP every 6 months, variceal and decompensation monitoring, and repeat MELDNa whenever labs change.",
      "low": "Estimated 3-month mortality is about 6%. Continue standard cirrhosis management and HCC screening; recheck MELDNa periodically as laboratory values evolve.",
      "moderate": "Estimated 3-month mortality is roughly 20%. Consider referral to a hepatologist or liver transplant center for evaluation (generally considered at a MELDNa of 10 or above), and screen for hepatocellular carcinoma to assess eligibility for standard MELD exception points.",
      "high": "Estimated 3-month mortality exceeds 50%. Refer promptly to a liver transplant center, optimize the patient for possible transplantation, and screen for HCC and other exception-point diagnoses.",
      "very-high": "Estimated 3-month mortality is above 70%. Arrange urgent transplant-center referral — the patient is among the highest waitlist priority. Coordinate goals of care alongside the transplant evaluation.",
      "default": "Recalculate MELDNa whenever labs change, since the score moves with bilirubin, creatinine, INR, and sodium. Refer to a hepatologist or transplant center at a score of 10 or above, and screen all cirrhosis patients periodically for hepatocellular carcinoma."
    },
    evidence: [
      { label: "Kamath PS et al. A model to predict survival in patients with end-stage liver disease. Hepatology. 2001;33(2):464-470.", url: "https://doi.org/10.1053/jhep.2001.22172" },
      { label: "Kim WR et al. Hyponatremia and mortality among patients on the liver-transplant waiting list. N Engl J Med. 2008;359:1018-1026.", url: "https://doi.org/10.1056/NEJMoa0801209" },
      { label: "OPTN/UNOS liver allocation policy.", url: "https://optn.transplant.hrsa.gov/" },
      { label: "MDCalc: MELDNa (UNOS/OPTN) Score.", url: "https://www.mdcalc.com/calc/78/meld-score-model-end-stage-liver-disease-12-older" }
    ],
    creator: "Patrick Kamath and colleagues at the Mayo Clinic developed the original MELD model in 2001 to predict survival in end-stage liver disease. W. Ray Kim and colleagues subsequently showed that adding serum sodium improved waitlist mortality prediction, and UNOS/OPTN adopted the MELDNa formula for liver allocation in January 2016."
  },
  "child-pugh": {
    description: "Grades the severity of cirrhosis and estimates prognosis using five measures: total bilirubin, albumin, INR, ascites, and encephalopathy.",
    instructions: "Enter total bilirubin, albumin, and INR, then grade ascites (absent, slight, moderate) and encephalopathy (none, grade 1-2, grade 3-4). Each measure contributes 1 to 3 points; the total places the patient in class A (5-6 points), class B (7-9 points), or class C (10-15 points).",
    whenToUse: [
      "Stratifying perioperative risk before abdominal surgery in patients with cirrhosis.",
      "Estimating prognosis at the bedside when a rapid severity grade is needed.",
      "Identifying patients who should be referred for liver transplant evaluation."
    ],
    pearlsPitfalls: [
      "Ascites and encephalopathy grading is subjective — diuretic-responsive ascites and medically controlled encephalopathy can shift the class in either direction.",
      "The score omits renal function and sodium, so it can underestimate mortality compared with MELDNa; compare the two when they disagree.",
      "Child-Pugh does not determine organ allocation — transplant listing uses MELDNa."
    ],
    whyUse: "Child-Pugh remains the fastest bedside summary of cirrhosis severity, combining synthetic function, coagulation, and clinical decompensation into a single grade that predicts surgical risk and signals when transplant referral is due.",
    nextSteps: {
      "compensated": "Child-Pugh class A (compensated cirrhosis). Life expectancy is on the order of 15-20 years and perioperative mortality for abdominal surgery is about 10%. Continue HCC surveillance and variceal screening while treating the underlying liver disease.",
      "significant dysfunction": "Child-Pugh class B. This is an indication for transplant evaluation. Perioperative mortality for abdominal surgery is about 30%, so avoid elective surgery when possible. Refer to a transplant center and intensify monitoring for decompensation.",
      "decompensated": "Child-Pugh class C (decompensated cirrhosis). Life expectancy is roughly 1-3 years and perioperative mortality for abdominal surgery is about 82%. Urgent transplant evaluation is indicated; focus on managing ascites, encephalopathy, and variceal bleeding risk alongside goals of care.",
      "default": "Reassess the class as clinical status changes. Class B or C warrants transplant-center referral; use MELDNa alongside Child-Pugh for organ-allocation decisions."
    },
    evidence: [
      { label: "Pugh RNH et al. Transection of the oesophagus for bleeding oesophageal varices. Br J Surg. 1973;60:646-649.", url: "https://doi.org/10.1002/bjs.1800600817" },
      { label: "MDCalc: Child-Pugh Score for Cirrhosis Mortality.", url: "https://www.mdcalc.com/calc/340/child-pugh-score-cirrhosis-mortality" }
    ],
    creator: "Charles Child and Jeremy Turcotte introduced the original classification in 1964 to estimate surgical risk in portal hypertension. R. N. H. Pugh and colleagues at King's College Hospital, London, modified it in 1973 — replacing nutritional status with prothrombin time and adding the A/B/C grading still used today."
  },
  "fib4": {
    description: "Noninvasive estimate of liver fibrosis from age, AST, ALT, and platelet count; helps decide which patients with chronic liver disease need further evaluation or biopsy.",
    instructions: "Enter the patient's age, AST, ALT, and platelet count. The index is computed automatically; interpret it against the low (below 1.45), indeterminate (1.45-3.25), and high (above 3.25) cutoffs, remembering it is less reliable in patients under 35 or over 65.",
    whenToUse: [
      "Screening for advanced fibrosis in patients with chronic HCV or HBV infection.",
      "Risk-stratifying NAFLD/MASLD patients in primary care to decide on hepatology referral.",
      "Monitoring fibrosis risk over time without repeat liver biopsy."
    ],
    pearlsPitfalls: [
      "Less reliable under age 35 or over 65 — age sits in the numerator, so extremes skew the result.",
      "Acute hepatitis flares raise transaminases and can falsely elevate the score; recalculate after enzymes settle.",
      "Thrombocytopenia from non-hepatic causes (for example ITP) inflates the index.",
      "An indeterminate result is common and is not a diagnosis — it means further testing is needed."
    ],
    whyUse: "FIB-4 uses four routinely available values to rule out advanced fibrosis with high negative predictive value, sparing many patients an invasive liver biopsy.",
    nextSteps: {
      "low": "Advanced fibrosis is effectively excluded. Continue medical management of the underlying liver disease and repeat FIB-4 periodically; biopsy is generally not required while the score stays low.",
      "indeterminate": "Further investigation is needed. Consider transient elastography (FibroScan) or hepatology referral; do not assume fibrosis is absent, and recheck after any acute transaminase flare has resolved.",
      "high": "Advanced fibrosis (METAVIR stage F3-F4) is likely. Refer to hepatology and confirm with elastography or liver biopsy unless other clinical or imaging findings already establish cirrhosis; begin cirrhosis care including HCC and variceal screening.",
      "default": "Use the cutoffs as triage thresholds rather than diagnoses: low scores can be managed medically with surveillance, indeterminate scores need additional testing, and high scores warrant hepatology referral and cirrhosis evaluation."
    },
    evidence: [
      { label: "Sterling RK et al. Development of a simple noninvasive index to predict significant fibrosis in patients with HIV/HCV coinfection. Hepatology. 2006;43(6):1317-1325.", url: "https://doi.org/10.1002/hep.21178" },
      { label: "Vallet-Pichard A et al. FIB-4: an inexpensive and accurate marker of fibrosis in HCV infection. Hepatology. 2007;46:32-36.", url: "https://doi.org/10.1002/hep.21669" },
      { label: "MDCalc: Fibrosis-4 (FIB-4) Index for Liver Fibrosis.", url: "https://www.mdcalc.com/calc/2200/fibrosis-4-fib-4-index-liver-fibrosis" }
    ],
    creator: "Richard Sterling and colleagues at Virginia Commonwealth University developed FIB-4 in 2006 from a cohort of HIV/HCV-coinfected patients, seeking a simple noninvasive alternative to liver biopsy for staging fibrosis."
  },
  "fena": {
    description: "Distinguishes prerenal acute kidney injury from intrinsic renal injury by measuring the fraction of filtered sodium excreted in the urine.",
    instructions: "Enter serum sodium, serum creatinine, urine sodium, and urine creatinine from contemporaneous samples. A FENa below 1% suggests a prerenal state, 1-2% is indeterminate, and above 2% suggests intrinsic renal disease.",
    whenToUse: [
      "Evaluating oliguric acute kidney injury to separate prerenal azotemia from acute tubular necrosis.",
      "Deciding whether a fluid challenge or a workup for intrinsic renal disease is the next step."
    ],
    pearlsPitfalls: [
      "Do not use FENa in patients taking diuretics — use fractional excretion of urea (FEUrea) instead, since diuretics directly raise urine sodium.",
      "Also unreliable with known chronic kidney disease, urinary tract obstruction, or acute glomerular disease.",
      "A FENa below 1% cannot distinguish hepatorenal syndrome from other prerenal states.",
      "No single cutoff proves prerenal disease; always interpret alongside the history, examination, medications, and urine microscopy."
    ],
    whyUse: "FENa translates the kidney's sodium handling into a single number reflecting tubular function: intact tubules avidly reabsorb sodium when perfusion falls, while injured tubules cannot.",
    nextSteps: {
      "low": "Prerenal pattern (FENa below 1%). Assess volume status and perfusion; consider a fluid challenge when hypovolemia is suspected, look for low-output states such as heart failure or sepsis, and repeat urine studies as the course evolves. Contrast-associated injury and hepatorenal physiology can also appear prerenal.",
      "indeterminate": "FENa of 1-2% fits either prerenal or intrinsic disease. Do not anchor on the number — reassess volume status, medication exposures (diuretics invalidate the test), and urine sediment, and repeat studies during the hospital course.",
      "high": "Intrinsic pattern (FENa above 2%), suggesting acute tubular necrosis or other intrinsic renal disease. Pursue the intrinsic workup: urine microscopy for muddy brown granular casts, nephrotoxin review, and nephrology input. Fluids alone are unlikely to reverse the injury.",
      "default": "Confirm the patient is not on diuretics and has no CKD, obstruction, or acute glomerular disease before trusting FENa; otherwise use FEUrea. Repeat urine studies over the hospital course, since a single value is only a snapshot."
    },
    evidence: [
      { label: "Espinel CH. The FeNa test: a determination of the excreted fraction of the filtered sodium. JAMA. 1976;236:579-581.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=%22The+FeNa+test%22+Espinel+1976" },
      { label: "Gharaibeh KA et al. Fractional excretion of sodium and urea are useful tools in the evaluation of AKI: PRO. Kidney360. 2023.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10371381/" },
      { label: "MDCalc: Fractional Excretion of Sodium (FENa).", url: "https://www.mdcalc.com/calc/60/fractional-excretion-sodium-fena" }
    ],
    creator: "Carlos H. Espinel described the FENa test in 1976 after studying oliguric patients with acute renal failure, showing that a fractional excretion below 1% marked prerenal physiology while higher values marked tubular injury — the cutoffs still taught today."
  },
  "lights": {
    description: "Determines whether a pleural effusion is exudative or transudative using pleural and serum protein and LDH measurements.",
    instructions: "Enter total serum protein, pleural fluid protein, serum LDH, pleural fluid LDH, and your laboratory's upper limit of normal for serum LDH. The effusion is exudative if any one of the three criteria is met; otherwise it is classified as transudative.",
    whenToUse: [
      "Classifying a new pleural effusion after diagnostic thoracentesis.",
      "Narrowing the differential: transudates point to systemic causes such as heart failure or cirrhosis, while exudates point to local pleural disease such as infection or malignancy."
    ],
    pearlsPitfalls: [
      "Highly sensitive (about 98%) for exudates but less specific — heart-failure effusions in diuresed patients can falsely meet exudative criteria, in which case the serum-effusion albumin gradient helps.",
      "Use your own laboratory's LDH upper limit of normal for the third criterion.",
      "The criteria classify the fluid; they do not diagnose the cause — exudates still need cell counts, culture, cytology, and sometimes pleural biopsy."
    ],
    whyUse: "Light's criteria convert five routine laboratory values into a decision rule that has directed pleural effusion workups for over fifty years, separating effusions that need local investigation from those managed by treating the underlying systemic disease.",
    nextSteps: {
      "exudative": "At least one criterion is met — manage as an exudative effusion. Pursue the local cause: pleural fluid cell count with differential, Gram stain and culture, and cytology, with triglycerides, ADA, or pH as indicated. Malignancy, parapneumonic effusion, pulmonary embolism, tuberculosis, and autoimmune disease top the differential; proceed to pleural biopsy or thoracoscopy when fluid studies are unrevealing.",
      "transudative": "No criteria are met — the effusion is likely transudative. Focus on the systemic cause rather than the pleura: evaluate for heart failure, cirrhosis with hepatic hydrothorax, nephrotic syndrome, and hypoalbuminemia, and treat the underlying condition; the effusion typically resolves with it.",
      "default": "When the classification conflicts with the clinical picture — for example a diuresed heart-failure patient meeting exudative criteria — check the serum-effusion albumin gradient and re-examine the context before committing to an exudative workup."
    },
    evidence: [
      { label: "Light RW et al. Pleural effusions: the diagnostic separation of transudates and exudates. Ann Intern Med. 1972;77(4):507-513.", url: "https://doi.org/10.7326/0003-4819-77-4-507" },
      { label: "MDCalc: Light's Criteria for Exudative Effusions.", url: "https://www.mdcalc.com/calc/797/lights-criteria-for-exudative-effusions" }
    ],
    creator: "Richard W. Light and colleagues at Johns Hopkins University published the criteria in 1972 after comparing pleural fluid and serum protein and LDH in patients with effusions, creating the three-rule test that still defines exudate versus transudate."
  }
};

const BATCH5_GUIDES = {
  "anion-gap": {
    description: "Calculates the serum anion gap from sodium, chloride, and bicarbonate to detect unmeasured anions and classify metabolic acidosis.",
    instructions: "Enter sodium, chloride, and bicarbonate in mEq/L. Optionally add albumin to also compute the albumin-corrected anion gap, delta gap, and delta ratio. The result reports the anion gap, delta gap, and delta ratio with an interpretation of the acid-base pattern.",
    whenToUse: [
      "Evaluating any patient with metabolic acidosis or an unexplained low bicarbonate.",
      "Screening for occult unmeasured anions in critically ill patients, such as lactate, ketoacids, or toxic alcohols.",
      "Characterizing mixed acid-base disorders with the delta gap and delta ratio."
    ],
    pearlsPitfalls: [
      "Hypoalbuminemia lowers the anion gap and can mask a high-gap acidosis; always check the albumin-corrected anion gap, since each 1 g/dL fall in albumin lowers the gap by about 2.5 mEq/L.",
      "The delta ratio refines the pattern: below 0.4 suggests pure normal-gap acidosis, 0.4-0.8 a mixed high- and normal-gap acidosis, 0.8-2.0 a pure high-gap acidosis, and above 2.0 a high-gap acidosis superimposed on metabolic alkalosis.",
      "A low or negative anion gap is abnormal too; consider paraproteinemia such as multiple myeloma, bromide or lithium ingestion, and laboratory error.",
      "The gap is assay-dependent, so know your laboratory's reference range (commonly 8-12 or 10-12 mEq/L) before calling a result high."
    ],
    whyUse: "The anion gap is the fastest bedside screen for unmeasured anions and the entry point to the differential of metabolic acidosis; the delta gap and delta ratio extend it to uncover mixed disorders that a single bicarbonate value would miss.",
    nextSteps: {
      "pure-high-gap": "Identify and treat the underlying cause of the high-gap acidosis — lactate, ketoacids, renal failure, or toxic alcohols — guided by the clinical picture. Correct the cause rather than the number; bicarbonate therapy is reserved for select severe cases.",
      "mixed-or-normal-gap": "For a pure normal-gap pattern, look for bicarbonate loss or impaired renal acid handling such as diarrhea, renal tubular acidosis, acetazolamide, or ureteral diversion. For mixed patterns, evaluate both the high-gap driver and the concurrent normal-gap or alkalotic process.",
      "high-gap-with-alkalosis": "A delta ratio above 2 indicates concurrent metabolic alkalosis, for example from vomiting, diuretics, or volume contraction. Treat the high-gap driver while addressing the alkalosis cause, and avoid over-correcting bicarbonate.",
      "calculated": "Complete the required inputs to generate the gap and delta ratio, then interpret the resulting pattern in clinical context.",
      "default": "Management of an anion gap acidosis focuses on correcting the underlying cause and varies with the specific etiology."
    },
    evidence: [
      { label: "Emmett M, Narins RG. Clinical use of the anion gap. Medicine (Baltimore). 1977;56(1):38-54.", url: "https://pubmed.ncbi.nlm.nih.gov/401925/" },
      { label: "MDCalc: Serum Anion Gap Calculator", url: "https://www.mdcalc.com/calc/1669/anion-gap" }
    ],
    creator: "The clinical anion gap concept was systematized by Michael Emmett and Robert G. Narins in their 1977 Medicine review, which established the gap as the central tool for classifying and managing metabolic acidosis."
  },
  "corrected-calcium": {
    description: "Adjusts total serum calcium for abnormal albumin using the Payne formula, estimating what the calcium would be at a normal albumin level.",
    instructions: "Enter total serum calcium in mg/dL and albumin in g/dL. The normal albumin reference defaults to 4.0 g/dL and can be changed if your laboratory uses a different reference. The corrected calcium is reported to one decimal place with its SI equivalent.",
    whenToUse: [
      "Interpreting total calcium in any patient with hypoalbuminemia or hyperalbuminemia.",
      "Screening for true hypo- or hypercalcemia in malnourished, critically ill, or nephrotic patients before ordering ionized calcium.",
      "Trending calcium status over time while albumin is fluctuating."
    ],
    pearlsPitfalls: [
      "Corrected calcium is an estimate, not a measurement; confirm with ionized calcium before acting on a markedly abnormal result, especially in critical illness, acid-base disturbances, or renal failure.",
      "The Payne formula was derived with bromocresol green albumin assays, so results can misclassify when laboratories use different albumin methods.",
      "Correction is unreliable at extremes of albumin and in the presence of paraproteins; gadolinium contrast and citrate anticoagulation can also distort total calcium."
    ],
    whyUse: "Roughly half of circulating calcium is protein-bound, so total calcium falls with albumin even when the physiologically active ionized calcium is normal; correction prevents misdiagnosis of hypocalcemia in hypoalbuminemic patients.",
    nextSteps: {
      "low": "Confirm with ionized calcium. If true hypocalcemia, evaluate common causes — vitamin D deficiency, hypoparathyroidism, renal disease, malabsorption, hypomagnesemia, drugs — and replete calcium while correcting magnesium; treat symptomatic patients urgently.",
      "normal": "Corrected calcium is within the reference range, so no calcium-specific action is needed. Continue to monitor if albumin or clinical status changes.",
      "high": "Confirm with ionized calcium and repeat the measurement. If true hypercalcemia, assess common causes — primary hyperparathyroidism, malignancy, vitamin D toxicity, thiazides, lithium, dehydration, granulomatous disease — and hydrate while pursuing the etiology.",
      "default": "If calcium is confirmed outside the normal range, pursue a diagnostic evaluation to determine the etiology."
    },
    evidence: [
      { label: "Payne RB, Little AJ, Williams RB, Milner JR. Interpretation of serum calcium in patients with abnormal serum proteins. Br Med J. 1973;4(5893):643-6.", url: "https://pubmed.ncbi.nlm.nih.gov/4758544/" },
      { label: "MDCalc: Calcium Correction for Hypoalbuminemia", url: "https://www.mdcalc.com/calc/31/calcium-correction-hypoalbuminemia" }
    ],
    creator: "R. B. Payne and colleagues derived the albumin-adjustment formula in 1973 from 200 consecutive laboratory specimens, showing that calcium corrected for albumin brought abnormal values back into the laboratory's normal range."
  },
  "crcl": {
    description: "Estimates creatinine clearance with the Cockcroft-Gault equation for drug dosing in patients with stable renal function.",
    instructions: "Enter sex, age, weight, and serum creatinine. Adding height enables BMI-based selection of actual, ideal, or adjusted body weight and reports an estimate range. Use only when renal function is stable.",
    whenToUse: [
      "Dosing renally cleared medications such as antibiotics, anticoagulants, and chemotherapeutics in adults with stable creatinine.",
      "Screening renal function before contrast studies or nephrotoxic drugs when only a basic metabolic panel is available.",
      "Estimating clearance across body weights, using the BMI-adjusted weight selection when height is known."
    ],
    pearlsPitfalls: [
      "Weight choice matters: the calculator uses actual weight when underweight, ideal body weight at normal BMI, and adjusted body weight when overweight — but controversy persists, so check which weight your drug reference expects.",
      "Do not use with unstable renal function such as AKI or rapidly changing creatinine; the equation assumes steady state.",
      "Creatinine-based estimates overestimate GFR in low muscle mass (elderly, amputees, malnutrition) and underestimate it in high muscle mass; consider cystatin C or measured clearance when precision matters.",
      "Common drug dosing cutoffs sit at 60, 45, and 30 mL/min, so small creatinine changes near these thresholds can change the dosing band."
    ],
    whyUse: "Many drug labels were written against Cockcroft-Gault clearance, so this estimate — not eGFR — remains the standard input for renal dose adjustment of numerous medications.",
    nextSteps: {
      "estimate": "Use the estimate to select the renally adjusted dose per the drug's labeling, rechecking with the most recent creatinine. Classify CKD stage separately with eGFR plus albuminuria, and refer to nephrology when eGFR is reduced or albuminuria is present.",
      "default": "Adjust renally cleared medications to the most recent kidney function estimate and monitor for accumulation or toxicity."
    },
    evidence: [
      { label: "Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron. 1976;16(1):31-41.", url: "https://pubmed.ncbi.nlm.nih.gov/1244564/" },
      { label: "Winter MA, Guhr KN, Berg GM. Impact of various body weights and serum creatinine concentrations on the bias and accuracy of the Cockcroft-Gault equation. Pharmacotherapy. 2012;32(7):604-12.", url: "https://pubmed.ncbi.nlm.nih.gov/22576791/" },
      { label: "MDCalc: Creatinine Clearance (Cockcroft-Gault)", url: "https://www.mdcalc.com/calc/43" }
    ],
    creator: "Donald W. Cockcroft and M. Henry Gault published the equation in 1976 from data on 249 patients, relating age, weight, sex, and serum creatinine to measured creatinine clearance."
  },
  "blatchford": {
    description: "Stratifies patients with upper GI bleeding by risk of needing hospital-based intervention (transfusion, endoscopy, or surgery); a score of 0 identifies low-risk patients.",
    instructions: "Enter hemoglobin, BUN, initial systolic blood pressure, sex, heart rate, and the presence of melena, recent syncope, hepatic disease, and cardiac failure. Hemoglobin scoring is sex-specific.",
    whenToUse: [
      "Risk-stratifying adults presenting with suspected upper GI bleeding in the emergency department.",
      "Identifying low-risk (score 0) patients who may be candidates for outpatient management with urgent follow-up.",
      "Prioritizing admitted patients for ICU-level care and urgent endoscopy."
    ],
    pearlsPitfalls: [
      "A score of 0 is highly sensitive for ruling out need for intervention, but clinical judgment still governs — unstable vitals or active bleeding trump the score.",
      "Resuscitate before stratifying: initial management always focuses on hemodynamic stabilization first.",
      "The score predicts need for intervention, not rebleeding or mortality; use it alongside clinical assessment.",
      "BUN rises as upper GI blood is digested, so a high BUN supports an upper source, but the score itself does not localize bleeding."
    ],
    whyUse: "The Glasgow-Blatchford score is the best-validated pre-endoscopy triage tool for upper GI bleeding, letting clinicians safely discharge truly low-risk patients while expediting care for those likely to need intervention.",
    nextSteps: {
      "low-risk": "A score of 0 marks a low-risk bleed that rarely requires transfusion, endoscopy, or surgery; outpatient management with prompt gastroenterology follow-up is reasonable in a stable, reliable patient.",
      "admit": "Admit for monitoring and resuscitation. Stratify further to decide on ICU admission and timing of endoscopy; scores of 6 or higher carry over 50% risk of needing intervention, favoring urgent endoscopy.",
      "default": "Focus initial management on hemodynamic resuscitation before risk stratification, then disposition by score."
    },
    evidence: [
      { label: "Blatchford O, Murray WR, Blatchford M. Prediction of need for treatment of upper gastrointestinal haemorrhage by clinical and laboratory features. Lancet. 2000;355(9218):1118-21.", url: "https://doi.org/10.1016/S0140-6736(00)02036-7" },
      { label: "MDCalc: Glasgow-Blatchford Bleeding Score (GBS)", url: "https://www.mdcalc.com/calc/518/glasgow-blatchford-bleeding-score-gbs" }
    ],
    creator: "Oliver Blatchford, W. R. Murray, and M. Blatchford derived the score in 2000 from clinical and laboratory features of patients presenting with upper GI hemorrhage, aiming to predict who would need treatment."
  }
};

export const SCORE_GUIDES = Object.freeze({
  ...BATCH1_GUIDES,
  ...BATCH2_GUIDES,
  ...BATCH3_GUIDES,
  ...BATCH4_GUIDES,
  ...BATCH5_GUIDES,
});
