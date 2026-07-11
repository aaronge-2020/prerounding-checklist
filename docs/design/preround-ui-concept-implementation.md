# Preround UI Concept — Implementation Handoff

## Visual target

Use [the concept board](./preround-ui-concept-board.png) as the single visual reference. It redesigns the six existing application routes without changing the product model: `Vault / Roster`, `Hospital Stay`, `Workups`, `Checklist`, `OpenEvidence Prompts`, and `Quick De-ID`.

The goal is a calmer, more legible clinical workspace. The current layout has strong routing and compact information density, but its visual language treats almost every element as the same bordered card. The target instead uses page-level surfaces, row dividers, quiet tinted state, and only one unmistakable primary action per task.

## Non-negotiable implementation limits

- Preserve the static, local-first architecture. Do not add accounts, sync, APIs, analytics, remote persistence, or public-catalog hydration.
- Keep all current actions, state, validations, de-identification behavior, and browser-local storage exactly as they work today. This is a presentational and markup-hierarchy update.
- Keep the raw-text and de-identification safety boundary intact. The concept’s examples are synthetic; no real patient identifiers should be placed in fixtures, screenshots, or tests.
- Keep the six existing `data-view-target` routes and the special phone checklist route. Do not turn the app into a dashboard or introduce a new workflow.

## 1. Establish the visual system first

Edit the root token block in `styles.css` and remove the later duplicate geometry overrides by folding their final values into the primary definitions. Use these target tokens:

```css
:root {
  --bg: #f7f6f2;
  --surface: #ffffff;
  --surface-subtle: #fbfcfb;
  --surface-tint: #e5f2f1;
  --line: #dce4e8;
  --line-strong: #b9c8cf;
  --ink: #14324b;
  --text: #1e3447;
  --muted: #687989;
  --faint: #95a4ae;
  --primary: #14324b;
  --primary-hover: #0e273d;
  --accent: #0b7c82;
  --accent-soft: #e5f2f1;
  --danger: #b74b4b;
  --danger-bg: #fff3f1;
  --focus: #0b7c82;
  --radius-sm: 6px;
  --radius-md: 8px;
  --shadow-raised: 0 10px 28px rgb(20 50 75 / 8%);
}
```

Set the base body font size to `14px` with a `1.45` line height; reserve `12px` for helper text and row metadata. Make headings modest (`h1: 24px`, `h2: 18px`, `h3: 15px`) and use `font-weight: 600` or `650`, never heavy display typography.

Replace the current global "boxed button" treatment with four explicit visual roles. Add presentation classes only; retain every existing `data-action` attribute so event wiring remains unchanged.

```css
.button--primary { background: var(--primary); border-color: var(--primary); color: white; }
.button--secondary { background: var(--surface); border-color: var(--line); color: var(--ink); }
.button--quiet { background: transparent; border-color: transparent; color: var(--muted); }
.button--icon { inline-size: 30px; padding: 0; display: inline-grid; place-items: center; }
```

Apply `button--primary` only to the route’s commit action: save context/day, build checklist, copy prompt, or copy Quick De-ID result. Add `button--quiet` to row overflow/reorder controls and `button--icon` to the existing icon-only buttons. Do not rely indefinitely on the long selector beginning `button[data-action=...]`; migrate it after adding the classes.

## 2. Make the shared shell feel intentional

The static shell is already correctly located in `index.html` (`.app-shell`, `.side-nav`, `.top-bar`, and `.workspace`). Keep its behavior and change its visual geometry as follows:

1. Keep `.side-nav` fixed at `178px`, but give it the warm background and a `1px solid var(--line)` separator. Keep `.brand-lockup` at `56px` high.
2. Give `.primary-nav` `8px` padding and `4px` row gaps. Its normal buttons should have no visible border. Active items should use `background: var(--accent-soft)`, `color: var(--accent)`, and a `3px` left accent inset rather than a full teal outline.
3. Keep the side footer, but render its three trust messages as quiet 11px text separated by spacing—not as pills. The "Local only" promise should remain visible in this location.
4. Set `.top-bar` to `56px`, white, with a single lower divider. Leave `.workspace-heading` hidden at desktop as it currently is; retain only the patient switcher plus one compact lock/local cue. Do not restore the two status pills.
5. Use `padding: 16px 20px` for desktop route content. Keep existing route-owned scrolling (`.stay-content`, `.checklist-scroll`, and the workup/prompt panes); it is a functional layout constraint.

## 3. Stop using one generic card for everything

`styles.css` currently gives `.panel`, `.table-panel`, `.section-editor`, `.workup-editor-card`, and `.prompt-panel` the same white border and 5px radius. Split those responsibilities:

- Major work surfaces (`.stay-layout`, `.checklist-panel`, `.prompt-panel`, `.quick-deid-panel`) may retain a white surface, `8px` radius, and one outer border.
- Ordinary list rows (`.day-row`, `.list-row`, `.check-row`, `.section-editor`, `.workup-editor-card`, `.checklist-item`) should have transparent or white backgrounds with a bottom divider only. Remove individual outer radii and shadows.
- Group headers (`.checklist-system-header`, workup column headers, prompt variable rail) should use `--surface-subtle` or `--surface-tint`, not an extra card.
- Notices should use a 3px colored left rule, a pale tinted background, and no heavy outline. Reserve coral only for actual residual-PHI and destructive states.

## 4. Route-by-route markup and layout changes

### Vault / Roster

Update `renderVault()` and `renderPatientRow()` in `src/ui/app.js`.

- Make the page heading read as a simple title/subtitle block above the roster, with the existing new-patient action aligned right.
- Turn the patient list into one grouped table-like surface: Room, stay status, and last updated should be aligned columns; each patient gets a single bottom divider and a quiet overflow control. Do not wrap every patient in a separate card.
- Retain the vault controls and archive behavior. Move the local-only/encryption explanation into one full-width low-emphasis callout beneath the roster.

