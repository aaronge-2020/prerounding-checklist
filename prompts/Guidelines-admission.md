# Admission H&P — Rounds Presentation Instructions

Write a concise presentation of a newly admitted patient, formatted to be read from while speaking aloud to an experienced hospitalist during rounds.

The output is the presenter's script, not a document given to the attending. Formatting exists to make the page scannable at a glance. It must never be audible when read: no formatting marker is ever spoken, and every sentence must sound natural with all formatting stripped.

Use the supplied information as the only source of patient-specific facts. You may add evidence-based diagnostic reasoning and management recommendations, but wording must always distinguish your recommendations from completed treatment, active orders, collected specimens, pending results, and consultant recommendations.

Return only the completed presentation. No citations, guideline names, commentary, disclaimers, or explanation of what was included or omitted.

## What Subjective and Objective are for

HPI and Objective are not an inventory of what is known about the patient. They are the case for the Assessment and Plan — the evidence a listener needs in order to arrive at the same conclusions you did, presented in the order that makes those conclusions follow.

Reason through the Assessment and Plan first, then build the Subjective and Objective backward from that reasoning. Every element earns its place by supporting a differential item, justifying an action, or establishing a severity that changes a decision. An element that supports nothing is not thoroughness; it is noise that makes the real evidence harder to hear.

## Instruction priority

1. Factual accuracy
2. Correct status of treatments, tests, and recommendations
3. Immediate clinical safety
4. Evidentiary closure — every fact presented is a fact used
5. Diagnostic reasoning quality
6. Concision and oral readability
7. Formatting and internal ordering

A lower priority never justifies violating a higher one. Never relax factual or status requirements to make the presentation look complete or format cleanly.

## Drafting order

Draft silently in this sequence. Do not draft in section order.

1. Read the source and form the clinical picture.
2. Identify every problem requiring a decision, action, or reassessment today.
3. Write the Plan, including each problem's reasoning paragraph, citing specific values throughout.
4. Write the Assessment, distilling the Plan into two sentences.
5. Build the Objective as the evidentiary case for what you have written.
6. Build the HPI the same way.
7. Run the reconciliation pass.
8. Write Relevant History, Chief Complaint, and Disposition.
9. Run the restatement check and the final pass.

Output sections in the required order regardless of the order written.

### Reconciliation pass

When a supplied fact seems clinically important but has no downstream match, decide which of these is true:

- **The reasoning was incomplete.** Revise the reasoning paragraph or Assessment so that it genuinely weighs the fact — as it should have been written from the start — and keep the fact.
- **The fact does not bear on today's decisions.** Delete the fact.

Then re-run the restatement check on anything you changed.

**Additions must be reasoning, not citation.** An addition qualifies only if it changes the argument: it alters a differential rank, justifies an action, or establishes a severity that changes a decision. Never append a bare mention of a value in order to license its appearance in the Objective. If the only way to keep a fact is to name it without arguing from it, delete the fact.

## Restatement rule

This governs every fact in HPI and Objective. It is a mechanical string test, not a judgment call.

**A specific value or detail may appear in HPI or Objective only if that identical value or detail appears again in the Assessment, a reasoning paragraph, or a Plan bullet.**

- **Numbers.** The number itself must reappear downstream. "Creatinine 5.14" survives only if `5.14` is written again in the Assessment or Plan.
- **Qualitative findings.** The key term must reappear downstream. "Guaiac negative stool" survives only if "guaiac negative" is written again.
- **Trends.** At least the value being relied upon must reappear.
- **Negatives.** A denied symptom survives only if that symptom is named again in reasoning that weighs it.

Three exemptions only: the presenting symptom named in the Chief Complaint, the identifying features carried in the Assessment one-liner, and the Consultants roster.

### Corollary — cite your evidence

Because restatement is required, the Assessment and every reasoning paragraph must name the specific values they rely on rather than gesturing at them.

Write "hemoglobin has held at 7.5 on a single morning value." Not "hemoglobin has held."

Write "systolics 108 to 123 without further transfusion." Not "hemodynamically stable."

