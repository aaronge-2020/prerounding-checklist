import assert from "node:assert/strict";

const cases = [
  {
    name: "admission pancreatitis",
    source: "Acute alcohol-associated pancreatitis on chronic pancreatitis. CT yesterday: peripancreatic inflammation and pancreatic calcifications, no necrosis or collection. Ultrasound yesterday: no gallstones or biliary dilation. Prior ERCP with pancreatic duct stent; timing and disposition are not documented. Improving pain, resolved nausea, LR 125 mL/hour, clear liquids. Hypertension 128/74 on home amlodipine 5 mg PO daily. Amylase normal two days ago.",
    output: `**Assessment**
52-year-old man with established acute alcohol-associated pancreatitis superimposed on chronic calcific pancreatitis, currently hemodynamically stable with improving pain and resolved nausea. This admission turns on readiness to transition from intravenous-supported care.

**Plan**

**Acute alcohol-associated pancreatitis on chronic calcific pancreatitis**
**Key context:** CT yesterday showed peripancreatic inflammation and pancreatic calcifications without necrosis or collection; ultrasound yesterday showed no gallstones or biliary dilation. Symptoms are improving on lactated Ringer's 125 mL/hour and clear liquids. Prior ERCP with pancreatic duct stent placement is documented, but its timing and disposition are not documented.
- Continue lactated Ringer's 125 mL/hour while oral intake is inadequate because the patient is stable without an indication for aggressive bolus resuscitation.

**Chronic hypertension**
**Key context:** Hypertension is controlled at 128/74 on home amlodipine 5 mg PO daily.
- Continue amlodipine 5 mg PO daily rather than intensifying therapy because blood pressure is controlled.`,
    required: ["CT yesterday", "pancreatic calcifications", "ultrasound yesterday", "timing and disposition are not documented", "125 mL/hour", "amlodipine 5 mg PO daily"],
    forbidden: ["amylase", "two days ago"],
    problemCount: 2
  },
  {
    name: "progress postoperative multi-problem",
    source: "Hospital day 5. CT hospital day 1: perforated sigmoid diverticulitis and 4.2 cm abscess. Hartmann procedure on hospital day 2 with source control. Culture: ceftriaxone-susceptible E. coli. Ceftriaxone 2 g IV every 24 hours plus metronidazole 500 mg IV every 8 hours through hospital day 6. Home aspirin 81 mg PO daily held since hospital day 1; surgery recommends resume today after documented hemostasis. Glucose 140-180 on glargine 10 units SC nightly plus correction lispro; home metformin 1,000 mg PO twice daily remains held for variable intake. WBC 13.2 on hospital day 1 before source control.",
    output: `**Assessment**
72-year-old woman on hospital day 5 recovering after operative source control of perforated sigmoid diverticulitis, clinically stable on an established antimicrobial course. Today's dominant decision is restoration of secondary cardiovascular prevention after surgery.

**Plan**

**Coronary artery disease with aspirin held**
**Key context:** Home aspirin 81 mg PO daily has been held since hospital day 1 for surgery; operative hemostasis after the hospital day 2 procedure is documented.
- Resume aspirin 81 mg PO daily today as surgery recommends because documented hemostasis now favors secondary cardiovascular prevention over continued holding.

**Perforated sigmoid diverticulitis with abscess, status post source control**
**Key context:** CT on hospital day 1 showed perforated sigmoid diverticulitis with a 4.2 cm abscess, and Hartmann procedure on hospital day 2 achieved source control. Culture grew ceftriaxone-susceptible E. coli; treatment is ceftriaxone 2 g IV every 24 hours plus metronidazole 500 mg IV every 8 hours through hospital day 6.
- Continue the documented regimen through hospital day 6 because source control and susceptibility support targeted rather than broader therapy.

**Type 2 diabetes mellitus**
**Key context:** Glucose is 140-180 on glargine 10 units SC nightly plus correction lispro; home metformin 1,000 mg PO twice daily remains held while intake is variable.
- Continue basal-plus-correction insulin rather than resume metformin because it is adjustable to variable postoperative intake.`,
    required: ["hospital day 1", "Hartmann procedure on hospital day 2", "4.2 cm abscess", "ceftriaxone 2 g IV every 24 hours", "metronidazole 500 mg IV every 8 hours through hospital day 6", "aspirin 81 mg PO daily", "metformin 1,000 mg PO twice daily remains held"],
    forbidden: ["WBC 13.2"],
    problemCount: 3
  }
];

for (const fixture of cases) {
  for (const fact of fixture.required) {
    assert.match(fixture.source, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${fixture.name}: required fact must be source-backed`);
    assert.match(fixture.output, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${fixture.name}: required fact must survive in Assessment and Plan`);
  }
  for (const lowValue of fixture.forbidden) assert.doesNotMatch(fixture.output, new RegExp(lowValue, "i"), `${fixture.name}: low-value fact must be omitted`);
  assert.equal(fixture.output.match(/\*\*Key context:\*\*/g)?.length, fixture.problemCount, `${fixture.name}: every Plan problem needs Key context`);
  const sourceTimings = new Set(fixture.source.match(/\b(?:yesterday|today|two days ago|hospital day \d+)\b/gi)?.map((value) => value.toLowerCase()) || []);
  for (const timing of fixture.output.match(/\b(?:yesterday|today|two days ago|hospital day \d+)\b/gi) || []) {
    assert.equal(sourceTimings.has(timing.toLowerCase()), true, `${fixture.name}: output timing must be source-backed: ${timing}`);
  }
}

console.log("Standalone Assessment and Plan contract fixtures passed");
