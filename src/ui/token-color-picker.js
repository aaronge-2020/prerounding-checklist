import { setTokenColorOverride, tokenAccentHex } from "../prompts/custom-templates.js";

export function tokenColorSwatchButton(token, colorOverrides, escapeHtml) {
  const color = tokenAccentHex(token, colorOverrides);
  return `<button type="button" class="token-color-swatch" data-action="open-token-color-picker" data-token="${escapeHtml(token)}" style="background:${color}" aria-label="Change color for ${escapeHtml(token)}" title="Change color for ${escapeHtml(token)}"></button>`;
}

export function createTokenColorPickerController({ byId, getOverrides, saveOverrides, onApplied }) {
  let activeToken = null;
  let activeAnchor = null;
  let draftColor = "#0f766e";

  const picker = () => byId("tokenColorPicker");
  const colorInput = () => picker()?.querySelector('[data-role="color-input"]');

  function isOpen() {
    const panel = picker();
    return Boolean(panel && !panel.hidden);
  }

  function revertAnchor() {
    if (activeAnchor && activeToken) activeAnchor.style.background = tokenAccentHex(activeToken, getOverrides());
  }

  function close() {
    const panel = picker();
    if (panel) panel.hidden = true;
    activeToken = null;
    activeAnchor = null;
  }

  function commit() {
    const token = activeToken;
    if (!token) { close(); return; }
    saveOverrides(setTokenColorOverride(getOverrides(), token, draftColor));
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
    draftColor = tokenAccentHex(token, getOverrides());
    panel.hidden = false;
    const input = colorInput();
    if (input) input.value = draftColor;
    const value = panel.querySelector('[data-role="color-value"]');
    if (value) value.textContent = draftColor.toUpperCase();
    if (activeAnchor) activeAnchor.style.background = draftColor;
    // Docks below the whole row (not just the small swatch, which usually
    // sits vertically centered partway down a taller row) - anchoring to
    // just the swatch's own rect put the picker overlapping the row's lower
    // half instead of sitting cleanly underneath it.
    const rowEl = anchorEl.closest(".smart-variable-row, .guideline-row") || anchorEl;
    const rect = rowEl.getBoundingClientRect();
    const panelHeight = panel.offsetHeight || 120;
    const belowTop = rect.bottom + 6;
    const top = belowTop + panelHeight <= window.innerHeight - 8
      ? belowTop
      : Math.max(8, rect.top - panelHeight - 6);
    panel.style.top = `${top}px`;
    const maxLeft = window.innerWidth - panel.offsetWidth - 8;
    panel.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
  }

  function init() {
    const panel = picker();
    if (!panel || !colorInput()) return;
    colorInput().addEventListener("input", (event) => {
      draftColor = event.target.value;
      if (activeAnchor) activeAnchor.style.background = draftColor;
      const value = panel.querySelector('[data-role="color-value"]');
      if (value) value.textContent = draftColor.toUpperCase();
    });
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