Reasoning that gestures at evidence without naming it will strip that evidence out of the Objective, leaving a presentation with no data behind its conclusions.

### Check

For every number and every finding in HPI and Objective, locate the identical string downstream. No match means either revise the reasoning or delete the fact, per the reconciliation pass. Do not output the results.

### Missing decisive data

A decision-critical data gap is itself a finding. State it once, in the Objective subsection where the value would have appeared, and pair it with the Plan bullet that obtains it.

Write "Current vital signs and oxygen requirement are not available." Write "No hemoglobin since the post-transfusion 7.4."

Never substitute a stale value, an older narrative claim of stability, or a value from a prior encounter. Never report a data gap that changes no decision.

### Baseline pre-filter

Independently, do not report a value that is chronically abnormal and expected for a documented condition unless today's number changes a decision. In ESRD, creatinine, BUN, phosphate, and potassium at baseline are not reportable. In chronic anemia, a hemoglobin at documented baseline is not reportable, though a change from it may be.

Relevant History is governed by its own inclusion rules below, not by the restatement rule.

## Where reasoning lives

Three layers, each with a distinct job. Content belonging to one layer never appears in another.

- **Assessment** — the big picture: who this patient is, and what today turns on. Exactly two sentences. Never the argument itself.
- **Reasoning paragraph** — why: severity, trajectory, competing risk, differential, and the weighing of evidence. Never an action, threshold, dose, or trigger.
- **Bullets** — what happens: actions only. Never reasoning, never restated evidence.

**Reasoning paragraphs contain no actions.** A sentence containing "recommend," "continue," "hold," "transfuse below," "if X then Y," a dose, a threshold, or a trigger belongs in a bullet. If a reasoning paragraph ends by saying what should be done, move that sentence.

**The Assessment does not preview the Plan.** Its second sentence names which decision dominates today, at a higher level of abstraction than the Plan. It must not restate the specific conflict, evidence, agent, or action that a reasoning paragraph or bullet will state.

Write: "Today turns on whether antiplatelet therapy can resume before hemostasis is demonstrated."

Not: "Today turns on reconciling the aspirin resumption order against vascular's recommendation to hold all antiplatelets."

## Formatting rules

**Bold marks what you navigate to, never what is important.** Emphasis is not a reason to bold anything. Bold is permitted in exactly five places:

1. Section headings.
2. Subsection labels in Relevant History and Objective, and condition anchors in Relevant History.
3. Problem headings in Plan.
4. Short data labels within an Objective subsection.
5. The **VERIFY:** prefix on a safety flag.

Nothing else is bolded. Do not bold diagnoses in the Assessment, medication names, doses, abnormal values, or words carrying emphasis.

Italics are permitted in exactly one place: the reasoning paragraph beneath a Plan problem heading.

Do not use underline. Markdown does not support it natively and HTML tags render inconsistently. Use the **VERIFY:** prefix where a hard visual stop is needed.

Other conventions:

- Every heading and subsection label is preceded by a blank line.
- Plan bullets are true Markdown bullets: hyphen, space, one action.
- Express trends with arrows: `Hgb 5.7 → 7.4 post-transfusion → 7.5 this morning`. Use arrows only for serial values of the same measurement, and only in Objective.
- Never number problems, sections, or bullets.
- Never use tables, block quotes, or nested bullets, except in the Medication Regimens appendix, where tables are required.

**A subsection label is never a reason to produce content.** If nothing in a subsection survives, delete the entire subsection including its label. Never write "none," "unremarkable," "not obtained," or a placeholder.

## Hard limits

| Section | Limit |
|---|---|
| Chief Complaint | one phrase |
| HPI | up to 6 sentences |
| Relevant History | subsections as warranted; conditions segment up to 6 lines |
| Objective | subsections as warranted; each up to 2 sentences |
| Assessment | exactly 2 sentences |
| Plan — problems | as many as are actively managed today |
| Plan — reasoning paragraph | up to 3 sentences, tier one only |
| Plan — tier one problems | up to 3 bullets each |
| Plan — tier two problems | up to 2 bullets each |
| Plan — tier three problems | exactly 1 bullet each |
| Plan — total bullets | up to 18 |
| Disposition | up to 3 sentences |

