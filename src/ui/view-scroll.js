import { safeHtml } from "../lib/safe-html.js?v=20261012-safety";
// A render transaction owns only its subtree and its surviving scroll ancestors.
// Resolve replaced descendants by identity; never restore disconnected DOM nodes.
// Restoration is synchronous after layout, so no queued callback can overwrite
// a subsequent user scroll, route change, or another render.
export function preserveViewScroll(content, update) {
  const snapshot = captureScrollPositions(content);
  const descendants = [...(content?.querySelectorAll?.("*") || [])];
  const details = descendants.filter(el => el.tagName === "DETAILS")
    .map(el => ({ selector: relativeSelector(content, el), open: el.open }));
  const active = typeof document === "undefined" ? null : document.activeElement;
  const focused = active && content?.contains?.(active) ? active : null;
  const focusSelector = focused ? relativeSelector(content, focused) : null;
  const selection = focused && typeof focused.selectionStart === "number"
    ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
  focused?.blur?.();
  const result = update();
  for (const entry of details) {
    const el = content?.querySelector?.(entry.selector);
    if (el?.tagName === "DETAILS") el.open = entry.open;
  }
  const next = focusSelector ? content?.querySelector?.(focusSelector) : null;
  if (next && !next.disabled) {
    next.focus?.({ preventScroll: true });
    if (selection) next.setSelectionRange?.(...selection);
  }
  restoreScrollPositions(content, snapshot);
  return result;
}

export function replaceViewContent(content, markup, { text = false } = {}) {
  if (!content) return;
  preserveViewScroll(content, () => {
    if (text) content.textContent = markup;
    else content.innerHTML = safeHtml(markup);
  });
}

// Chat messages pane: where a freshly rendered pane should scroll.
// Follows the bottom when the reader was pinned there (or the pane is new),
// so new messages still arrive in view; otherwise keeps the reader's
// position, clamped to the new content height. Capture previous metrics before
// replacing the DOM: detached elements no longer have meaningful dimensions.
export function chatPaneScrollTop(pane, previous) {
  const max = Math.max(0, pane.scrollHeight - pane.clientHeight);
  if (!previous) return max;
  const wasPinned =
    previous.scrollHeight - previous.scrollTop - previous.clientHeight <= 64;
  if (wasPinned) return max;
  return Math.min(previous.scrollTop, max);
}

// Explicit scroll keys identify panes whose siblings change during review.
export function relativeSelector(root, element) {
  if (element === root) return ":scope";
  const escape = value => globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
  const parts = [];
  for (let node = element; node && node !== root; node = node.parentElement) {
    if (node.id) { parts.unshift(`#${escape(node.id)}`); break; }
    const tag = node.tagName.toLowerCase();
    const hook = ["data-scroll-key", "data-hipaa-piece-id", "data-note-scope", "data-structured-primary-note-scope", "data-action"].find(key => node.getAttribute?.(key));
    let part = hook ? `${tag}[${hook}="${escape(node.getAttribute(hook))}"]` : tag;
    if (hook === "data-action") {
      for (const key of ["data-piece", "data-redaction", "data-problem-id", "data-mode"]) {
        if (node.hasAttribute?.(key)) part += `[${key}="${escape(node.getAttribute(key))}"]`;
      }
    }
    if (!hook && node.parentElement) {
      const siblings = [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(" > ");
}

export function captureScrollPositions(root) {
  if (!root) return [];
  const snapshot = [];
  const doc = typeof document === "undefined" ? null : document;
  const seen = new Set();
  const consider = (el, selector, owner = null) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    if (el.scrollTop || el.scrollLeft) snapshot.push({ selector, top: el.scrollTop, left: el.scrollLeft, ...(owner ? { owner } : {}) });
  };
  consider(root, ":scope");
  for (const el of root.querySelectorAll?.("*") || []) consider(el, relativeSelector(root, el));
  for (let el = root.parentElement; el; el = el.parentElement) consider(el, null, el);
  consider(root.closest?.(".view"), null, root.closest?.(".view"));
  consider(doc?.scrollingElement || doc?.documentElement, null, doc?.scrollingElement || doc?.documentElement);
  return snapshot;
}

export function restoreScrollPositions(root, snapshot) {
  for (const { selector, owner, top, left } of snapshot || []) {
    // Ancestors survive replacement. Descendants must resolve within this root,
    // never the first matching pane in another route or patient's workspace.
    const el = owner || (selector === ":scope" ? root : root?.querySelector?.(selector));
    if (!el || el.isConnected === false) continue;
    el.scrollTop = top;
    el.scrollLeft = left;
  }
}
