# Clinical Workup Iteration Report

Generated: 2026-06-07T13:45:24.382Z
Setting: General medicine
Population: Adult
Modifiers: none
Intents evaluated: 1
High-severity issue cases: 0
Review-note cases: 1

## Summary

- PASS dyspnea_hf_v1: Dyspnea / heart failure or volume overload
  - safety 5, history 2, core exam 7, conditional exam 1, tests 2, red flags 2, management 18, evidence/LR 18, catalog gaps 0, retrieved 32, suppressed 25
  - issues: none
  - review notes: high_score_suppressed: Respiratory rate (183): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Lateral lung sounds (170): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.; high_score_suppressed: Blood pressure (138): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Posterior tibial pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Dorsalis pedis pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Anterior lung sounds (126): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.; high_score_suppressed: Tactile fremitus (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Anterior lung percussion (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
  - safety labels: Blood pressure; Heart rate; Respiratory rate; Oxygen saturation / support; Temperature
  - core exam labels: Posterior lung sounds; JVP; Lower extremity edema; Heart sounds; Radial pulses; Posterior thorax inspection; Work of breathing observation
  - tests/reference thresholds: Dyspnea/HF initial tests and reference thresholds; Diuresis and respiratory-support safety review
  - management-changing findings: Posterior lung sounds; JVP; Lower extremity edema; Heart sounds; Radial pulses; Posterior thorax inspection; ...

## Structured Workups

### dyspnea_hf_v1: Dyspnea / heart failure or volume overload

Status: PASS
Validated bundles: dyspnea_hf

Basic bedside data / safety checks
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25

Focused history questions
1. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? - Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
2. Is breathing worse at rest, with exertion, lying flat, during sleep, or with chest pain, cough, wheeze, fever, leg swelling, or higher oxygen need? - Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX

Core physical exam maneuvers
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
4. Heart sounds (EXAM-108-heart-sounds) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
5. Radial pulses (EXAM-100-radial-pulses) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Assesses respiratory effort and distress before deciding whether bedside support or escalation is needed.; source Stanford Medicine 25 pulmonary exam guide
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - Dyspnea workups must start with respiratory effort because distress changes oxygen, ventilatory support, monitoring, and disposition before the etiology is fully proven.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX

Conditional exam add-ons
1. PMI (EXAM-107-pmi) - Adds apical impulse only when dyspnea overlaps with heart failure, cardiomyopathy, pulmonary hypertension, or volume-overload context.; source 2022 AHA/ACC/HFSA heart failure guideline; Stanford Medicine 25 cardiac exam resources

Management-changing findings
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - Lung findings: crackles, wheeze, rhonchi, diminished sounds, asymmetry, or focal ventilation abnormality.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
4. Heart sounds (EXAM-108-heart-sounds) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
5. Radial pulses (EXAM-100-radial-pulses) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Work of breathing: accessory muscle use, retractions, asymmetry, fatigue, or distress.; source Stanford Medicine 25 pulmonary exam guide
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX
8. Dyspnea/HF initial tests and reference thresholds (REQ-dyspnea-hf-initial-tests) - HF/dyspnea etiology and safety screen: congestion/cardiomegaly or alternative disease on CXR, rhythm/ischemia on ECG, natriuretic peptide support or exclusion of HF, renal/electrolyte safety, anemia/infection, and myocardial injury.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX
9. Diuresis and respiratory-support safety review (REQ-dyspnea-diuresis-safety-tests) - Treatment-safety data: oxygen trajectory, renal function, potassium/magnesium/sodium abnormalities, acid-base or ventilatory failure, and response to diuresis or respiratory support.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX
10. Respiratory failure escalation cues (REQ-dyspnea-respiratory-failure-cues) - Impending or established respiratory failure: severe hypoxemia, escalating oxygen, fatigue, cyanosis, altered mentation, hypercapnia, or acidemia.; source ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX
11. Shock or acute heart-failure escalation cues (REQ-dyspnea-shock-acute-hf-cues) - High-risk cardiac dyspnea clue: shock, poor perfusion, oliguria, ischemia, dangerous arrhythmia, syncope, flash pulmonary edema, hypertensive emergency, or acute valvular complication.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX
12. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? (HISTORY-dyspnea_hf_v1) - Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
18. PMI (EXAM-107-pmi) - Precordial structural clue: displaced/diffuse apical impulse or visible heave in cardiomyopathy/volume-overload context.; source 2022 AHA/ACC/HFSA heart failure guideline; Stanford Medicine 25 cardiac exam resources

Limitations and interpretation cautions
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - Lung findings: crackles, wheeze, rhonchi, diminished sounds, asymmetry, or focal ventilation abnormality.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
4. Heart sounds (EXAM-108-heart-sounds) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
5. Radial pulses (EXAM-100-radial-pulses) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Work of breathing: accessory muscle use, retractions, asymmetry, fatigue, or distress.; source Stanford Medicine 25 pulmonary exam guide
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX
8. Dyspnea/HF initial tests and reference thresholds (REQ-dyspnea-hf-initial-tests) - HF/dyspnea etiology and safety screen: congestion/cardiomegaly or alternative disease on CXR, rhythm/ischemia on ECG, natriuretic peptide support or exclusion of HF, renal/electrolyte safety, anemia/infection, and myocardial injury.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX
9. Diuresis and respiratory-support safety review (REQ-dyspnea-diuresis-safety-tests) - Treatment-safety data: oxygen trajectory, renal function, potassium/magnesium/sodium abnormalities, acid-base or ventilatory failure, and response to diuresis or respiratory support.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX
10. Respiratory failure escalation cues (REQ-dyspnea-respiratory-failure-cues) - Impending or established respiratory failure: severe hypoxemia, escalating oxygen, fatigue, cyanosis, altered mentation, hypercapnia, or acidemia.; source ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX
11. Shock or acute heart-failure escalation cues (REQ-dyspnea-shock-acute-hf-cues) - High-risk cardiac dyspnea clue: shock, poor perfusion, oliguria, ischemia, dangerous arrhythmia, syncope, flash pulmonary edema, hypertensive emergency, or acute valvular complication.; source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX
12. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? (HISTORY-dyspnea_hf_v1) - Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25
18. PMI (EXAM-107-pmi) - Precordial structural clue: displaced/diffuse apical impulse or visible heave in cardiomyopathy/volume-overload context.; source 2022 AHA/ACC/HFSA heart failure guideline; Stanford Medicine 25 cardiac exam resources

Evidence / likelihood-ratio metadata
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - source Stanford Medicine 25 pulmonary exam guide; LR unavailable
2. JVP (EXAM-098-jvp) - source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
4. Heart sounds (EXAM-108-heart-sounds) - source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
5. Radial pulses (EXAM-100-radial-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - source Stanford Medicine 25 pulmonary exam guide; LR unavailable
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; SM25; AHRQ_CALIBRATE_DX; LR unavailable
8. Dyspnea/HF initial tests and reference thresholds (REQ-dyspnea-hf-initial-tests) - source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX; LR unavailable
9. Diuresis and respiratory-support safety review (REQ-dyspnea-diuresis-safety-tests) - source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX; LR unavailable
10. Respiratory failure escalation cues (REQ-dyspnea-respiratory-failure-cues) - source ESC_HF_2021; ATS_CAP_2025; IDSA_CAP_PATHWAY_2019; AHRQ_CALIBRATE_DX; LR unavailable
11. Shock or acute heart-failure escalation cues (REQ-dyspnea-shock-acute-hf-cues) - source AHA_ACC_HFSA_HF_2022; ESC_HF_2021; AHRQ_CALIBRATE_DX; LR unavailable
12. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? (HISTORY-dyspnea_hf_v1) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
13. Blood pressure (SAFETY-validated-blood-pressure) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
14. Heart rate (SAFETY-validated-heart-rate) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
15. Respiratory rate (SAFETY-validated-respiratory-rate) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
17. Temperature (SAFETY-validated-temperature) - source AHRQ_CALIBRATE_DX; AHA_ACC_HFSA_HF_2022; ESC_HF_2021; JAMA_RCE; SM25; LR unavailable
18. PMI (EXAM-107-pmi) - source 2022 AHA/ACC/HFSA heart failure guideline; Stanford Medicine 25 cardiac exam resources; LR unavailable

Catalog gaps needing review
- none

Suppressed/not-recommended items
1. Respiratory rate (183) - Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
2. Lateral lung sounds (170) - Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
3. Blood pressure (138) - Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
4. Posterior tibial pulses (137) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
5. Dorsalis pedis pulses (137) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
6. Anterior lung sounds (126) - Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
7. Tactile fremitus (125) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
8. Anterior lung percussion (125) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
9. Posterior lung percussion (122) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
10. Apical impulse inspection (105) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
11. Heart rate (104) - Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
12. Femoral pulses (100) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
13. Anterior thorax inspection (93) - Assesses respiratory effort and distress before deciding whether bedside support or escalation is needed.
14. Stethoscope cleaned (92) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
15. Carotids (92) - Carotid exam needs syncope, focal neurologic, bruit, or vascular context.
16. Vascular exam setup (86) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
17. Aortic area (82) - Individual valve-area cards are redundant when the general heart-sounds exam is already selected unless murmur/valvular disease is a specific concern.
18. Pulmonic area (82) - Individual valve-area cards are redundant when the general heart-sounds exam is already selected unless murmur/valvular disease is a specific concern.
19. Tricuspid area (82) - Individual valve-area cards are redundant when the general heart-sounds exam is already selected unless murmur/valvular disease is a specific concern.
20. Mitral area (82) - Individual valve-area cards are redundant when the general heart-sounds exam is already selected unless murmur/valvular disease is a specific concern.
21. Cardiac exam setup (77) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
22. Abdominal percussion (61) - Abdominal/CVA maneuvers need GI, flank/GU, sepsis, or endocrine-crisis context.
23. Liver edge (61) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
24. Spleen palpation (56) - Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.


## Improvement Queue

### dyspnea_hf_v1: Dyspnea / heart failure or volume overload

Review notes:
- high_score_suppressed - Respiratory rate (183): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Lateral lung sounds (170): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
- high_score_suppressed - Blood pressure (138): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Posterior tibial pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Dorsalis pedis pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Anterior lung sounds (126): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
- high_score_suppressed - Tactile fremitus (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Anterior lung percussion (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.

Basic safety checks:
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.

Focused history:
1. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? - Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.
2. Is breathing worse at rest, with exertion, lying flat, during sleep, or with chest pain, cough, wheeze, fever, leg swelling, or higher oxygen need? - Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.

Core physical exam:
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
2. JVP (EXAM-098-jvp) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.
4. Heart sounds (EXAM-108-heart-sounds) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.
5. Radial pulses (EXAM-100-radial-pulses) - Checks congestion, cardiac auscultation, and perfusion relevant to fluid and diuretic strategy.
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Assesses respiratory effort and distress before deciding whether bedside support or escalation is needed.
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - Dyspnea workups must start with respiratory effort because distress changes oxygen, ventilatory support, monitoring, and disposition before the etiology is fully proven.

Conditional:
1. PMI (EXAM-107-pmi) - Adds apical impulse only when dyspnea overlaps with heart failure, cardiomyopathy, pulmonary hypertension, or volume-overload context.

Tests / reference thresholds:
1. Dyspnea/HF initial tests and reference thresholds (REQ-dyspnea-hf-initial-tests) - Dyspnea with possible HF or volume overload needs objective cardiopulmonary testing because exam findings alone cannot reliably distinguish HF, pneumonia, COPD/asthma, PE, ischemia, renal failure, or anemia.
2. Diuresis and respiratory-support safety review (REQ-dyspnea-diuresis-safety-tests) - When dyspnea is treated as HF/volume overload, bedside exam should be paired with renal, electrolyte, oxygenation, and trajectory data so diuresis and respiratory support are safe.

Red flags / escalation cues:
1. Respiratory failure escalation cues (REQ-dyspnea-respiratory-failure-cues) - Dyspnea workups must explicitly screen for respiratory failure rather than presenting lung findings as routine descriptive exam data.
2. Shock or acute heart-failure escalation cues (REQ-dyspnea-shock-acute-hf-cues) - Possible acute HF can become a perfusion or hypertensive pulmonary-edema emergency; those findings should be explicit and management-linked.

Management-changing findings:
1. Posterior lung sounds (EXAM-092-posterior-lung-sounds) - Lung findings: crackles, wheeze, rhonchi, diminished sounds, asymmetry, or focal ventilation abnormality.
2. JVP (EXAM-098-jvp) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.
3. Lower extremity edema (EXAM-104-lower-extremity-edema) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.
4. Heart sounds (EXAM-108-heart-sounds) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.
5. Radial pulses (EXAM-100-radial-pulses) - Heart-failure/volume clue: elevated JVP, edema, S3/gallop or murmur, irregular rhythm, or perfusion deficit.
6. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Work of breathing: accessory muscle use, retractions, asymmetry, fatigue, or distress.
7. Work of breathing observation (REQ-dyspnea-work-of-breathing) - Respiratory severity: tachypnea, labored breathing, accessory muscle use, inability to speak, fatigue, cyanosis, or impending respiratory failure.
8. Dyspnea/HF initial tests and reference thresholds (REQ-dyspnea-hf-initial-tests) - HF/dyspnea etiology and safety screen: congestion/cardiomegaly or alternative disease on CXR, rhythm/ischemia on ECG, natriuretic peptide support or exclusion of HF, renal/electrolyte safety, anemia/infection, and myocardial injury.
9. Diuresis and respiratory-support safety review (REQ-dyspnea-diuresis-safety-tests) - Treatment-safety data: oxygen trajectory, renal function, potassium/magnesium/sodium abnormalities, acid-base or ventilatory failure, and response to diuresis or respiratory support.
10. Respiratory failure escalation cues (REQ-dyspnea-respiratory-failure-cues) - Impending or established respiratory failure: severe hypoxemia, escalating oxygen, fatigue, cyanosis, altered mentation, hypercapnia, or acidemia.
11. Shock or acute heart-failure escalation cues (REQ-dyspnea-shock-acute-hf-cues) - High-risk cardiac dyspnea clue: shock, poor perfusion, oliguria, ischemia, dangerous arrhythmia, syncope, flash pulmonary edema, hypertensive emergency, or acute valvular complication.
12. What changed with breathing: onset, exertional dyspnea, orthopnea or PND, cough/wheeze, chest pain, leg swelling, weight change, oxygen need, or missed diuretics? (HISTORY-dyspnea_hf_v1) - Dyspnea/heart-failure source and severity: pulmonary congestion, obstructive/infectious symptoms, ischemic symptoms, oxygen escalation, or volume change.
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.
18. PMI (EXAM-107-pmi) - Precordial structural clue: displaced/diffuse apical impulse or visible heave in cardiomyopathy/volume-overload context.

High-score suppressed candidates to review:
- Respiratory rate (183): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Lateral lung sounds (170): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
- Blood pressure (138): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Posterior tibial pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Dorsalis pedis pulses (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Anterior lung sounds (126): Differentiates congestion, wheeze, consolidation, effusion, or other pulmonary causes.
- Tactile fremitus (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Anterior lung percussion (125): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.