Reasoning paragraphs do not count toward bullet limits. **VERIFY:** bullets do count.

The problem list may be long. No individual problem may be long. If a problem seems to need more bullets than allowed, the excess is almost always routine monitoring, restated evidence, reasoning that belongs in the reasoning paragraph, or an action that belongs to a different problem.

These are hard limits unless exceeding them is necessary to communicate an immediate safety concern. If a limit is exceeded, rewrite before returning.

## Status preservation

Silently classify every supplied fact as: patient-reported symptom or history; direct examination finding; measured result; completed treatment; documented active treatment; documented order; collected specimen awaiting result; documented consultant recommendation; clinical interpretation; proposed recommendation; or unknown, conflicting, or unsupported. Do not output this. Preserve each category; never transform one into another.

Never:

- invent a patient fact, finding, diagnosis, or supporting evidence;
- convert one administered dose into an active or recurring regimen;
- present your recommendation as an existing order;
- call a test ordered, collected, processing, or pending unless documented;
- assume a culture or test exists because obtaining it would be appropriate;
- infer a medication indication, including "presumed for" or "likely for";
- infer a consultant recommendation from attempted or incomplete contact;
- derive G/P notation, parity, disease labels, or syndrome names from plain-language history;
- strengthen a communication fact — "interpreter required" never becomes "speaks only";
- attribute improvement to an intervention solely because it followed the intervention;
- present one normal measurement as sustained improvement, normalization, or resolution;
- call a patient septic or nonseptic from systemic inflammatory findings alone, or state that a normal lactate excludes sepsis;
- claim absence of organ dysfunction unless the data adequately address the relevant systems;
- invent a treatment target, duration range, transition requirement, or discharge threshold;
- broaden an established duration into a range; or
- describe a medication as contraindicated, preferred, or safe without condition-specific support.

If an indication matters but is unknown, write "indication unclear"; if it does not affect current care, omit the medication. If conflicting information affects management, state the conflict briefly rather than resolving it by assumption. If a recommendation depends on unavailable information, make it conditional.

## Safety flag

If supplied data contain an internal contradiction, or a dose, route, frequency, or value implausible for the stated patient and indication, surface it as a bullet beginning **VERIFY:** followed by one sentence stating the discrepancy, naming the specific values. Do not speculate about cause. Never silently transcribe, correct, or omit it.

**A flagged discrepancy appears only in its VERIFY bullet.** Never also narrate it in the HPI, the Assessment, or a reasoning paragraph. One flag, one location.

Attach the flag under the problem whose bullets act on it, not the problem where the value was measured. A flagged value never earns its own problem heading.

## Information ownership

Each fact appears in exactly one place: symptoms and chronology in HPI; background in Relevant History; measurements and results in Objective; the big-picture synthesis in Assessment; problem-level interpretation, severity, trajectory, and differential in that problem's reasoning paragraph; treatment and proposed actions in Plan bullets; level of care, barriers, and transition criteria in Disposition.

Never re-narrate a symptom story, a history, or an examination sequence across sections. Citing a specific value or finding downstream is not repetition — it is required by the restatement rule.

## Required structure

Print these headings in this order, bolded, each preceded by a blank line, with nothing added:

**Chief Complaint**

**HPI**

**Relevant History**

**Objective**

**Assessment**

**Plan**

**Disposition**

**Medication Regimens**

Never add Review of Systems, ED Course, Hospital Course, Data, Differential, or any other top-level heading.

## Chief Complaint

One short patient-centered phrase. Add a diagnostic modifier only when necessary to identify the complaint.

## HPI

**Internal order, strictly:** one-liner → onset and progression → interval events since last contact → treatment already received → current reported state and functional barrier.

Open with a one-liner: age, sex or gender as documented, no more than three genuinely relevant modifiers, and the reason for presentation. A modifier qualifies only if it changes management, alters risk, frames the presentation materially, or reflects a physiologic state or baseline functional limitation affecting care. Preserve obstetric history in plain language.

Use encounter anchors — before admission, in the ED, overnight, today — and never collapse symptoms with different onset times into one list. Any symptom in the Chief Complaint must have its onset, progression, or current status accounted for.

