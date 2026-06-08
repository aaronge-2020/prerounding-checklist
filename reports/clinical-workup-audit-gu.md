# Clinical Workup Iteration Report

Generated: 2026-06-07T13:53:18.031Z
Setting: General medicine
Population: Adult
Modifiers: none
Intents evaluated: 1
High-severity issue cases: 0
Review-note cases: 1

## Summary

- PASS gu_renal_dysuria_v1: Dysuria, flank pain, pyelonephritis, or AKI/hypovolemia
  - safety 5, history 1, core exam 7, conditional exam 0, tests 2, red flags 2, management 17, evidence/LR 17, catalog gaps 0, retrieved 26, suppressed 19
  - issues: none
  - review notes: high_score_suppressed: Blood pressure (198): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Heart rate (186): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Oropharynx (181): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Abdominal percussion (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Spleen palpation (136): Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.; high_score_suppressed: Abdominal inspection (133): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Murphy sign (126): Murphy sign needs RUQ, biliary, gallbladder, or jaundice context.; high_score_suppressed: Rebound tenderness (126): Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.
  - safety labels: Blood pressure; Heart rate; Respiratory rate; Oxygen saturation / support; Temperature
  - core exam labels: Mouth exam; Bowel sounds; Abdominal palpation; CVA tenderness; JVP; Radial pulses; Lower extremity edema
  - tests/reference thresholds: Urine and renal-function tests; Renal obstruction and stone imaging pathway
  - management-changing findings: Mouth exam; Bowel sounds; Abdominal palpation; CVA tenderness; JVP; Radial pulses; ...

## Structured Workups

### gu_renal_dysuria_v1: Dysuria, flank pain, pyelonephritis, or AKI/hypovolemia

Status: PASS
Validated bundles: gu_renal

Basic bedside data / safety checks
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE

Focused history questions
1. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? - GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX

Core physical exam maneuvers
1. Mouth exam (EXAM-060-mouth-exam) - Assesses volume status and perfusion before fluid or diuresis decisions.; source SM25
2. Bowel sounds (EXAM-074-bowel-sounds) - Adds abdominal/GU source assessment when abdominal pain, vomiting, or urinary symptoms coexist.; source Open acute abdominal pain review and guideline-style public references
3. Abdominal palpation (EXAM-076-abdominal-palpation) - Adds abdominal/GU source assessment when abdominal pain, vomiting, or urinary symptoms coexist.; source Open acute abdominal pain review and guideline-style public references
4. CVA tenderness (EXAM-084-cva-tenderness) - Looks for pyelonephritis or renal colic when flank or urinary symptoms are present.; source PubMed study of CVA tenderness in suspected ureteral stone; NCBI acute pyelonephritis review; LR+ 1.3, LR- 0.7
5. JVP (EXAM-098-jvp) - Assesses volume status and perfusion before fluid or diuresis decisions.; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
6. Radial pulses (EXAM-100-radial-pulses) - Assesses volume status and perfusion before fluid or diuresis decisions.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - Assesses volume status and perfusion before fluid or diuresis decisions.; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources

Conditional exam add-ons
- none

Management-changing findings
1. Mouth exam (EXAM-060-mouth-exam) - Screens oral cavity; source SM25
2. Bowel sounds (EXAM-074-bowel-sounds) - murmur, abnormal heart sound, or S3/S4 clue; source Open acute abdominal pain review and guideline-style public references
3. Abdominal palpation (EXAM-076-abdominal-palpation) - peritoneal irritation or acute abdomen; source Open acute abdominal pain review and guideline-style public references
4. CVA tenderness (EXAM-084-cva-tenderness) - renal colic or pyelonephritis-associated renal tenderness; source PubMed study of CVA tenderness in suspected ureteral stone; NCBI acute pyelonephritis review; LR+ 1.3, LR- 0.7
5. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - peripheral edema pattern and volume overload clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
8. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? (REQ-gu-renal-source-severity-history) - GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX
9. Urine and renal-function tests (REQ-gu-renal-urine-renal-tests) - Urine/renal diagnostic data: pyuria/bacteriuria/hematuria, culture/susceptibility, creatinine or electrolyte abnormality, pregnancy status, systemic infection, sepsis physiology, or medication-safety constraint.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX
10. Renal obstruction and stone imaging pathway (REQ-gu-renal-imaging-pathway) - Imaging target: hydronephrosis/obstruction, ureteral stone, infected obstructed system, renal abscess, urinary retention, or alternate abdominal/pelvic pathology.; source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX
11. Urosepsis and pyelonephritis escalation cues (REQ-gu-renal-urosepsis-red-flags) - Systemic urinary infection clue: fever/rigors, flank/CVA symptoms, sepsis physiology, altered mentation, vomiting, pregnancy, immunocompromise, catheter/procedure association, resistance risk, or renal dysfunction.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; AHRQ_CALIBRATE_DX
12. Obstruction, stone, and AKI danger cues (REQ-gu-renal-obstruction-red-flags) - High-risk renal process: obstructed infected system, urinary retention, severe renal colic, solitary/transplant kidney risk, gross hematuria, worsening AKI, or dangerous electrolyte abnormality.; source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE

Limitations and interpretation cautions
1. Mouth exam (EXAM-060-mouth-exam) - Screens oral cavity; source SM25
2. Bowel sounds (EXAM-074-bowel-sounds) - murmur, abnormal heart sound, or S3/S4 clue; source Open acute abdominal pain review and guideline-style public references
3. Abdominal palpation (EXAM-076-abdominal-palpation) - peritoneal irritation or acute abdomen; source Open acute abdominal pain review and guideline-style public references
4. CVA tenderness (EXAM-084-cva-tenderness) - renal colic or pyelonephritis-associated renal tenderness; source PubMed study of CVA tenderness in suspected ureteral stone; NCBI acute pyelonephritis review; LR+ 1.3, LR- 0.7
5. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion; source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - peripheral edema pattern and volume overload clue; source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources
8. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? (REQ-gu-renal-source-severity-history) - GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX
9. Urine and renal-function tests (REQ-gu-renal-urine-renal-tests) - Urine/renal diagnostic data: pyuria/bacteriuria/hematuria, culture/susceptibility, creatinine or electrolyte abnormality, pregnancy status, systemic infection, sepsis physiology, or medication-safety constraint.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX
10. Renal obstruction and stone imaging pathway (REQ-gu-renal-imaging-pathway) - Imaging target: hydronephrosis/obstruction, ureteral stone, infected obstructed system, renal abscess, urinary retention, or alternate abdominal/pelvic pathology.; source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX
11. Urosepsis and pyelonephritis escalation cues (REQ-gu-renal-urosepsis-red-flags) - Systemic urinary infection clue: fever/rigors, flank/CVA symptoms, sepsis physiology, altered mentation, vomiting, pregnancy, immunocompromise, catheter/procedure association, resistance risk, or renal dysfunction.; source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; AHRQ_CALIBRATE_DX
12. Obstruction, stone, and AKI danger cues (REQ-gu-renal-obstruction-red-flags) - High-risk renal process: obstructed infected system, urinary retention, severe renal colic, solitary/transplant kidney risk, gross hematuria, worsening AKI, or dangerous electrolyte abnormality.; source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE

Evidence / likelihood-ratio metadata
1. Mouth exam (EXAM-060-mouth-exam) - source SM25; LR unavailable
2. Bowel sounds (EXAM-074-bowel-sounds) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
3. Abdominal palpation (EXAM-076-abdominal-palpation) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
4. CVA tenderness (EXAM-084-cva-tenderness) - source PubMed study of CVA tenderness in suspected ureteral stone; NCBI acute pyelonephritis review; LR+ 1.3, LR- 0.7
5. JVP (EXAM-098-jvp) - source Stanford Medicine 25 neck vein exam; physical examination systematic review for pulmonary hypertension; LR+ 2.47, LR- 0.42
6. Radial pulses (EXAM-100-radial-pulses) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - source 2022 AHA/ACC/HFSA heart failure guideline and public vascular/edema review sources; LR unavailable
8. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? (REQ-gu-renal-source-severity-history) - source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX; LR unavailable
9. Urine and renal-function tests (REQ-gu-renal-urine-renal-tests) - source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; AHRQ_CALIBRATE_DX; LR unavailable
10. Renal obstruction and stone imaging pathway (REQ-gu-renal-imaging-pathway) - source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX; LR unavailable
11. Urosepsis and pyelonephritis escalation cues (REQ-gu-renal-urosepsis-red-flags) - source IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; AHRQ_CALIBRATE_DX; LR unavailable
12. Obstruction, stone, and AKI danger cues (REQ-gu-renal-obstruction-red-flags) - source NICE_RENAL_STONES; EAU_URO_INFECTIONS; IDSA_CUTI_2025; AHRQ_CALIBRATE_DX; LR unavailable
13. Blood pressure (SAFETY-validated-blood-pressure) - source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE; LR unavailable
14. Heart rate (SAFETY-validated-heart-rate) - source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE; LR unavailable
15. Respiratory rate (SAFETY-validated-respiratory-rate) - source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE; LR unavailable
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE; LR unavailable
17. Temperature (SAFETY-validated-temperature) - source AHRQ_CALIBRATE_DX; IDSA_CUTI_2025; EAU_URO_INFECTIONS; ACOG_UTI_PREGNANCY_2023; NICE_RENAL_STONES; JAMA_RCE; LR unavailable

Catalog gaps needing review
- none

Suppressed/not-recommended items
1. Blood pressure (198) - Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
2. Heart rate (186) - Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
3. Oropharynx (181) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
4. Abdominal percussion (137) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
5. Spleen palpation (136) - Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.
6. Abdominal inspection (133) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
7. Murphy sign (126) - Murphy sign needs RUQ, biliary, gallbladder, or jaundice context.
8. Rebound tenderness (126) - Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.
9. Psoas sign (125) - Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
10. Obturator sign (122) - Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
11. Sclerae and conjunctivae (119) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
12. Liver edge (110) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
13. Liver span (105) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
14. Posterior tibial pulses (100) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
15. Dorsalis pedis pulses (100) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
16. Respiratory rate (100) - Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
17. Femoral pulses (99) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
18. Abdominal exam setup (76) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
19. Apical impulse inspection (75) - PMI/apical impulse is reserved for cardiac, heart-failure, or volume-overload contexts.


## Improvement Queue

### gu_renal_dysuria_v1: Dysuria, flank pain, pyelonephritis, or AKI/hypovolemia

Review notes:
- high_score_suppressed - Blood pressure (198): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Heart rate (186): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Oropharynx (181): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Abdominal percussion (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Spleen palpation (136): Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.
- high_score_suppressed - Abdominal inspection (133): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Murphy sign (126): Murphy sign needs RUQ, biliary, gallbladder, or jaundice context.
- high_score_suppressed - Rebound tenderness (126): Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.

Basic safety checks:
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.

Focused history:
1. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? - GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.

Core physical exam:
1. Mouth exam (EXAM-060-mouth-exam) - Assesses volume status and perfusion before fluid or diuresis decisions.
2. Bowel sounds (EXAM-074-bowel-sounds) - Adds abdominal/GU source assessment when abdominal pain, vomiting, or urinary symptoms coexist.
3. Abdominal palpation (EXAM-076-abdominal-palpation) - Adds abdominal/GU source assessment when abdominal pain, vomiting, or urinary symptoms coexist.
4. CVA tenderness (EXAM-084-cva-tenderness) - Looks for pyelonephritis or renal colic when flank or urinary symptoms are present.
5. JVP (EXAM-098-jvp) - Assesses volume status and perfusion before fluid or diuresis decisions.
6. Radial pulses (EXAM-100-radial-pulses) - Assesses volume status and perfusion before fluid or diuresis decisions.
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - Assesses volume status and perfusion before fluid or diuresis decisions.

Tests / reference thresholds:
1. Urine and renal-function tests (REQ-gu-renal-urine-renal-tests) - GU/renal symptoms need objective urine and renal-function data; exam alone cannot separate cystitis, pyelonephritis, stone, obstruction, AKI, pregnancy-related UTI, and urosepsis.
2. Renal obstruction and stone imaging pathway (REQ-gu-renal-imaging-pathway) - Flank pain, hematuria, AKI, or systemic UTI can require imaging when obstruction, stone, abscess, hydronephrosis, or alternate diagnosis would change urgent management.

Red flags / escalation cues:
1. Urosepsis and pyelonephritis escalation cues (REQ-gu-renal-urosepsis-red-flags) - A GU workup must distinguish uncomplicated cystitis from pyelonephritis, systemic UTI, and urosepsis because management and disposition change immediately.
2. Obstruction, stone, and AKI danger cues (REQ-gu-renal-obstruction-red-flags) - Stone/obstruction and AKI red flags should not be hidden inside CVA tenderness or volume-status exams.

Management-changing findings:
1. Mouth exam (EXAM-060-mouth-exam) - Screens oral cavity
2. Bowel sounds (EXAM-074-bowel-sounds) - murmur, abnormal heart sound, or S3/S4 clue
3. Abdominal palpation (EXAM-076-abdominal-palpation) - peritoneal irritation or acute abdomen
4. CVA tenderness (EXAM-084-cva-tenderness) - renal colic or pyelonephritis-associated renal tenderness
5. JVP (EXAM-098-jvp) - elevated right-sided filling pressure or venous congestion
6. Radial pulses (EXAM-100-radial-pulses) - perfusion deficit, vascular disease, or limb ischemia clue
7. Lower extremity edema (EXAM-104-lower-extremity-edema) - peripheral edema pattern and volume overload clue
8. Are symptoms limited to dysuria/frequency/urgency, or are there fever/chills, flank pain, nausea/vomiting, hematuria, low urine output, stone history, pregnancy possibility, catheter/procedure, immunocompromise, or prior resistant urine culture? (REQ-gu-renal-source-severity-history) - GU/renal source and severity: cystitis, pyelonephritis/systemic UTI, obstructed infected stone, renal colic, AKI/hypovolemia, catheter/procedure-associated infection, pregnancy, or resistant pathogen risk.
9. Urine and renal-function tests (REQ-gu-renal-urine-renal-tests) - Urine/renal diagnostic data: pyuria/bacteriuria/hematuria, culture/susceptibility, creatinine or electrolyte abnormality, pregnancy status, systemic infection, sepsis physiology, or medication-safety constraint.
10. Renal obstruction and stone imaging pathway (REQ-gu-renal-imaging-pathway) - Imaging target: hydronephrosis/obstruction, ureteral stone, infected obstructed system, renal abscess, urinary retention, or alternate abdominal/pelvic pathology.
11. Urosepsis and pyelonephritis escalation cues (REQ-gu-renal-urosepsis-red-flags) - Systemic urinary infection clue: fever/rigors, flank/CVA symptoms, sepsis physiology, altered mentation, vomiting, pregnancy, immunocompromise, catheter/procedure association, resistance risk, or renal dysfunction.
12. Obstruction, stone, and AKI danger cues (REQ-gu-renal-obstruction-red-flags) - High-risk renal process: obstructed infected system, urinary retention, severe renal colic, solitary/transplant kidney risk, gross hematuria, worsening AKI, or dangerous electrolyte abnormality.
13. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.
14. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.
15. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.
16. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.
17. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.

High-score suppressed candidates to review:
- Blood pressure (198): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Heart rate (186): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Oropharynx (181): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Abdominal percussion (137): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Spleen palpation (136): Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.
- Abdominal inspection (133): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Murphy sign (126): Murphy sign needs RUQ, biliary, gallbladder, or jaundice context.
- Rebound tenderness (126): Advanced abdominal maneuvers need localized abdominal, hepatobiliary, or peritoneal concern.

