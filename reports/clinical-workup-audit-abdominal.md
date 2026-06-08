# Clinical Workup Iteration Report

Generated: 2026-06-07T13:48:29.844Z
Setting: General medicine
Population: Adult
Modifiers: none
Intents evaluated: 1
High-severity issue cases: 0
Review-note cases: 1

## Summary

- PASS abdominal_pain_cramping_v1: Abdominal pain or cramping
  - safety 5, history 1, core exam 4, conditional exam 2, tests 2, red flags 2, management 16, evidence/LR 16, catalog gaps 0, retrieved 32, suppressed 26
  - issues: none
  - review notes: high_score_suppressed: Blood pressure (274): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Heart rate (268): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Mouth exam (226): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Oropharynx (223): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: CVA tenderness (204): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.; high_score_suppressed: Respiratory rate (185): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.; high_score_suppressed: Psoas sign (174): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.; high_score_suppressed: Obturator sign (171): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
  - safety labels: Blood pressure; Heart rate; Respiratory rate; Oxygen saturation / support; Temperature
  - core exam labels: Bowel sounds; Abdominal palpation; Abdominal inspection; Abdominal percussion
  - tests/reference thresholds: Abdominal pain initial tests and localization pathway; Abdominal imaging pathway by location and risk
  - management-changing findings: Bowel sounds; Abdominal palpation; Abdominal inspection; Abdominal percussion; Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas?; Abdominal pain initial tests and localization pathway; ...

## Structured Workups

### abdominal_pain_cramping_v1: Abdominal pain or cramping

Status: PASS
Validated bundles: abdominal_gi

Basic bedside data / safety checks
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD

Focused history questions
1. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? - Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX

Core physical exam maneuvers
1. Bowel sounds (EXAM-074-bowel-sounds) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.; source Open acute abdominal pain review and guideline-style public references
2. Abdominal palpation (EXAM-076-abdominal-palpation) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.; source Open acute abdominal pain review and guideline-style public references
3. Abdominal inspection (EXAM-073-abdominal-inspection) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.; source Open acute abdominal pain review and guideline-style public references
4. Abdominal percussion (EXAM-075-abdominal-percussion) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.; source Open acute abdominal pain review and guideline-style public references

Conditional exam add-ons
1. Rebound tenderness (EXAM-081-rebound-tenderness) - Makes peritoneal irritation explicit as a conditional abdominal-pain maneuver instead of hiding it until the user supplies perfect localization terms.; source MCGEE_EBPD; SM25; AHRQ_CALIBRATE_DX
2. Murphy sign (EXAM-080-murphy-sign) - Keeps biliary disease on the abdominal-pain bedside differential; perform when pain localizes to RUQ/epigastrium or biliary features are present.; source MCGEE_EBPD; SM25; WSES acute calculous cholecystitis guideline; LR+ 2.8, LR- n/a

Management-changing findings
1. Bowel sounds (EXAM-074-bowel-sounds) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
2. Abdominal palpation (EXAM-076-abdominal-palpation) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
3. Abdominal inspection (EXAM-073-abdominal-inspection) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
4. Abdominal percussion (EXAM-075-abdominal-percussion) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
5. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? (REQ-abdominal-source-severity-history) - Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
6. Abdominal pain initial tests and localization pathway (REQ-abdominal-initial-tests) - Initial abdominal-pain diagnostic data: infection/anemia, renal/electrolyte status, hepatobiliary obstruction/injury, pancreatitis, urinary/stone/pyelonephritis, pregnancy/ectopic risk, inflammatory diarrhea, sepsis, or ischemia.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX
7. Abdominal imaging pathway by location and risk (REQ-abdominal-imaging-pathway) - Imaging target: appendicitis, diverticulitis, cholecystitis/biliary obstruction, bowel obstruction/perforation, abscess, ischemia, renal colic, pelvic/ectopic disease, or low-risk non-imaging trajectory.; source ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AAFP_ACUTE_ABD_PAIN_2023; AHRQ_CALIBRATE_DX
8. Acute abdomen and surgical escalation cues (REQ-abdominal-acute-abdomen-red-flags) - High-risk abdominal process: peritonitis, obstruction, perforation, ischemia, significant GI bleed, sepsis, or high-risk host with subtle signs.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
9. Pregnancy, vascular, and extra-abdominal danger cues (REQ-abdominal-pregnancy-vascular-mimic-red-flags) - Dangerous mimic or adjacent source: ectopic pregnancy, AAA/dissection/mesenteric ischemia, torsion, ACS/PE/lower-lobe pneumonia, cholangitis, obstructed infected stone, or metabolic crisis.; source AAFP_ACUTE_ABD_PAIN_2023; ACOG_ECTOPIC_FAQ; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
10. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
11. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
12. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
13. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
14. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
15. Rebound tenderness (EXAM-081-rebound-tenderness) - Peritoneal irritation or acute abdomen: pain worse on release, guarding pattern, or worsening localized tenderness.; source MCGEE_EBPD; SM25; AHRQ_CALIBRATE_DX
16. Murphy sign (EXAM-080-murphy-sign) - Biliary or gallbladder inflammation: inspiratory arrest or focal RUQ tenderness during gallbladder palpation.; source MCGEE_EBPD; SM25; WSES acute calculous cholecystitis guideline; LR+ 2.8, LR- n/a