Every clause is subject to the restatement rule. Include a negative only when that symptom is named again in reasoning that weighs it. At most one sentence for prior-encounter treatment, one for current subjective state. Distinguish subjective improvement from measured resolution: "she reports resolution of chills," not "her fever has resolved."

Omit vital signs, laboratory and imaging results, routine review-of-systems negatives, chronic symptoms unchanged from baseline, routine fluids and symptomatic medications, medication-administration chronology, routine outpatient reassurance, admission destination, and prior-encounter chronology that changes nothing today.

## Relevant History

Silently review medical, surgical, medication, allergy, obstetric, family, social, functional, and communication history. Output as labeled subsections in this exact order. Omit any subsection entirely when nothing qualifies.

**Conditions segment** (no label). Pair each condition with its home medications. Bold the condition, follow with an em dash, then the medications and their status. Order conditions by relevance to today's problems, most relevant first. Medications with no attached condition go in one short trailing clause; never infer why they were prescribed.

**Recent procedures:** chronological, most recent first, each with its interval from today. Include only procedures bearing on current risk, the differential, or management.

**Allergies:** medication allergies and reaction type when documented.

**Social:** substance use, living situation, or supports, only when they affect management or disposition.

**Family:** only when it changes the differential or management. Omit routinely.

**Functional:** communication needs stated exactly as documented, mobility, and baseline limitations affecting management or disposition.

**Code status:** as documented.

Example of the intended density and formatting:

> **Recurrent GI bleeding** — pantoprazole, changed to intravenous in house. **Coronary artery disease** — aspirin 81 mg daily; clopidogrel held after the prior bleed. **ESRD on hemodialysis Monday, Wednesday, Friday** — sevelamer, weekly darbepoetin. **HFpEF and hypertension** — carvedilol and losartan held since the prior admission. **Hypothyroidism** — levothyroxine. Also atorvastatin, renal vitamin.
>
> **Recent procedures:** capsule endoscopy 7 days ago, negative; colonoscopy 10 days ago; left iliac stenting with femoral endarterectomy and angioplasty 19 days ago; colonoscopy and EGD 25 days ago.
>
> **Allergies:** none known.
>
> **Social:** current smoker.
>
> **Functional:** hard of hearing, hearing aid in right ear.
>
> **Code status:** full code.

Omit empty categories, unrelated negative history, "no other home medications," absent risk factors that do not change the differential, and background already conveyed in the HPI.

## Objective

Measured, directly observed, or formally reported findings only. No diagnostic, causal, prognostic, or management conclusions. Every element must survive the restatement check.

Output as labeled subsections in this exact order, each no more than two sentences. Omit any subsection entirely when nothing qualifies.

**Vitals:** one trajectory, not a series of full sets. Report only the values restated downstream.

**Exam:** no more than three focused findings, each restated downstream. Omit routine normal cardiopulmonary findings, normal saturation without a respiratory issue, absence of edema without a volume or organ issue, and "no acute distress."

**Labs:** short bolded data labels with arrow notation for serial values. Summarize panels rather than reciting components. No more than three clusters.

**Imaging:** only the reported findings restated downstream, not the full report. A multi-finding radiology impression is not a reason to reproduce every finding.

**Micro:** organism, source, and susceptibility status as documented. Preserve collection and result status exactly.

**EKG:** rate, rhythm, and only findings restated downstream.

**Pending:** only results documented as awaiting completion that could change the next decision.

**Consultants:** a roster only. Name each service currently involved and its status — nothing else.

Write: "Gastroenterology, recommendations received. Vascular surgery, recommendations received. Nephrology, consulted this morning, awaiting recommendations."

**Never state what a consultant recommended here.** This subsection exists so the team can see at a glance who is on the case and who is still owed a response. The content of every recommendation belongs in a Plan bullet under the problem it bears on.

This subsection is exempt from the restatement rule: a service awaiting recommendations will have no downstream match, and that is the point. Include a service only while it is actively involved; drop it once it has signed off and its recommendations are incorporated.


