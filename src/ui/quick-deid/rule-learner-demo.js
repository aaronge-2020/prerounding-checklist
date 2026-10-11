// Guided demo: "See how it learns" for the automatic rule proposer.
//
// A scripted, step-by-step walkthrough of the full learning loop inside the
// Quick De-ID view:
//   sample note (miss) -> correction x3 -> pattern noticed ->
//   proposed rule (plain-English card) -> approve -> rule applied live.
//
// The demo uses the REAL proposer logic, not a script:
//   - corrections are built with buildCorrection() from correction-log.js
//   - the rule is mined with separateAndConquer() from rule-proposer.js
//   - the card is rendered with the real approval-presentation.js
//   - approval flows through the real rule store (decideRule/deleteRule)
//   - the final "it works" moment applies the approved rule with
//     applyProposedRules() on a fresh note
//
// All demo notes are synthetic. Nothing is persisted except the demo's own
// proposed rule (a regex pattern, no PHI), which is removed from the store
// when the demo exits.

import { buildCorrection } from "../../vault/deid/correction-log.js";
import {
  separateAndConquer,
  applyProposedRules,
  MIN_SUPPORT,
} from "../../vault/deid/rule-proposer.js";
import {
  addProposedRules,
  deleteRule,
} from "../../vault/deid/rule-store.js?v=20261009-rule-proposer-v1";
import { decideRule } from "../../vault/deid/rule-orchestrator.js?v=20261009-rule-proposer-v1";

// Synthetic demo notes. Names are caught by the base detector in the story;
// the occupation after "Occupation:" is what the system misses.
const DEMO_NOTES = Object.freeze([
  Object.freeze({
    id: "demo-note-1",
    name: "Alvarez",
    occupation: "teacher",
    text: "Mr. Alvarez is a 54-year-old man with chest pain. Occupation: teacher. He coaches the school debate team.",
  }),
  Object.freeze({
    id: "demo-note-2",
    name: "Bennett",
    occupation: "nurse",
    text: "Ms. Bennett, 61, presents with shortness of breath. Occupation: nurse. She has worked night shifts for 12 years.",
  }),
  Object.freeze({
    id: "demo-note-3",
    name: "Carter",
    occupation: "engineer",
    text: "Mr. Carter is a 47-year-old with hypertension. Occupation: engineer. He reports morning headaches.",
  }),
]);

const FINAL_NOTE = Object.freeze({
  id: "demo-note-4",
  name: "Davis",
  occupation: "Carpenter",
  text: "Ms. Davis, 39, is here for an annual physical. Occupation: Carpenter. She has no complaints today.",
});

// User-facing phase numbers for the "Step n of 8" indicator.
const PHASE_OF = {
  intro: 1,
  "note-0": 2, "recorded-0": 2,
  "note-1": 3, "recorded-1": 3,
  "note-2": 4, "recorded-2": 4,
  pattern: 5,
  rule: 6,
  approved: 7, rejected: 7,
  applied: 8, "applied-missed": 8,
};
const TOTAL_PHASES = 8;

function spanOf(text, word) {
  const start = text.indexOf(word);
  return start === -1 ? null : { start, end: start + word.length };
}