Limitations and interpretation cautions
1. Bowel sounds (EXAM-074-bowel-sounds) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
2. Abdominal palpation (EXAM-076-abdominal-palpation) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
3. Abdominal inspection (EXAM-073-abdominal-inspection) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
4. Abdominal percussion (EXAM-075-abdominal-percussion) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.; source Open acute abdominal pain review and guideline-style public references
5. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? (REQ-abdominal-source-severity-history) - Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
6. Abdominal pain initial tests and localization pathway (REQ-abdominal-initial-tests) - Initial abdominal-pain diagnostic data: infection/anemia, renal/electrolyte status, hepatobiliary obstruction/injury, pancreatitis, urinary/stone/pyelonephritis, pregnancy/ectopic risk, inflammatory diarrhea, sepsis, or ischemia.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX
7. Abdominal imaging pathway by location and risk (REQ-abdominal-imaging-pathway) - Imaging target: appendicitis, diverticulitis, cholecystitis/biliary obstruction, bowel obstruction/perforation, abscess, ischemia, renal colic, pelvic/ectopic disease, or low-risk non-imaging trajectory.; source ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AAFP_ACUTE_ABD_PAIN_2023; AHRQ_CALIBRATE_DX
8. Acute abdomen and surgical escalation cues (REQ-abdominal-acute-abdomen-red-flags) - High-risk abdominal process: peritonitis, obstruction, perforation, ischemia, significant GI bleed, sepsis, or high-risk host with subtle signs.; source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
9. Pregnancy, vascular, and extra-abdominal danger cues (REQ-abdominal-pregnancy-vascular-mimic-red-flags) - Dangerous mimic or adjacent source: ectopic pregnancy, AAA/dissection/mesenteric ischemia, torsion, ACS/PE/lower-lobe pneumonia, cholangitis, obstructed infected stone, or metabolic crisis.; source AAFP_ACUTE_ABD_PAIN_2023; ACOG_ECTOPIC_FAQ; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX
10. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
11. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
12. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
13. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
14. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.; source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD
15. Rebound tenderness (EXAM-081-rebound-tenderness) - Peritoneal irritation or acute abdomen: pain worse on release, guarding pattern, or worsening localized tenderness.; source MCGEE_EBPD; SM25; AHRQ_CALIBRATE_DX
16. Murphy sign (EXAM-080-murphy-sign) - Biliary or gallbladder inflammation: inspiratory arrest or focal RUQ tenderness during gallbladder palpation.; source MCGEE_EBPD; SM25; WSES acute calculous cholecystitis guideline; LR+ 2.8, LR- n/a

Evidence / likelihood-ratio metadata
1. Bowel sounds (EXAM-074-bowel-sounds) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
2. Abdominal palpation (EXAM-076-abdominal-palpation) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
3. Abdominal inspection (EXAM-073-abdominal-inspection) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
4. Abdominal percussion (EXAM-075-abdominal-percussion) - source Open acute abdominal pain review and guideline-style public references; LR unavailable
5. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? (REQ-abdominal-source-severity-history) - source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX; LR unavailable
6. Abdominal pain initial tests and localization pathway (REQ-abdominal-initial-tests) - source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; ACOG_ECTOPIC_FAQ; AHRQ_CALIBRATE_DX; LR unavailable
7. Abdominal imaging pathway by location and risk (REQ-abdominal-imaging-pathway) - source ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AAFP_ACUTE_ABD_PAIN_2023; AHRQ_CALIBRATE_DX; LR unavailable
8. Acute abdomen and surgical escalation cues (REQ-abdominal-acute-abdomen-red-flags) - source AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX; LR unavailable
9. Pregnancy, vascular, and extra-abdominal danger cues (REQ-abdominal-pregnancy-vascular-mimic-red-flags) - source AAFP_ACUTE_ABD_PAIN_2023; ACOG_ECTOPIC_FAQ; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; AHRQ_CALIBRATE_DX; LR unavailable
10. Blood pressure (SAFETY-validated-blood-pressure) - source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD; LR unavailable
11. Heart rate (SAFETY-validated-heart-rate) - source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD; LR unavailable
12. Respiratory rate (SAFETY-validated-respiratory-rate) - source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD; LR unavailable
13. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD; LR unavailable
14. Temperature (SAFETY-validated-temperature) - source AHRQ_CALIBRATE_DX; AAFP_ACUTE_ABD_PAIN_2023; ACR_RLQ_PAIN_2022; ACR_RUQ_PAIN_2022; JAMA_RCE; MCGEE_EBPD; LR unavailable
15. Rebound tenderness (EXAM-081-rebound-tenderness) - source MCGEE_EBPD; SM25; AHRQ_CALIBRATE_DX; LR unavailable
16. Murphy sign (EXAM-080-murphy-sign) - source MCGEE_EBPD; SM25; WSES acute calculous cholecystitis guideline; LR+ 2.8, LR- n/a

