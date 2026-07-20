# Daily Progress Note Instructions

Write a concise, decision-focused daily progress note in **strict SOAP format with strict separation between sections** for the primary team. Use the selected hospital day as the primary source of truth. Lead with what changed, what matters for that hospital day, and what decision or action follows.

Use the admission packet only to identify relevant baseline conditions, the reason for admission, recent procedures, and unresolved active problems. Do not summarize the full hospital course, reproduce prior notes, or include resolved problems unless they affect the selected hospital day’s decisions.

Target a brief attending presentation. If the note would become long, shorten stable, chronic, resolved, or background problems first. Never truncate the note.

Complete every required section before adding detail. If space is limited, omit or compress lower-priority problems rather than beginning a bullet or section that cannot be completed. The output must end with a complete Plan and one-sentence Disposition.

Use this compression hierarchy:

* One-liner: one sentence, approximately 20–30 words.
* Subjective: only major interval events and management-relevant symptoms.
* Objective: only decision-changing trends, findings, and diagnostics.
* Assessment: one brief global trajectory statement only.
* Plan: only actions required for the selected hospital day.

Output only these sections, in this order: One-Liner, Subjective, Objective, Assessment, Plan, and Disposition. Do not generate a discharge-medications section unless the task explicitly requests discharge medication reconciliation.

Use only information present in this prompt. If required information is absent, omit it or state that it is not documented. Never reconstruct missing clinical data from prior examples, memory, or general medical knowledge.

## Section Ownership Rules (No Cross-Section Repetition)

Assign every fact to exactly **one** section. Classify information by how it was obtained:

| Information | Owned by | Do NOT repeat in |
|---|---|---|
| Patient/nursing-reported symptoms, status, and significant overnight/interval events | Subjective | Objective, Assessment |
| Clinician-observed, measured, laboratory, imaging, or monitor data | Objective | Subjective, Assessment |
| Global clinical trajectory | Assessment | Subjective, Objective |
| Problem-specific clinical reasoning | Plan (under that problem) | Subjective, Objective, top-level Assessment |
| Orders, medications, actions | Plan | Assessment |

If a patient reports discomfort only when an examiner presses, moves, or otherwise examines an area, document it as an objective examination finding—not a subjective symptom. When multiple active problems share management, group them under one problem heading in the Plan.

Before Subjective, begin with one sentence of approximately 20–30 words containing age, sex, hospital day, reason for admission, and only 2–4 comorbidities or recent interventions relevant to the selected hospital day’s active problems. Do not include medication doses, complete antithrombotic regimens, prior test results, or resolved diagnoses. Do not repeat it elsewhere.

## **Subjective** *(High Yield for Rounds)*

Organize Subjective in this order:

* **Overnight/Interval Events:** Important events reported by the patient, nursing, or cross-cover, including major clinical events and completed interventions. State each event once and concisely; place supporting objective values and data in Objective.
* **Patient Self-Report:** How the patient feels and meaningful changes since the prior hospital day.
* **Pertinent Subjective Positives/Negatives:** Only spontaneous, patient-experienced symptoms or history items that affect the selected hospital day's assessment or plan.

Do not include physical-exam findings or examination qualifiers in Subjective. Phrases such as “on exam,” “with palpation,” “with movement,” or “per examination” belong only in Objective. Findings elicited by examination—such as tenderness to palpation, guarding, edema, breath sounds, pulses, strength, or range of motion—remain objective even when the patient reports discomfort during the examination. Do not include vital signs, laboratory values, imaging, provider interpretation, consultant recommendations, or treatment plans.

If a symptom is absent at rest but reproduced during examination, document only the spontaneous symptom in Subjective and omit the examination-provoked symptom from Subjective. Never use examination terms—including tenderness, palpation, edema, pulses, guarding, range of motion, strength, or movement—in Subjective, including in parentheses.

Keep this section brief. Include only new or clinically meaningful reported information that changes diagnosis, management, risk assessment, symptom trajectory, or disposition. Remove routine functional details, repeated symptoms, unchanged review-of-systems details, and negative symptoms that do not narrow the differential, change management, or establish clinical stability.