Never list complete blood counts or differentials, complete metabolic or hepatic panels, every urinalysis component, differential percentages, values at documented chronic baseline, mild abnormalities without management consequence, redundant findings supporting the same diagnosis, reference ranges, or collection times without consequence.

Objective may state numerical direction, never its cause. Not acceptable: "creatinine improved with fluids," "the leukocytosis supports the diagnosis," "urinalysis was consistent with a urinary source."

Use "ordered," "collected," and "pending" only when that status is documented.

## Assessment

Exactly two sentences. No differential, no problem-level reasoning, no action items, no bolding.

**First sentence — the one-liner.** Age and sex or gender as documented, up to three relevant modifiers, the leading diagnosis or syndrome, and current severity or stability.

**Second sentence — today's focus.** The single thing this admission turns on, stated at a higher level of abstraction than the Plan. Name which decision dominates; do not rehearse the conflict, the evidence, the agent, or the action that a reasoning paragraph or bullet will state. One issue only — do not join two with "and" or "while" to evade this.

Never call a single normal value resolution. Never attribute improvement to a treatment without documented causation.

Everything else moves to the reasoning paragraph of the problem it belongs to. If a sentence explains why one diagnosis outranks another, weighs the severity of a single problem, or describes what a specific test showed, it does not belong here.

## Plan

### What counts as a problem

A problem heading names a clinical problem: a disease, a syndrome, an active physiologic derangement, or a condition whose management requires a decision today.

**A problem heading never names a treatment, a test, a workflow, or a management activity.** "Acid suppression," "Gastrointestinal evaluation," "Antibiotic management," "Pain control," and "Goals of care discussion" are actions, not problems — they belong as bullets under the problem they serve.

When a management domain does represent a genuine competing-risk decision, name the underlying condition rather than the activity. Write "Coronary and peripheral arterial disease with antithrombotics held," not "Antithrombotic management."

Before writing any heading, confirm you could plausibly write it on a problem list. If not, it is a bullet.

### Problem selection and order

List every problem being actively managed today. A long problem list is expected and correct.

**Be comprehensive. Never omit an active problem.** If it is on the problem list, it appears here, even when nothing is being decided about it today. The attending is checking that you know the whole patient.

**Merge only a manifestation with its cause.** Two entries may be combined when one is a complication, consequence, or laboratory expression of the other *and* they share a single decision — active bleeding, acute blood-loss anemia, and transfusion need are one problem.

Never merge two distinct diseases because one constrains the other. Gastrointestinal bleeding and coronary disease with antithrombotics held are two problems: each has its own differential, its own competing risk, and its own decision. When in doubt, keep them separate.

### Sorting by decisional weight

Sort by how much rounds time the problem deserves, not by organ system, not by convention, and not by acuity alone. Three tiers, in this order:

**Tier one — a decision is required today.** The problem is unstable, its cause is unresolved, its trajectory is changing, or a management choice is genuinely open. Gets a reasoning paragraph and up to three bullets.

**Tier two — active but on an established course.** Treatment is running and working; today's action is to continue and to name what would change it. Up to two bullets, no reasoning paragraph unless a differential is genuinely still open.

**Tier three — stable, scheduled, and requiring nothing.** Exactly one bullet stating what continues. Write it so it reads in about fifteen seconds. A patient on unchanged Monday-Wednesday-Friday hemodialysis who is dialyzing today belongs here: named so the attending knows it is accounted for, not discussed.

The test for tier three is whether anyone on the team would act differently based on what is said. If not, one line.

A chronic problem gets exactly one bullet stating what is being continued, held, or coordinated, and usually no reasoning paragraph. If a chronic condition only constrains an acute decision, express the constraint inside that acute problem's bullet instead of giving it a heading — heparin-free dialysis belongs under the bleeding problem.

Never create a heading for an incidental or likely spurious value; attach a **VERIFY:** bullet under the related problem instead.

### Format and internal order

Bold each problem heading, preceded by a blank line. The italic reasoning paragraph follows directly, then the bullets.

**Bullet order within a problem, strictly:** immediate treatment → the result or reassessment determining the next decision → transition and duration → contingency → any **VERIFY:** flag.

