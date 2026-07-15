import { hueToHex, setTokenColorOverride, tokenAccentHue } from "../prompts/custom-templates.js";

// Every token color in this app is a single hue (tokenAccentColor always
// renders at a fixed saturation/lightness) - so the picker only ever offers
// a hue, never full RGB. That's deliberate, not a limitation to work around:
// the previous native <input type="color"> implied any color was pickable,
// but a near-black/gray/white pick has no defined hue (R≈G≈B), so it was
// silently snapping to hue 0 (red) - "picked black, got red back" was that
// mismatch between what the control implied and what the model can store,
// not an event-handling bug. A hue-only picker can't misrepresent that.
export function tokenColorSwatchButton(token, colorOverrides, escapeHtml) {
  const hue = tokenAccentHue(token, colorOverrides);
  return `<button type="button" class="token-color-swatch" data-action="open-token-color-picker" data-token="${escapeHtml(token)}" style="background:${hueToHex(hue)}" aria-label="Change color for ${escapeHtml(token)}" title="Change color for ${escapeHtml(token)}"></button>`;
}

export function createTokenColorPickerController({ byId, getOverrides, saveOverrides, onApplied }) {
  let activeToken = null;
  let activeAnchor = null;
  let draftHue = 0;
  let dragging = false;

  const picker = () => byId("tokenColorPicker");
  const track = () => picker()?.querySelector('[data-role="hue-track"]');
  const thumb = () => picker()?.querySelector('[data-role="hue-thumb"]');

  // Repaints both the thumb position and the swatch that opened the picker
  // live, on every drag step - not just once on commit - so the swatch
  // actually shows what you're dragging toward instead of looking inert
  // until you let go and click Apply.
  function paintPreview() {
    const thumbEl = thumb();
    if (thumbEl) thumbEl.style.left = `${(draftHue / 360) * 100}%`;
    if (activeAnchor) activeAnchor.style.background = hueToHex(draftHue);
  }

  function hueFromEvent(event) {
    const rect = track()?.getBoundingClientRect();
    if (!rect || !rect.width) return draftHue;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * 360) % 360;
  }

  function isOpen() {
    const panel = picker();
    return Boolean(panel && !panel.hidden);
  }

  // A no-token close (Cancel, or dismissing without ever dragging) must put
  // the swatch back to its last-saved color, since paintPreview() already
  // repainted it live to whatever hue was dragged past.
  function revertAnchor() {
    if (activeAnchor && activeToken) activeAnchor.style.background = hueToHex(tokenAccentHue(activeToken, getOverrides()));
  }

  function close() {
    const panel = picker();
    if (panel) panel.hidden = true;
    activeToken = null;
    activeAnchor = null;
    dragging = false;
  }

  // Dismissing the picker any way other than the explicit Cancel button
  // (clicking elsewhere, opening a different token's picker) keeps whatever
  // hue was last dragged to, instead of silently discarding the pick - the
  // Cancel button is the only path that throws the draft away.
  function commit() {
    const token = activeToken;
    if (!token) { close(); return; }
    saveOverrides(setTokenColorOverride(getOverrides(), token, draftHue));
    close();
    onApplied?.(token);
  }

  function cancel() {
    revertAnchor();
    close();
  }

  // sourceEvent is optional - passed through so callers whose swatch sits
  // inside a native toggle (the Settings page's <summary>) don't also have
  // to remember to suppress that toggle themselves.
  function open(token, anchorEl, sourceEvent) {
    const panel = picker();
    if (!panel || !anchorEl || !token) return;
    sourceEvent?.preventDefault();
    if (isOpen() && activeToken !== token) commit();
    activeToken = token;
    activeAnchor = anchorEl;
    draftHue = tokenAccentHue(token, getOverrides());
    panel.hidden = false;
    paintPreview();
    // Docks below the whole row (not just the small swatch, which usually
    // sits vertically centered partway down a taller row) - anchoring to
    // just the swatch's own rect put the picker overlapping the row's lower
    // half instead of sitting cleanly underneath it.
    const rowEl = anchorEl.closest(".smart-variable-row, summary") || anchorEl;
    const rect = rowEl.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 6}px`;
    const maxLeft = window.innerWidth - panel.offsetWidth - 8;
    panel.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
  }

  function init() {
    const panel = picker();
    const trackEl = track();
    if (!panel || !trackEl) return;
    trackEl.addEventListener("pointerdown", (event) => {
      dragging = true;
      trackEl.setPointerCapture(event.pointerId);
      draftHue = hueFromEvent(event);
      paintPreview();
    });
    trackEl.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      draftHue = hueFromEvent(event);
      paintPreview();
    });
    trackEl.addEventListener("pointerup", () => { dragging = false; });
    trackEl.addEventListener("pointercancel", () => { dragging = false; });
    panel.querySelector('[data-action="accept-token-color"]')?.addEventListener("click", commit);
    panel.querySelector('[data-action="cancel-token-color"]')?.addEventListener("click", cancel);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) cancel();
    });
    // Capture phase, so this runs before whatever the click would otherwise
    // do (e.g. opening a different token's picker) - see open()'s own
    // commit-before-reopen call for that sequencing.
    document.addEventListener("pointerdown", (event) => {
      if (!isOpen() || event.target.closest("#tokenColorPicker")) return;
      commit();
    }, true);
  }

  return Object.freeze({ init, open, close, isOpen });
}