Do not reproduce a long review of systems. Combine related negative symptoms into a concise statement and omit routine appetite, sleep, voiding, or functional details unless they affect management or disposition.

---

## Objective

Organize Objective in this order:

* **Vitals/Clinical Support:** Include clinically relevant vital signs, oxygen requirement, or other support needs. When applicable, include the current value, direction of change, and relevant baseline or prior value.
* **Focused Exam:** Include only new, changed, abnormal, or management-relevant observed findings. Do not include a complete system-by-system examination. Omit normal findings unless they rule out an important competing concern.
* **Key Labs/Diagnostics:** Include only laboratory values, imaging, microbiology, or diagnostics whose current value, trend, or comparison with baseline changes or supports the selected hospital day's diagnosis, assessment, or management.

Include objective data only when it changes, confirms, refutes, or meaningfully contextualizes a current clinical decision. Do not include a value merely because it is abnormal. Omit predictable chronic abnormalities and expected treatment-related findings unless they alter diagnosis, risk, treatment, monitoring, or disposition. When a comparison is clinically relevant, give the current value, direction of change, or relevant baseline/prior value.

Report findings objectively without interpretation. Exclude patient statements, assessment, and treatment plans.

Do not place medication lists, line ages, routine device details, or predictable normal findings in Objective unless they directly affect a decision for the selected hospital day.

Do not reproduce historical vital-sign tables, complete laboratory panels, old microbiology reports, or prior normal examinations. Include only the current value and the most relevant trend, baseline, threshold, or comparison.

Do not include General, Cardiac, Respiratory, Neurologic, Lines, or normal extremity findings unless abnormal or directly relevant to an active decision. Do not include line age, catheter age, type-and-screen expiration, crossmatch status, or routine normal findings unless they change management.

---

## **Assessment** *(Global Trajectory Only)*

Use this section only for a brief global synthesis of the patient’s overall trajectory on the selected hospital day. State whether the patient is improving, worsening, or unchanged and identify the dominant active issue driving care. Do not provide separate problem-by-problem assessments here; those belong under the corresponding problem in Plan.

---

## **Plan** *(Highest Yield for Rounds)*

Prioritize problems from most to least important.

### Acute Problems

Organize the Plan by active clinical problem, ordered from highest to lowest priority. Give the most detail to the problem driving the selected hospital day’s decisions; summarize stable, chronic, or resolved problems in one concise line unless they require a new action. Use one heading per problem. Under each heading, first provide a problem-specific **Assessment** and then the applicable action categories below.

For the problem-specific Assessment, explain the clinical reasoning—not just the diagnosis. For the dominant problem, use 2–3 sentences describing what is happening, severity and trajectory, leading diagnosis or interpretation, the most relevant competing explanation if it would change management, the key supporting evidence, and why it matters today. Use 1–2 sentences for lower-priority active problems and one sentence for stable or resolved problems only when they affect care. Distinguish physiologic stability from absence of disease activity and identify management tensions when relevant. Do not repeat the entire Objective section or include unsupported causal claims.

Keep the problem-specific Assessment separate from action. Do not place orders, medication changes, monitoring instructions, consultation requests, escalation thresholds, or if/then contingencies in the problem-specific Assessment. Use only diagnoses and interpretations supported by the provided chart context. Do not independently introduce guideline names, literature-based recommendations, treatment thresholds, differential diagnoses, or management changes. If the chart does not specify a threshold, use qualitative language rather than inventing a number.

After the problem-specific Assessment, state the primary action or decision first. Use only the applicable action categories below, in this exact order. Omit any category with no specific action items, and keep every bullet brief and actionable:

* **Treatment/Medications:** Medications organized under the disease they treat, with dose, route, frequency, and indication; and relevant supportive care.
* **Diagnostics:** Daily or follow-up laboratory studies, imaging, microbiology, or other diagnostic studies.
* **Monitoring:** Clinical monitoring, vital-sign goals, intake/output, trending labs, or response-to-treatment checks.
* **Consults/Procedures:** Consultant recommendations, requested consultations, and planned procedures.
* **Contingencies:** If/then escalation or de-escalation plans when appropriate.
* **Discharge Needs:** Problem-specific discharge readiness, medication decisions, follow-up, services, or barriers when relevant.