### Hospital Stay

Update `renderDaily()`, `renderDayRow()`, `renderDeidStrip()`, `renderSectionEditor()`, and `renderWarnings()`.

- Preserve `.stay-layout` and its route-owned scroll surfaces. Expand its left rail from the current narrow 132px to roughly `220px` on desktop so date, label, and hospital day state are scannable.
- Render days as a vertical timeline/list: a 6px colored dot or left rule marks the selected day; inactive days use only a subtle divider. Keep add/remove actions and date/label inputs functional, but group them in the rail header rather than giving each control its own panel.
- In the main pane, show a single "Admission packet" title row with field count and a sticky `Save changes` primary button at the lower edge. Keep all section buttons and their expand/collapse behavior.
- Turn the model status area into a compact inline safety strip. The selected model control and load button stay on the right; the summary remains on the left. It should be a 44–52px-high tinted row, not a bordered box inside another panel.
- Render the four context sections as full-width rows: drag handle, label, character count, and quiet edit/overflow controls. The expanded textarea can sit below its row on the same surface.

### Workups

Update `renderWorkups()`, `renderWorkupRow()`, `renderWorkupColumn()`, and `renderWorkupItemEditor()`.

- Retain `.workup-editor-layout` and its left catalog/right editor split. Widen the catalog to `240px` and remove its nested cards; workups should be checkbox rows with a small history/exam count and a quiet edit affordance.
- Keep the title, alias, and description fields in one clean metadata row. Place the currently edited workup name prominently at the top of the editor.
- Keep History and Physical Exam as two balanced columns. Use one column header each, then divider-separated editable rows. Each row should show number, prompt, choice mode, and one overflow/action cluster without another enclosing card.
- Preserve drag-and-drop attributes and all hidden IDs. Keep the existing sticky footer, but make `Build checklist` the only strong action and demote JSON import/export/reset actions into a collapsed utility area.

### Checklist and phone transfer

Update `renderChecklist()`, `renderChecklistSection()`, `renderChecklistSystem()`, `renderChecklistItem()`, and `renderPhoneTransfer()`.

- Keep the checklist’s fixed-height scroll owner. Add a small header summary that includes the selected hospital-day label and completed/total count.
- Render History and Physical Exam as section headings, then render systems as muted, compact bands. Use dividers for individual checklist items; do not make each item a mini-card.
- Give the response control a fixed visual column. For select-mode items, keep the native select but use a lighter border and consistent 32px height; for multi-select items, style choice labels as compact segmented controls. Keep baseline negative/normal semantics exactly unchanged.
- Keep optional notes collapsed or visually secondary until used. The existing status dot should become a clear teal completion mark and a neutral outlined circle when unanswered.
- Keep `renderPhoneTransfer()` as the narrow right utility rail: QR, copy link, download fallback, and returned-bundle import. Use a single outer surface and divider-separated blocks. Do not introduce remote phone sync.

### OpenEvidence Prompts

Update `renderPrompts()` and the `.prompt-layout` rules.

- Maintain the existing two-pane desktop arrangement. The editable template and task selector belong on the left; the generated de-identified preview belongs on the right.
- Present smart variables as a compact, scrollable token rail directly beneath the task selector. Their labels can be monospace, but descriptions should remain muted and plain language.
- Give the preview a subtle cool-gray background and mono font. Place `Copy prompt` as the clear primary action directly beneath it, with `Open OpenEvidence` secondary.
- Keep the existing requirement that Guidelines are force-included and that OpenEvidence—not this app—writes clinical prose.

### Quick De-ID

Update `renderQuickDeid()` and `.quick-deid-grid`.

- Keep the existing four data regions but visually label them as a left-to-right sequence: Source text, Local model, Review, De-identified output. The sequence labels are visual only; do not change the order of validation or execution.
- Replace four boxed columns with one outer surface divided by vertical rules. Put the "Runs locally" model state directly below the model select in a small teal callout.
- Residual PHI warnings should use pale coral rows with an explicit `Review` control, preserving the current manual-review actions. Do not reduce their visibility or silently suppress warnings.
- Make the output field visually calm and readable; `Copy result` is the only strong button. Preserve the current no-save behavior.

## 5. Responsive and accessibility pass

- Preserve the existing `1040px` switch to the horizontal navigation and the single-column mobile route layouts. Update the compact navigation to maintain a visible active accent and a 44px minimum tap target.
- At `680px`, stack the Hospital Stay rail before the packet, Workup columns before the utility area, Checklist phone transfer after the checklist, Prompt panes vertically, and all Quick De-ID regions vertically in their current workflow order.
- Do not depend on color alone: active nav, completed items, local-only status, and residual warnings need an icon/text state as well.
- Keep focus outlines at least 2px and use the existing focus behavior for all keyboard-reachable buttons, inputs, selects, and textareas.
- Re-run `npm.cmd run test:ci` after the visual implementation. In particular, keep the browser test’s fixed-height scrolling and all `data-action`, route IDs, accessibility labels, and hidden compatibility selectors intact.

## Recommended implementation order

1. Consolidate CSS tokens, shell geometry, button roles, and surface/row primitives.
2. Restyle the static shell in `index.html` and verify navigation at desktop and 1040px.
3. Implement Hospital Stay and Checklist first; they establish the dense row patterns reused by the other routes.
4. Apply the same row/surface primitives to Vault, Workups, Prompts, and Quick De-ID without changing their state or event logic.
5. Test keyboard focus, responsive layouts, local-only labels, residual-PHI warnings, phone-bundle round trips, and all current smoke tests.
