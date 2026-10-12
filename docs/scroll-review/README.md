# Scroll preservation and AI-chat review

Validated October 12, 2026, against the real UI controller and stylesheet.

The shared render helper previously captured references to nested scroll owners
that were destroyed by `innerHTML`. Other renderers maintained separate scroll
restorers, including delayed callbacks and global class selectors. AI Chat only
preserved its route and message pane, leaving its pre-send dialog unprotected.

The shared helper now resolves replaced panes within their original render root,
using stable identities for review documents. It restores surviving ancestors,
expanded details, and focused controls synchronously. No delayed scroll callback
can undo a later wheel movement. The app shell preserves only its route and
document; feature renderers own their nested panes. Intentional navigation to a
different sheet, calculator, or explicitly selected review document still works.

AI-chat review now starts with one document expanded. A pinned document picker
opens any other document directly. Decisions and reviewed text sit alongside one
another on desktop and stack on mobile; both have bounded reading areas. Exact
outgoing content is available in a disclosure that remains open during review.
Acknowledgment and Send remain visible. Escape cancels and Tab stays in the
dialog. Background updates preserve the current patient's unsent draft.

## Verification

- `npm.cmd run test:ci`: passed, including unit, guided-demo, real-app UI,
  encrypted persistence, note-writer, citation, A&P, and new scroll regressions.
- `npm.cmd run test:scroll-ui`: now runs in the standard UI/CI suite. Covers
  Settings and Prompts with real pointer clicks on desktop and mobile; nested
  scroll owners, focus/selection and disclosure restoration; Epic section
  navigation; and the AI-chat review controller with actual DOM events.
- Review scenarios: accept/reject, show reviewed, undo/restore, accept document,
  collapse/reopen, jump to document/payload, manual redaction via mouse drag,
  acknowledgment while suggestions remain, accept remaining, send, cancel,
  model failure, keyboard containment, draft preservation and patient changes.
- Desktop chat history stays at its reading position during inspector changes;
  mobile document scroll survives background rendering.
- Final lint: zero errors, existing warnings remain.

## Measured actions

[`measurements.json`](measurements.json) contains the before/after review-body
scroll offsets for ten actions at each of 1440×900 and 390×844. Each measurement
uses one real mouse click at one target; all twenty required **zero recovery
scrolls**. The target is revealed before measurement, so setup navigation is
excluded. These are regression measurements, not total end-to-end workflow or
human usability timings. Browser clamping when content becomes shorter is
allowed; unexpected jumps are not.

The fixtures use eight long synthetic notes, repeated redaction suggestions,
custom instructions, message context, and chat history. The real review
controller, presentation, selection handling, and send gate run in Chromium.
Inference and the outgoing request are stubbed at their existing dependency
boundaries: this validates UI behavior and the exact redacted request payload,
not model accuracy or a live OpenAI request. Cancel and failure produce no request.

Screenshots: [desktop document review](pending-1440.png),
[mobile document review](pending-390.png), [desktop outgoing content](review-1440.png),
[mobile outgoing content](review-390.png). All text is synthetic.

Regenerate screenshots and measurements in PowerShell:

```powershell
$env:SCROLL_REVIEW_ARTIFACTS = 'docs/scroll-review'
node tests/test-ai-chat-scroll-browser.js
```
