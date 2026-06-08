# Clinical Workup Iteration Report

Generated: 2026-06-07T13:40:11.743Z
Setting: General medicine
Population: Adult
Modifiers: none
Intents evaluated: 1
High-severity issue cases: 0
Review-note cases: 1

## Summary

- PASS suspected_pe_v1: Suspected pulmonary embolism
  - safety 5, history 1, core exam 8, conditional exam 0, tests 2, red flags 2, management 18, evidence/LR 18, catalog gaps 0, retrieved 40, suppressed 32
  - issues: none
  - review notes: high_score_suppressed: Respiratory rate (176): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Blood pressure (167): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Posterior lung sounds (164): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.; high_score_suppressed: Lower extremity edema (131): Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.; high_score_suppressed: Heart rate (129): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Anterior lung sounds (123): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.; high_score_suppressed: Tactile fremitus (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Anterior lung percussion (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
  - safety labels: Blood pressure; Heart rate; Respiratory rate; Oxygen saturation / support; Temperature
  - core exam labels: Lateral lung sounds; JVP; Heart sounds; Posterior tibial pulses; Dorsalis pedis pulses; Radial pulses; Femoral pulses; Posterior thorax inspection
  - tests/reference thresholds: PE probability, D-dimer, and imaging pathway; DVT and right-heart strain evaluation
  - management-changing findings: Lateral lung sounds; JVP; Heart sounds; Posterior tibial pulses; Dorsalis pedis pulses; Radial pulses; ...

## Structured Workups

### suspected_pe_v1: Suspected pulmonary embolism

Status: PASS
Validated bundles: suspected_pe; chest_pain

Basic bedside data / safety checks
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE

Focused history questions
1. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? - PE/DVT probability and treatment safety: cardiopulmonary symptoms, VTE risk factors, prior clot, DVT symptoms, and anticoagulation or thrombolysis contraindications.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX

Core physical exam maneuvers
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Heart sounds (EXAM-108-heart-sounds) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Radial pulses (EXAM-100-radial-pulses) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Femoral pulses (EXAM-101-femoral-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.; source Stanford Medicine 25 pulmonary exam guide

Conditional exam add-ons
- none

Management-changing findings
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Heart sounds (EXAM-108-heart-sounds) - focal consolidation, effusion, wheeze, work of breathing, or ventilation abnormality; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Femoral pulses (EXAM-101-femoral-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.; source Stanford Medicine 25 pulmonary exam guide
9. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? (REQ-pe-risk-and-bleeding-history) - PE/DVT probability and treatment safety: cardiopulmonary symptoms, VTE risk factors, prior clot, DVT symptoms, and anticoagulation or thrombolysis contraindications.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX
10. PE probability, D-dimer, and imaging pathway (REQ-pe-probability-d-dimer-imaging) - Diagnostic pathway selection: low/intermediate probability with D-dimer rule-out potential versus high probability or unstable PE requiring imaging/escalation.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS
11. DVT and right-heart strain evaluation (REQ-pe-dvt-rv-strain-workup) - VTE confirmation and PE severity: proximal DVT evidence, right ventricular strain, myocardial injury, hemodynamic compromise, and oxygenation trend.; source ESC_PE_2019; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS
12. High-risk PE escalation cues (REQ-pe-hemodynamic-escalation-cues) - High-risk PE physiology: shock, hypotension, syncope, severe hypoxemia, altered mentation, persistent tachycardia/tachypnea, RV strain, or arrest.; source ESC_PE_2019; ACEP_VTE_POLICY; AHRQ_CALIBRATE_DX
13. Anticoagulation and thrombolysis safety cues (REQ-pe-anticoagulation-safety-cues) - Treatment-risk context: bleeding risk, recent surgery/trauma, intracranial risk, severe hypertension, pregnancy/postpartum, renal/contrast limitation, fall risk, or pending procedure.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX
14. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
15. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
16. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
17. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
18. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE

Limitations and interpretation cautions
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.; source Stanford Medicine 25 pulmonary exam guide
2. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Heart sounds (EXAM-108-heart-sounds) - focal consolidation, effusion, wheeze, work of breathing, or ventilation abnormality; source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Femoral pulses (EXAM-101-femoral-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.; source Stanford Medicine 25 pulmonary exam guide
9. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? (REQ-pe-risk-and-bleeding-history) - PE/DVT probability and treatment safety: cardiopulmonary symptoms, VTE risk factors, prior clot, DVT symptoms, and anticoagulation or thrombolysis contraindications.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX
10. PE probability, D-dimer, and imaging pathway (REQ-pe-probability-d-dimer-imaging) - Diagnostic pathway selection: low/intermediate probability with D-dimer rule-out potential versus high probability or unstable PE requiring imaging/escalation.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS
11. DVT and right-heart strain evaluation (REQ-pe-dvt-rv-strain-workup) - VTE confirmation and PE severity: proximal DVT evidence, right ventricular strain, myocardial injury, hemodynamic compromise, and oxygenation trend.; source ESC_PE_2019; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS
12. High-risk PE escalation cues (REQ-pe-hemodynamic-escalation-cues) - High-risk PE physiology: shock, hypotension, syncope, severe hypoxemia, altered mentation, persistent tachycardia/tachypnea, RV strain, or arrest.; source ESC_PE_2019; ACEP_VTE_POLICY; AHRQ_CALIBRATE_DX
13. Anticoagulation and thrombolysis safety cues (REQ-pe-anticoagulation-safety-cues) - Treatment-risk context: bleeding risk, recent surgery/trauma, intracranial risk, severe hypertension, pregnancy/postpartum, renal/contrast limitation, fall risk, or pending procedure.; source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX
14. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
15. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
16. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
17. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE
18. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE

Evidence / likelihood-ratio metadata
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - source Stanford Medicine 25 pulmonary exam guide; LR unavailable
2. JVP (EXAM-098-jvp) - source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
3. Heart sounds (EXAM-108-heart-sounds) - source JAMA Rational Clinical Examination heart failure review; Stanford Medicine 25 cardiac second sounds; LR+ 11, LR- n/a
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
6. Radial pulses (EXAM-100-radial-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
7. Femoral pulses (EXAM-101-femoral-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - source Stanford Medicine 25 pulmonary exam guide; LR unavailable
9. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? (REQ-pe-risk-and-bleeding-history) - source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX; LR unavailable
10. PE probability, D-dimer, and imaging pathway (REQ-pe-probability-d-dimer-imaging) - source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; LR unavailable
11. DVT and right-heart strain evaluation (REQ-pe-dvt-rv-strain-workup) - source ESC_PE_2019; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; LR unavailable
12. High-risk PE escalation cues (REQ-pe-hemodynamic-escalation-cues) - source ESC_PE_2019; ACEP_VTE_POLICY; AHRQ_CALIBRATE_DX; LR unavailable
13. Anticoagulation and thrombolysis safety cues (REQ-pe-anticoagulation-safety-cues) - source ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; AHRQ_CALIBRATE_DX; LR unavailable
14. Blood pressure (SAFETY-validated-blood-pressure) - source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE; LR unavailable
15. Heart rate (SAFETY-validated-heart-rate) - source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE; LR unavailable
16. Respiratory rate (SAFETY-validated-respiratory-rate) - source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE; LR unavailable
17. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE; LR unavailable
18. Temperature (SAFETY-validated-temperature) - source AHRQ_CALIBRATE_DX; ESC_PE_2019; ACEP_VTE_POLICY; ASH_VTE_DIAGNOSIS; CDC_VTE_DIAGNOSIS; JAMA_RCE; LR unavailable

Catalog gaps needing review
- none

Suppressed/not-recommended items
1. Respiratory rate (176) - Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
2. Blood pressure (167) - Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
3. Posterior lung sounds (164) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
4. Lower extremity edema (131) - Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.
5. Heart rate (129) - Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
6. Anterior lung sounds (123) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
7. Tactile fremitus (121) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
8. Anterior lung percussion (121) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
9. Posterior lung percussion (115) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
10. Liver span (100) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
11. Abdominal percussion (99) - Abdominal/CVA maneuvers need GI, flank/GU, sepsis, or endocrine-crisis context.
12. Apical impulse inspection (97) - PMI/apical impulse is reserved for cardiac, heart-failure, or volume-overload contexts.
13. Spleen palpation (94) - Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.
14. Stethoscope cleaned (92) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
15. Aortic area (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
16. Pulmonic area (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
17. Tricuspid area (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
18. Mitral area (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
19. Liver edge (90) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
20. Anterior thorax inspection (89) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
21. PMI (87) - PMI/apical impulse is reserved for cardiac, heart-failure, or volume-overload contexts.
22. Vascular exam setup (73) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
23. Cardiac exam setup (73) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
24. Carotids (52) - Carotid exam needs syncope, focal neurologic, bruit, or vascular context.


## Improvement Queue

### suspected_pe_v1: Suspected pulmonary embolism

Review notes:
- high_score_suppressed - Respiratory rate (176): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Blood pressure (167): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Posterior lung sounds (164): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
- high_score_suppressed - Lower extremity edema (131): Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.
- high_score_suppressed - Heart rate (129): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Anterior lung sounds (123): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
- high_score_suppressed - Tactile fremitus (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Anterior lung percussion (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.

Basic safety checks:
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.

Focused history:
1. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? - PE/DVT probability and treatment safety: cardiopulmonary symptoms, VTE risk factors, prior clot, DVT symptoms, and anticoagulation or thrombolysis contraindications.

Core physical exam:
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
2. JVP (EXAM-098-jvp) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.
3. Heart sounds (EXAM-108-heart-sounds) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.
6. Radial pulses (EXAM-100-radial-pulses) - Assesses rhythm, murmur, heart failure/strain, and perfusion clues.
7. Femoral pulses (EXAM-101-femoral-pulses) - Checks unilateral swelling or vascular findings relevant to VTE probability and anticoagulation framing.
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.

Tests / reference thresholds:
1. PE probability, D-dimer, and imaging pathway (REQ-pe-probability-d-dimer-imaging) - Suspected PE testing should be anchored to clinical probability so low-risk patients avoid unnecessary imaging while high-risk or unstable patients are escalated promptly.
2. DVT and right-heart strain evaluation (REQ-pe-dvt-rv-strain-workup) - The bedside workup should connect leg findings and cardiopulmonary severity to DVT confirmation and PE risk stratification.

Red flags / escalation cues:
1. High-risk PE escalation cues (REQ-pe-hemodynamic-escalation-cues) - Suspected PE must screen for high-risk physiology because unstable PE changes the pathway from routine confirmation to urgent escalation.
2. Anticoagulation and thrombolysis safety cues (REQ-pe-anticoagulation-safety-cues) - A PE workup must document treatment-safety constraints because the diagnostic and management pathway often hinges on anticoagulation and sometimes thrombolysis.

Management-changing findings:
1. Lateral lung sounds (EXAM-093-lateral-lung-sounds) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.
2. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion
3. Heart sounds (EXAM-108-heart-sounds) - focal consolidation, effusion, wheeze, work of breathing, or ventilation abnormality
4. Posterior tibial pulses (EXAM-102-posterior-tibial-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.
5. Dorsalis pedis pulses (EXAM-103-dorsalis-pedis-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue
7. Femoral pulses (EXAM-101-femoral-pulses) - DVT clue: asymmetric leg swelling/tenderness/perfusion abnormality or limb-risk finding.
8. Posterior thorax inspection (EXAM-089-posterior-thorax-inspection) - Respiratory distress, wheeze, crackles, focal diminished sounds, or other findings that point to PE severity or competing lung diagnoses.
9. Any sudden shortness of breath, pleuritic chest pain, hemoptysis, syncope, prior VTE, recent surgery/immobility/travel, estrogen or pregnancy/postpartum state, cancer, unilateral leg swelling or pain, or bleeding risk? (REQ-pe-risk-and-bleeding-history) - PE/DVT probability and treatment safety: cardiopulmonary symptoms, VTE risk factors, prior clot, DVT symptoms, and anticoagulation or thrombolysis contraindications.
10. PE probability, D-dimer, and imaging pathway (REQ-pe-probability-d-dimer-imaging) - Diagnostic pathway selection: low/intermediate probability with D-dimer rule-out potential versus high probability or unstable PE requiring imaging/escalation.
11. DVT and right-heart strain evaluation (REQ-pe-dvt-rv-strain-workup) - VTE confirmation and PE severity: proximal DVT evidence, right ventricular strain, myocardial injury, hemodynamic compromise, and oxygenation trend.
12. High-risk PE escalation cues (REQ-pe-hemodynamic-escalation-cues) - High-risk PE physiology: shock, hypotension, syncope, severe hypoxemia, altered mentation, persistent tachycardia/tachypnea, RV strain, or arrest.
13. Anticoagulation and thrombolysis safety cues (REQ-pe-anticoagulation-safety-cues) - Treatment-risk context: bleeding risk, recent surgery/trauma, intracranial risk, severe hypertension, pregnancy/postpartum, renal/contrast limitation, fall risk, or pending procedure.
14. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.
15. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.
16. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.
17. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.
18. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.

High-score suppressed candidates to review:
- Respiratory rate (176): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Blood pressure (167): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Posterior lung sounds (164): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
- Lower extremity edema (131): Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.
- Heart rate (129): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Anterior lung sounds (123): Checks work of breathing and alternate pulmonary diagnoses while PE remains on the table.
- Tactile fremitus (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Anterior lung percussion (121): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.