Catalog gaps needing review
- none

Suppressed/not-recommended items
1. Blood pressure (274) - Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
2. Heart rate (268) - Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
3. Mouth exam (226) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
4. Oropharynx (223) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
5. CVA tenderness (204) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
6. Respiratory rate (185) - Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
7. Psoas sign (174) - Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
8. Obturator sign (171) - Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
9. Sclerae and conjunctivae (164) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
10. JVP (147) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
11. Spleen palpation (131) - Spleen palpation needs splenomegaly, hematologic, malignancy, or systemic lymphadenopathy context.
12. Radial pulses (115) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
13. Lower extremity edema (112) - Edema exam needs volume, heart-failure, renal, liver/ascites, leg swelling, DVT, or endocrine-crisis context.
14. Liver edge (109) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
15. Liver span (104) - Liver edge/span needs hepatobiliary, hepatomegaly, cirrhosis, ascites, or jaundice context.
16. Posterior tibial pulses (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
17. Dorsalis pedis pulses (91) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
18. Femoral pulses (88) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
19. Otoscope exam (86) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
20. Abdominal exam setup (81) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
21. Occipital nodes (79) - Lymph-node survey needs lymphadenopathy, infection, malignancy, or neck-mass context.
22. Stethoscope cleaned (79) - Technique/setup rows are audit metadata, not a patient-specific recommended exam item.
23. Posterior lung sounds (78) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
24. Tactile fremitus (78) - Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.


## Improvement Queue

### abdominal_pain_cramping_v1: Abdominal pain or cramping

Review notes:
- high_score_suppressed - Blood pressure (274): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Heart rate (268): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Mouth exam (226): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Oropharynx (223): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - CVA tenderness (204): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- high_score_suppressed - Respiratory rate (185): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- high_score_suppressed - Psoas sign (174): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
- high_score_suppressed - Obturator sign (171): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.

Basic safety checks:
1. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
2. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
3. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
4. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.
5. Temperature (SAFETY-validated-temperature) - Basic bedside safety data required for every validated clinical workup; not a physical exam maneuver.

Focused history:
1. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? - Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.

Core physical exam:
1. Bowel sounds (EXAM-074-bowel-sounds) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.
2. Abdominal palpation (EXAM-076-abdominal-palpation) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.
3. Abdominal inspection (EXAM-073-abdominal-inspection) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.
4. Abdominal percussion (EXAM-075-abdominal-percussion) - Defines tenderness pattern, distension, bowel activity, and peritoneal concern.

Conditional:
1. Rebound tenderness (EXAM-081-rebound-tenderness) - Makes peritoneal irritation explicit as a conditional abdominal-pain maneuver instead of hiding it until the user supplies perfect localization terms.
2. Murphy sign (EXAM-080-murphy-sign) - Keeps biliary disease on the abdominal-pain bedside differential; perform when pain localizes to RUQ/epigastrium or biliary features are present.

Tests / reference thresholds:
1. Abdominal pain initial tests and localization pathway (REQ-abdominal-initial-tests) - Abdominal pain needs tests selected by localization and danger features; a generic abdominal exam alone can miss pregnancy-related, hepatobiliary, pancreatic, urinary, bleeding, septic, obstructive, or ischemic disease.
2. Abdominal imaging pathway by location and risk (REQ-abdominal-imaging-pathway) - Imaging should follow clinical localization and risk rather than a one-size-fits-all abdominal-pain checklist.

Red flags / escalation cues:
1. Acute abdomen and surgical escalation cues (REQ-abdominal-acute-abdomen-red-flags) - A clinically safe abdominal-pain workup must explicitly separate benign cramps from acute abdomen, obstruction, bleeding, ischemia, and sepsis patterns.
2. Pregnancy, vascular, and extra-abdominal danger cues (REQ-abdominal-pregnancy-vascular-mimic-red-flags) - Some dangerous abdominal-pain presentations are missed when the checklist stays inside the abdomen; pregnancy, vascular, GU, cardiopulmonary, hepatobiliary, and metabolic mimics need an explicit screen.

Management-changing findings:
1. Bowel sounds (EXAM-074-bowel-sounds) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.
2. Abdominal palpation (EXAM-076-abdominal-palpation) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.
3. Abdominal inspection (EXAM-073-abdominal-inspection) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.
4. Abdominal percussion (EXAM-075-abdominal-percussion) - Abdominal pattern: focal tenderness, guarding, rebound/peritoneal irritation, distension, altered bowel sounds, mass, or ascites clue.
5. Where is the pain worst, what changed over time, and are there fever, persistent vomiting, blood or black stool, jaundice, urinary/flank symptoms, pregnancy possibility, syncope, severe/worsening focal pain, or inability to pass stool/gas? (REQ-abdominal-source-severity-history) - Abdominal source and acuity: biliary, appendiceal, pancreatic, obstruction/ileus, GI bleed, GU/renal, pelvic/pregnancy-related, infectious/inflammatory, ischemic, or nonspecific self-limited pattern.
6. Abdominal pain initial tests and localization pathway (REQ-abdominal-initial-tests) - Initial abdominal-pain diagnostic data: infection/anemia, renal/electrolyte status, hepatobiliary obstruction/injury, pancreatitis, urinary/stone/pyelonephritis, pregnancy/ectopic risk, inflammatory diarrhea, sepsis, or ischemia.
7. Abdominal imaging pathway by location and risk (REQ-abdominal-imaging-pathway) - Imaging target: appendicitis, diverticulitis, cholecystitis/biliary obstruction, bowel obstruction/perforation, abscess, ischemia, renal colic, pelvic/ectopic disease, or low-risk non-imaging trajectory.
8. Acute abdomen and surgical escalation cues (REQ-abdominal-acute-abdomen-red-flags) - High-risk abdominal process: peritonitis, obstruction, perforation, ischemia, significant GI bleed, sepsis, or high-risk host with subtle signs.
9. Pregnancy, vascular, and extra-abdominal danger cues (REQ-abdominal-pregnancy-vascular-mimic-red-flags) - Dangerous mimic or adjacent source: ectopic pregnancy, AAA/dissection/mesenteric ischemia, torsion, ACS/PE/lower-lobe pneumonia, cholangitis, obstructed infected stone, or metabolic crisis.
10. Blood pressure (SAFETY-validated-blood-pressure) - Basic bedside safety: hypotension, hypertension, shock physiology, pain response, medication effect, or disposition-changing instability.
11. Heart rate (SAFETY-validated-heart-rate) - Basic bedside safety: tachycardia, bradycardia, irregular rhythm, shock physiology, adrenergic state, infection, pain, or medication effect.
12. Respiratory rate (SAFETY-validated-respiratory-rate) - Basic bedside safety: respiratory distress, compensation, shock physiology, acid-base stress, sedation, or cardiopulmonary deterioration.
13. Oxygen saturation / support (SAFETY-validated-oxygen-saturation) - Basic bedside safety: hypoxemia, escalating oxygen need, respiratory failure risk, shock physiology, pulmonary disease, or cardiopulmonary deterioration.
14. Temperature (SAFETY-validated-temperature) - Basic bedside safety: fever, hypothermia, infection, drug reaction, endocrine crisis, inflammatory disease, or systemic illness.
15. Rebound tenderness (EXAM-081-rebound-tenderness) - Peritoneal irritation or acute abdomen: pain worse on release, guarding pattern, or worsening localized tenderness.
16. Murphy sign (EXAM-080-murphy-sign) - Biliary or gallbladder inflammation: inspiratory arrest or focal RUQ tenderness during gallbladder palpation.

High-score suppressed candidates to review:
- Blood pressure (274): Replaced by the validated blood pressure safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Heart rate (268): Replaced by the validated heart rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Mouth exam (226): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Oropharynx (223): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- CVA tenderness (204): Not promoted because the selected validated clinical intent did not define this as a core or conditional bedside item.
- Respiratory rate (185): Replaced by the validated respiratory rate safety-floor item so basic bedside data stays separate from physical exam maneuvers.
- Psoas sign (174): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.
- Obturator sign (171): Psoas/obturator signs need RLQ, appendicitis, or pelvic-irritation concern.