Do not repeat history, examination findings, labs, or clinical reasoning. The Plan is an action list, not a narrative: use one concise bullet per distinct action, combine actions serving the same objective, and do not generate a fixed number of bullets or explanations for every problem. Do not create a separate problem when its actions are already covered under another problem; combine problems that share the same decision, medication change, monitoring strategy, or contingency. Use no more than one or two bullets per applicable subheading. Include contingencies only when a foreseeable change would alter management. Include a differential or rationale only when it changes the next action. Do not cite guidelines or explain standard-of-care rationale unless specifically requested or unless the recommendation is controversial, high-risk, or directly relevant to a management decision.

Every Plan bullet must state one action, monitoring task, decision, consultation, or contingency. Do not include explanatory paragraphs, guideline citations, or repeated rationale. Place each medication change, consultation, and escalation decision under one primary problem only; under related problems, document only the consequence or monitoring implication. Do not populate every category for every problem. Prefer one combined action bullet over multiple related bullets. Stable or resolved problems should receive one brief line or be omitted if they require no action.

### Chronic Problems

* Summarize stable chronic conditions in one concise line when they require no new action.
* Include only active inpatient management or medication adjustments.

### Preventive Care

Include only if relevant:

* DVT prophylaxis
* GI prophylaxis
* Code status
* Other inpatient preventive measures

---

## Final Quality Check

Before finalizing, verify that:

* The one-liner appears only once before Subjective.
* Subjective contains only reported events and spontaneous symptoms.
* Examination findings, measurements, and test results appear only in Objective.
* Every included objective datum affects interpretation or management.
* Every Plan bullet describes an action, monitoring task, decision, or clinically necessary contingency.
* No fact is repeated across sections.
* No sentence or bullet can be removed without losing a clinically meaningful decision.
* The top-level Assessment contains only global trajectory; each individual problem’s reasoning appears under that problem in Plan.
* Every section, bullet, and sentence is complete; do not end mid-sentence or mid-bullet.
* The note includes a complete Disposition statement.
* The selected hospital day, rather than the full historical packet, drives the note.
* No unsupported guideline, threshold, diagnosis, or management recommendation was added.
* The output contains only the required sections and does not include discharge medication reconciliation unless requested.

---

## Disposition

One sentence describing the anticipated discharge plan and barrier(s) to discharge based on the patient's clinical trajectory, medical stability, remaining inpatient needs, rehabilitation needs, and social situation.

---


## Discharge Medications *(Only if explicitly requested; otherwise do not generate)*

List only medications requiring a discharge decision. Do **not** recreate the full medication reconciliation.

Organize into four categories:

* **Continue:** Home medications to continue unchanged.
* **Start:** New medications (include dose, frequency, duration if applicable, and indication).
* **Change:** Home medications with dose/frequency changes (briefly state why).
* **Hold/Stop:** Medications to discontinue or temporarily hold (include reason and restart instructions if known).

Finally, note any required outpatient medication monitoring (e.g., CBC, BMP, INR, blood pressure, glucose) or patient counseling (e.g., complete antibiotics, avoid NSAIDs).

Keep this section brief and focused on medications that require action at discharge.

---

# Presentation Priorities *(Internal guidance; do not output as a separate section)*

### **Bold (Speak During Rounds)**

* **Subjective one-liner**
* **Major overnight events**
* **Assessment**
* **Acute problem list**
* **Major changes to the selected hospital day's plan**
* **Disposition**

### Keep Primarily for Documentation

* Detailed vitals
* Full physical exam
* Complete laboratory values
* Medication lists
* Chronic stable conditions
* Preventive care
* Consultant details unless they changed management

# General Rules

* Eliminate repetition — apply the Section Ownership Rules above; each fact appears exactly once, in its owning section.
* Prioritize information that changes diagnosis, management, or disposition.
* Use headings and bullet points for readability.
* Organize medications under the disease they treat—not as a separate medication list.
* Group related chronic/stable problems together when they share management, rather than listing each as its own bullet.
* Assume the attending only wants the highest-yield clinical information.
