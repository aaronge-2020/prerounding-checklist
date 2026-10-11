# Prompt control for pre-rounding generate buttons — implementation plan
Reconstructed 2026-10-11 from the 2026-09-26 research session. The plan was presented in chat on Sep 26 and never saved to a file until now. Implementation status is noted per item.

## Requirement (Aaron, 2026-09-26)
Every OpenAI generation flow, especially per-problem A&P, must pause before sending and show the exact request; allow copying the prompt for manual use in Doximity without contacting OpenAI; and make the instructions/request editable so the user controls what is sent.

## Codebase research (read-only trace, 2026-09-26)
All three current send paths ultimately use the OpenAI Responses endpoint through `src/ui/openai-client.js`:
1. **Per-problem A&P** — previews only context today, not the full prompt; its "only this text" wording was inaccurate (fixed, see below).
2. **Checklist fill** — already has a copy-only prompt action.
3. **Workup formatting** — already has a copy-only prompt action.

These three send paths are the **three default instruction blocks** referenced in the scoping question: each has its own default instructions that a Settings editor would manage.

## Recommended implementation (not yet built, except where noted)
A shared request inspector used by all generate buttons:
- Editable instructions, input, model, and temperature (plus an A&P web-search toggle).
- Exact request preview — the literal request that will be sent.
- Copy-only action (copies the prompt for pasting into Doximity; no API call).
- Reset and save-default controls.
- No rendered API key anywhere in the preview.
- JSON schemas stay read-only, because result parsing depends on them.

## What has been built so far
- **Done:** the A&P confirmation modal's misleading "only this text" statement was corrected — it now accurately says the displayed de-identified patient data is sent together with task instructions.
- **Done (2026-09-28 decision):** clicking Generate on an A&P problem sends only that single problem's assessment/context, not the entire plan.
- **Done (2026-10-10 directive):** with a blank consult task, Generate fully completes the problem (add-suggestion for every missing differential, diagnostic order, therapeutic order); with a filled consult task it does exactly what was asked, no padding. The preview textarea updates live as the consult box is typed or cleared; a hand edit wins and stops the auto-swap.
- **Not built:** the shared preview/copy/edit request inspector.

## Open scoping question (awaiting Aaron)
Per-send prompt editing only, or per-send editing **plus** a Settings editor for the three default instruction blocks (per-problem A&P, checklist fill, workup formatting)? Implementation of the shared inspector is on hold until Aaron answers.