export function createRuleLearnerDemo({ escapeHtml, icon, approvalPresentation }) {
  // Session state. Null when the demo is not running.
  let session = null;

  function cleanupSession() {
    if (session?.ruleAddedToStore && session?.rule?.name) {
      try { deleteRule(session.rule.name); } catch { /* storage may be unavailable */ }
    }
    session = null;
  }

  function freshSession() {
    return {
      step: "intro",
      corrections: [],
      rule: null,
      ruleAddedToStore: false,
    };
  }

  // ---- Pure step content -------------------------------------------------

  function renderNote(note, mode) {
    const nameSpan = spanOf(note.text, note.name);
    const occSpan = spanOf(note.text, note.occupation);
    let html = "";
    let cursor = 0;
    const marks = [];
    if (nameSpan) marks.push({ ...nameSpan, cls: "demo-found", tag: "found", tagCls: "demo-tag--found" });
    if (occSpan) {
      marks.push(mode === "caught"
        ? { ...occSpan, cls: "demo-caught", tag: "caught by your new rule", tagCls: "demo-tag--caught" }
        : { ...occSpan, cls: "demo-miss", tag: "missed", tagCls: "demo-tag--miss" });
    }
    marks.sort((a, b) => a.start - b.start);
    for (const m of marks) {
      html += escapeHtml(note.text.slice(cursor, m.start));
      html += `<mark class="${m.cls}">${escapeHtml(note.text.slice(m.start, m.end))}</mark><span class="demo-tag ${m.tagCls}">${escapeHtml(m.tag)}</span>`;
      cursor = m.end;
    }
    html += escapeHtml(note.text.slice(cursor));
    return `<div class="demo-note" aria-label="Sample clinical note">${html}</div>`;
  }

  // Render a note with entity spans produced by the real rule engine.
  function renderNoteWithEntities(note, entities) {
    const nameSpan = spanOf(note.text, note.name);
    const marks = [];
    if (nameSpan) marks.push({ ...nameSpan, cls: "demo-found", tag: "found", tagCls: "demo-tag--found" });
    for (const e of entities || []) {
      marks.push({
        start: e.start, end: e.end,
        cls: "demo-caught", tag: "caught by your new rule", tagCls: "demo-tag--caught",
      });
    }
    marks.sort((a, b) => a.start - b.start);
    let html = "";
    let cursor = 0;
    for (const m of marks) {
      if (m.start < cursor) continue; // never double-render overlaps
      html += escapeHtml(note.text.slice(cursor, m.start));
      html += `<mark class="${m.cls}">${escapeHtml(note.text.slice(m.start, m.end))}</mark><span class="demo-tag ${m.tagCls}">${escapeHtml(m.tag)}</span>`;
      cursor = m.end;
    }
    html += escapeHtml(note.text.slice(cursor));
    return `<div class="demo-note" aria-label="Sample clinical note">${html}</div>`;
  }

  function appliedEntities() {
    if (!session?.rule) return [];
    try {
      return applyProposedRules(FINAL_NOTE.text, [], [{ ...session.rule, status: "approved" }]);
    } catch {
      return [];
    }
  }

  function stepBody() {
    const s = session;
    switch (s.step) {
      case "intro":
        return `
          <p>Watch the system learn a brand-new rule from your corrections. No code, no engineer involved.</p>
          <p class="muted">We'll walk through 3 short sample notes. Each time, the system misses an occupation — you'll correct it, exactly like normal review.</p>`;
      case "note-0": case "note-1": case "note-2": {
        const i = Number(s.step.split("-")[1]);
        const note = DEMO_NOTES[i];
        return `
          <p><strong>Sample note ${i + 1} of 3.</strong> De-identification just ran. It found the patient's name, but it missed the occupation.</p>
          ${renderNote(note, "miss")}
          <p class="muted">In real review you'd fix this the same way — highlight what was missed and label it.</p>`;
      }
      case "recorded-0": case "recorded-1": case "recorded-2": {
        const i = Number(s.step.split("-")[1]);
        return `
          <p><strong>Correction recorded (${i + 1} of 3).</strong></p>
          <p class="muted">The system saved what you fixed. ${i < 2 ? "Keep going — it needs a couple more examples before it can spot a pattern." : "That's enough examples. Let's see what the system noticed."}</p>`;
      }
      case "pattern":
        return `
          <p><strong>The system noticed a pattern.</strong></p>
          <p>"Occupation:" appeared right before all 3 corrections you made.</p>
          <p class="muted">This is the real pattern-finder running on your corrections — the same one that powers the Suggested rules panel.</p>`;
      case "rule": {
        const card = s.rule ? approvalPresentation.renderRuleCard(s.rule) : "";
        // Swap the card's global approve/reject actions for demo-scoped ones so
        // clicking them advances the demo instead of re-rendering the view.
        const demoCard = card
          .split('data-action="approve-rule"').join('data-action="rule-learner-demo-approve"')
          .split('data-action="reject-rule"').join('data-action="rule-learner-demo-reject"');
        return `
          <p><strong>The system proposes a rule.</strong> In plain English, no code:</p>
          ${demoCard || `<p class="muted">The pattern-finder didn't reach its evidence bar this time.</p>`}
          <p class="muted">This is the exact card a clinician would see. Approve it and the system starts using it.</p>`;
      }
      case "approved":
        return `
          <p><strong>Rule saved!</strong> From now on, the system marks occupations that follow "Occupation:".</p>
          <p class="muted">The rule is active immediately — no restart, no engineer.</p>`;
      case "rejected":
        return `
          <p><strong>Rule dismissed.</strong> The system won't use it.</p>
          <p class="muted">Rejected suggestions are remembered, so you won't be asked about this pattern again.</p>`;
      case "applied": {
        const entities = appliedEntities();
        const caughtWord = entities.length
          ? FINAL_NOTE.text.slice(entities[0].start, entities[0].end)
          : null;
        return `
          <p><strong>Watch it work.</strong> A new note arrives. Your approved rule runs on it — for real:</p>
          ${renderNoteWithEntities(FINAL_NOTE, entities)}
          <p class="muted">${caughtWord ? `Before, the system missed occupations like this one. Your approved rule caught \u201c${escapeHtml(caughtWord)}\u201d automatically.` : "The rule ran on this note."}</p>`;
      }
      case "applied-missed":
        return `
          <p><strong>A new note arrives:</strong></p>
          ${renderNote(FINAL_NOTE, "miss")}
          <p class="muted">Without the rule, the miss continues — which is exactly why the approval step matters.</p>`;
      default:
        return "";
    }
  }

  function stepActions() {
    const s = session;
    const exit = `<button class="button--quiet" type="button" data-action="rule-learner-demo-exit">Exit demo</button>`;
    switch (s.step) {
      case "intro":
        return `${exit}<button class="button--primary" type="button" data-action="rule-learner-demo-next">Start demo</button>`;
      case "note-0": case "note-1": case "note-2": {
        const i = Number(s.step.split("-")[1]);
        const note = DEMO_NOTES[i];
        return `${exit}<button class="button--primary" type="button" data-action="rule-learner-demo-correct" data-note-index="${i}">Mark &ldquo;${escapeHtml(note.occupation)}&rdquo; as an occupation</button>`;
      }
      case "rule":
        // The rule card carries its own Approve / Reject buttons.
        return exit;
      case "applied": case "applied-missed":
        return `<button class="button--primary" type="button" data-action="rule-learner-demo-exit">Exit demo</button>`;
      default:
        return `${exit}<button class="button--primary" type="button" data-action="rule-learner-demo-next">Next</button>`;
    }
  }

  function renderModal() {
    const phase = PHASE_OF[session.step] || 1;
    return `
      <div class="aic-review-backdrop" data-rule-learner-demo>
        <div class="aic-review" role="dialog" aria-modal="true" aria-label="See how it learns demo" tabindex="-1">
          <h3>${icon("sparkles")} See how it learns <span class="demo-step-count">Step ${phase} of ${TOTAL_PHASES}</span></h3>
          <div class="demo-step-body">${stepBody()}</div>
          <div class="aic-review-actions">${stepActions()}</div>
        </div>
      </div>`;
  }

  // ---- Controller ----------------------------------------------------------

  function mount() {
    unmount();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderModal();
    const backdrop = wrapper.firstElementChild;
    document.body.appendChild(backdrop);
    const dialog = backdrop.querySelector('[role="dialog"]');
    if (dialog) dialog.focus({ preventScroll: true });
  }

  function unmount() {
    document.querySelectorAll("[data-rule-learner-demo]").forEach((el) => el.remove());
  }

  function rerender() {
    const host = document.querySelector("[data-rule-learner-demo]");
    if (!host || !session) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderModal();
    host.replaceWith(wrapper.firstElementChild);
  }

  function runProposer() {
    let rule = null;
    try {
      const proposed = separateAndConquer(session.corrections, { minSupport: MIN_SUPPORT });
      rule = proposed.find((r) => r.action === "detect") || proposed[0] || null;
    } catch {
      rule = null;
    }
    session.rule = rule;
    session.ruleAddedToStore = false;
    if (rule) {
      try {
        const added = addProposedRules([rule]);
        session.ruleAddedToStore = added.length > 0;
      } catch {
        session.ruleAddedToStore = false;
      }
    }
  }

  const NEXT_STEP = {
    intro: "note-0",
    "recorded-0": "note-1",
    "recorded-1": "note-2",
    "recorded-2": "pattern",
    pattern: "rule",
    approved: "applied",
    rejected: "applied-missed",
  };

  return {
    start() {
      cleanupSession();
      session = freshSession();
      mount();
    },
    next() {
      if (!session) return;
      const from = session.step;
      if (from === "recorded-2") runProposer();
      const to = NEXT_STEP[from];
      if (!to) return;
      session.step = to;
      rerender();
    },
    correctNote(i) {
      if (!session) return;
      const note = DEMO_NOTES[i];
      if (!note) return;
      const occSpan = spanOf(note.text, note.occupation);
      if (!occSpan) return;
      const correction = buildCorrection({
        decision: "added",
        original: null,
        corrected: {
          start: occSpan.start,
          end: occSpan.end,
          label: "OCCUPATION",
          text: note.occupation,
        },
        noteText: note.text,
        noteId: note.id,
      });
      if (correction) session.corrections.push(correction);
      session.step = `recorded-${i}`;
      rerender();
    },
    approveRule() {
      if (!session || !session.rule) return;
      // Real approval path: persist the decision in the rule store, but only
      // for rules this demo proposed (never touch pre-existing user rules).
      if (session.ruleAddedToStore) {
        try { decideRule(session.rule.name, true); } catch { /* noop */ }
      }
      session.rule = { ...session.rule, status: "approved" };
      session.step = "approved";
      rerender();
    },
    rejectRule() {
      if (!session || !session.rule) return;
      if (session.ruleAddedToStore) {
        try { decideRule(session.rule.name, false); } catch { /* noop */ }
      }
      session.step = "rejected";
      rerender();
    },
    exit() {
      cleanupSession();
      unmount();
    },
    getSession() {
      return session;
    },
  };
}