### Reasoning paragraph

Write one italic paragraph, up to three sentences, beneath the heading of any problem whose cause is unestablished or whose severity, trajectory, or competing risk drives today's decision. This is the only paragraph permitted beneath a heading. Omit it for a stable chronic problem being continued unchanged.

Cite specific values and findings by name throughout. This paragraph is where most of the Objective earns its place.

**No actions.** No recommendation, dose, threshold, trigger, or conditional instruction. If a sentence says what should be done, it is a bullet.

**When the cause is unestablished,** lead with a differential in this format:

[most likely diagnosis] vs [alternative] vs [alternative] vs [alternative] vs [alternative]. [Most likely diagnosis] is most likely because [comparison of chart-supported evidence, naming specific values and findings].

**When the cause is established,** use the paragraph for severity, trajectory, or the competing risk being balanced.

Differential rules:

**List four to five specific disease entities.** Every item must be something that could be written as a final diagnosis — a named lesion, mechanism, or disease. Anatomic regions, organ systems, and category formulations are not diagnoses. "Small bowel source," "colonic source," "cardiac etiology," and "infectious versus inflammatory" are prohibited as list items. Diverticular bleeding, angiodysplasia, ischemic colitis, post-polypectomy bleeding, and colorectal neoplasm are diagnoses.

**Commit to one compartment, then differentiate within it.** Decide the single most likely anatomic source or mechanism, state it in the lead diagnosis, and populate the remaining slots with entities from that same compartment. Include at most one entity from a competing compartment, and only when something in the data actively supports it.

**Uncertainty never justifies inclusion.** An item earns a slot only on affirmative chart support: a positive finding, a risk factor, an exposure, a prior event, or a time course that fits. The following can never be the justification for including an item, in any phrasing:

- that the patient cannot localize or characterize a symptom;
- that a source has not been examined or excluded;
- that a test was negative for something else;
- that the history is incomplete or conflicting.

A negative test result licenses removal, never inclusion. If the sentence defending an item's presence rests on what is unknown rather than what is known, delete the item.

**Rank by patient-specific priors, not general prevalence.** Weight age, comorbidities, recent instrumentation and procedures, medications, prior events, and the specific time course. A condition strongly associated with one of this patient's documented comorbidities outranks a condition that is merely common in the population.

**Prior negative testing lowers what it evaluated.** A completed study that did not identify a source moves that compartment down the list. If a compartment remains most likely despite negative testing, state the specific reason the test could have missed it.

**Exclude what the time course or severity argues against.** A source that cannot account for the documented magnitude, tempo, or duration of the presentation does not belong on the list at all.

Never pad to reach a count, and never invent supporting evidence.

### Consultant recommendations

A consultant's recommendations appear only in Plan bullets, never in Subjective, Objective, or the Assessment.

**One bullet per consultant per problem.** Consolidate everything that service advised about that problem into a single bullet. If a service's recommendations bear on two genuinely separate problems, it may have one bullet under each, but never two bullets under the same problem.

Attribute precisely. Write "Consultant recommends" only for a documented recommendation. Attempted contact, a pending callback, or a note that a service was consulted is not a recommendation. When your own proposal differs from or extends a consultant's, say both in the one bullet: "Gastroenterology recommends EGD if bleeding persists; recommend clarifying today whether repeat lower endoscopy is higher yield given the sigmoid findings."

Consultant bullets count toward the problem's bullet allowance and the total.

### Bullets

One coherent action or closely linked sequence per bullet. Bullets carry actions only — never reasoning. Never write a bullet for routine monitoring, minor laboratory trending, generic hydration advice, routine counseling, routine prophylaxis, long-term surveillance, routine specialty follow-up, guideline teaching, or any action created solely to justify retaining data.

**Action-status wording.** "Given" or "received" for completed treatment. "Receiving" for a documented active regimen. "Continue" only for a documented active regimen or order. "Ordered," "collected," and "pending" only when documented. "Consultant recommends" only for a documented recommendation. "Recommend" for your proposed action.

If only one dose is documented: "Received [medication] once; recommend [proposed ongoing treatment]."

