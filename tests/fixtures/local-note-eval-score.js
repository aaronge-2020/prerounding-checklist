import { NOTE_INTERVIEW_QUESTIONS } from "../../src/local-llm/note-synthesis.js?v=20261015-clinical-drafts";

// Fixed literal expectations, not an LLM judge or a clinical efficacy claim.
export function scoreLocalNoteCase(fixture, result) {
  const failures = [];
  if (fixture.id.startsWith("dense-") && !result.error && result.budget?.sourceTokens < 12679) failures.push("Dense source did not meet the target token workload");
  if (!result.error && result.text.length > (fixture.section === "one_liner" ? 1200 : fixture.section === "full_note" ? 7000 : 4500)) failures.push("Draft exceeds the reviewability length limit");
  if (result.error) return { passed: false, failures: [result.error] };
  for (const kind of ["prior", "current"]) {
    const sourceKind = kind === "current" ? "today" : "prior";
    const selected = result.evidence.filter(item => item.kind === sourceKind).map(item => item.text).join("\n").toLowerCase();
    for (const expected of fixture.expected?.[kind] || []) if (!selected.includes(expected.toLowerCase())) failures.push(`Missing required ${kind} evidence: ${expected}`);
  }
  const baseline = result.evidence.filter(item => item.selectionRole === "baseline_ids").map(item => item.text).join("\n");
  for (const expected of fixture.expected?.baseline || []) if (!baseline.includes(expected)) failures.push(`Missing patient description in baseline role: ${expected}`);
  for (const forbidden of fixture.expected?.forbidden || []) if (result.text.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`Unwanted draft content: ${forbidden}`);
  for (const item of result.evidence) if (!(item.kind === "today" ? fixture.todayUpdates : fixture.source).includes(item.text)) failures.push(`Evidence ${item.id} is not an exact source quotation`);
  for (const item of result.questions) if (NOTE_INTERVIEW_QUESTIONS[item.questionId] !== item.question) failures.push("Question text is outside the approved bank");
  if (/<\/?think>/i.test(result.text)) failures.push("Thinking tags leaked into the draft");
  if (fixture.id.startsWith("long-") && result.chunks < 2) failures.push("Long source did not exercise multiple passes");
  return { passed: failures.length === 0, failures };
}