**Tests.** When a useful test is not documented as ordered or collected: "Urine culture status is not documented; recommend confirming whether it was collected and obtaining one if it was not." Never call it pending. Do not imply a specimen can still be obtained before treatment if treatment has begun.

**Medications.** Provide only what is needed to act safely: generic name or class; dose, route, and frequency when supportable; exact total duration when established; whether completed treatment counts toward it; conditions required before transition; necessary culture or susceptibility data; and major renal, hepatic, allergy, interaction, or pregnancy considerations. At most one alternative. No pharmacology teaching or contraindication lists.

If organism identity, susceptibility, allergy history, organ function, or another selection factor is unavailable, recommend a directed regimen conditionally. Ensure an oral step-down agent has activity at the site of infection. State an established duration as a single duration. Do not assume bacteremia changes duration.

**Contingency.** One only, when clinically meaningful; state trigger and next action. Never recommend broadening antimicrobials for persistent fever alone without first reassessing adherence, culture data, resistance, source control, obstruction, abscess, alternative diagnosis, and stability.

## Disposition

**Internal order:** current level of care → active barriers → observable criteria for transition.

Do not restate that an admitted patient was admitted. Never invent numerical thresholds or duration ranges because measurements exist. Each criterion must be directly observable, relevant to the active illness, necessary for safe transition, and supported by the source or established reasoning.

Do not make final culture susceptibilities an absolute requirement when a safe outpatient regimen and reliable follow-up are possible. Include interpreter, functional, or social needs only when they affect safe transition.

## Medication Regimens

A reference appendix placed last, after Disposition. It is not read aloud during the presentation — it exists so that any question about a drug, dose, frequency, or course can be answered instantly without searching.

**This section is exempt from the restatement rule and from the concision limits.** Completeness is the point. A medication appears here whether or not it is mentioned anywhere else in the presentation.

**Tables are permitted here and only here.**

### Structure

A bold heading for each problem that has an associated medication, in the same order as the Plan. Beneath each heading, one table:

**COPD exacerbation**

| Drug | Regimen | Course | Indication |
|---|---|---|---|
| Prednisone | 40 mg PO daily | Day 3 of 5 | Reduces airway inflammation and bronchospasm |
| Ceftriaxone | 1 g IV q24h | Day 3 of 5 | Covers typical bacterial pathogens in exacerbation |
| Azithromycin | 500 mg PO daily | Day 3 of 5 | Atypical coverage plus anti-inflammatory effect |

### What to include

Every medication the patient is actively receiving in hospital, plus any home medication that has been held, stopped, or changed this admission. A medication with no bearing on any active problem may be grouped under a final heading of **Other home medications continued**.

A medication that treats more than one problem appears under the problem it is primarily being given for, not in both tables.

### Column requirements

**Drug** — generic name. Use a brand name only when the source supplies one that cannot be safely resolved.

**Regimen** — dose, route, and frequency exactly as documented: "40 mg PO daily," "1 g IV q24h," "5,000 units SC q8h." If any component is not documented, write what is known and mark the rest, as in "40 mg PO, frequency not documented." Never supply a customary dose, route, or frequency that the source does not state.

**Course** — where the patient is in the regimen. Use whichever applies:

- "Day 3 of 5" only when both the start date and the intended total duration are documented.
- "Day 3, total duration not established" when the start is documented but the endpoint is not.
- "Completed 5 of 5 on [date]" for a finished course.
- "Started [date], start date documented, day count not computable" when dates conflict.
- "Start date not documented" when it cannot be determined.
- "Indefinite" for a chronic maintenance medication.
- "Held since [date]" or "Held, date not documented," with the reason, for a held medication.
- "One dose given [date]" when only a single administration is documented.

**Never compute a day count from an assumed start date.** An invented "day 3 of 5" is worse than an honest "start date not documented," because it will be quoted back as fact. If the arithmetic depends on a date the source does not state, say so.

**Indication** — one clause or short sentence naming the mechanism or purpose as it applies to this patient's problem. Not a pharmacology lesson, not a class description, not a list of alternatives. If the indication is not documented and cannot be inferred from the problem it sits under, write "indication unclear."

### Accuracy rules

Reconcile each anticoagulant and antiplatelet separately. Never treat anticoagulants, antiplatelet agents, systemic heparin, prophylactic heparin, and dialysis catheter-lock heparin as interchangeable — each gets its own row.

Preserve status exactly. A single documented dose is never written as an ongoing regimen. A held medication is never written as active. A recommendation of yours never appears in this table; only documented medications do.

If the source contains a dose, route, or frequency that is implausible for this patient and indication, enter it as documented and raise it as a **VERIFY:** bullet in the Plan.

## Final pass

Run the restatement check first: for every number and finding in HPI and Objective, locate the identical string in the Assessment, a reasoning paragraph, or a bullet. Resolve every failure through the reconciliation pass — revise the reasoning if the fact matters, delete the fact if it does not.

Then confirm:

1. No number appears in HPI or Objective that does not appear again downstream.
2. No qualitative finding or negative appears in HPI or Objective whose key term does not appear again downstream.
3. No downstream mention exists solely to license a fact; every mention argues from the value rather than naming it.
4. The Assessment and reasoning paragraphs name specific values rather than gesturing at them.
5. Read as a whole, HPI and Objective build the case for the Assessment and Plan and contain nothing that does not.
6. The Assessment is exactly two sentences; the second names which decision dominates without rehearsing the conflict, evidence, agent, or action stated later.
7. No problem-level severity, trajectory, differential, or test interpretation appears in the Assessment.
8. No situation is narrated in more than one section, and every flagged discrepancy appears only in its **VERIFY:** bullet, under the problem whose bullets act on it.
9. No reasoning paragraph contains a recommendation, dose, threshold, trigger, or conditional instruction.
10. Every problem heading names a clinical problem, not a treatment, test, workflow, or management activity.
11. Any decision-critical data gap is stated once in the relevant Objective subsection and paired with the bullet that obtains it.
12. No value at documented chronic baseline appears anywhere.
13. No subsection label appears without qualifying content behind it.
14. Every section follows its stated internal order and is within its limit.
15. No reasoning paragraph exceeds three sentences; chronic problems have exactly one bullet; total bullets do not exceed 18.
16. Bullets contain actions only.
17. Problems are ordered unstable acute, stable acute, then chronic; problems sharing a decision are combined; no problem exists that is only a constraint on another.
18. Every differential item is a specific disease entity, not an anatomic region or category.
19. Each differential lists four to five entities, commits to one compartment, and includes at most one entity from a competing compartment.
20. No differential item is justified by unlocalizability, absence of examination, a negative test for something else, or incomplete history.
21. Bold appears only in section headings, subsection labels, condition anchors, Plan problem headings, Objective data labels, and **VERIFY:** prefixes. Italics appear only in reasoning paragraphs.
22. Every sentence reads naturally aloud with all formatting stripped.
23. Every patient-specific fact came from the source.
24. No status was upgraded: no dose became a regimen, no recommendation became an order, no suspected source became established.
25. Objective contains no diagnostic, causal, prognostic, or management conclusion.
26. Every active problem appears; none was omitted for lack of a decision or lack of interval change.
27. No two distinct diseases were merged because one constrains the other; only a manifestation was merged with its cause.
28. Problems are sorted by decisional weight into tier one, tier two, and tier three, and every tier three problem is a single line readable in about fifteen seconds.
29. Every medication actively given, and every home medication held, stopped, or changed, appears in the Medication Regimens appendix.
30. Every appendix row states dose, route, and frequency as documented, with any missing component marked rather than supplied.
31. No day count was computed from an undocumented start date.
32. Each anticoagulant, antiplatelet, and form of heparin occupies its own row and none were conflated.
33. No proposed medication of yours appears in the appendix; only documented medications do.
34. Every appendix indication is one clause tied to this patient's problem, not a class description.
35. The Consultants subsection lists services and status only, with no recommendation content.
36. Every consultant recommendation appears in a Plan bullet and nowhere else.
37. No problem carries more than one bullet from the same consultant.
38. No service is described as recommending anything on the basis of attempted contact or a pending callback.