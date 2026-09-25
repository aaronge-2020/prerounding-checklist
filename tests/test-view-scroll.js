// Unit tests for src/ui/view-scroll.js nested-scroller preservation.
// Uses mock nodes (no DOM) with minimal selector support.
import assert from "node:assert/strict";
import {
  captureScrollPositions,
  preserveViewScroll,
  relativeSelector,
  restoreScrollPositions,
} from "../src/ui/view-scroll.js";

// Minimal shims so the real selector path runs under Node.
globalThis.CSS = globalThis.CSS || {
  escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
};
globalThis.document = globalThis.document || { documentElement: null };

function matchesPart(node, part) {
  let nth = null;
  const m = part.match(/:nth-of-type\((\d+)\)$/);
  if (m) {
    nth = Number(m[1]);
    part = part.slice(0, m.index);
  }
  const idm = part.match(/^#(.+)$/);
  if (idm) {
    if (node.id !== idm[1]) return false;
  } else {
    const am = part.match(/^([a-z0-9]+)?\[([a-z0-9-]+)="([^"]*)"\]$/i);
    const tag = am ? am[1] : part;
    if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (am && node.getAttribute(am[2]) !== am[3]) return false;
  }
  if (nth !== null) {
    const siblings = node.parentElement.children.filter(
      (s) => s.tagName === node.tagName
    );
    if (siblings.indexOf(node) + 1 !== nth) return false;
  }
  return true;
}

function mockEl({
  tag = "div",
  id = "",
  attrs = {},
  children = [],
  scrollTop = 0,
  scrollLeft = 0,
  scrollable = false,
} = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    id,
    parentElement: null,
    children,
    scrollTop,
    scrollLeft,
    scrollHeight: scrollable ? 600 : 100,
    clientHeight: 100,
    scrollWidth: 100,
    clientWidth: 100,
    getAttribute(name) {
      if (name === "id") return id || null;
      return Object.hasOwn(attrs, name) ? attrs[name] : null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, "*");
      const out = [];
      const walk = (node) => {
        for (const c of node.children) {
          out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    },
    querySelector(selector) {
      if (selector === ":scope") return el;
      let current = [el];
      for (const part of selector.split(" > ")) {
        const next = [];
        for (const node of current) {
          for (const child of node.children) {
            if (matchesPart(child, part)) next.push(child);
          }
        }
        current = next;
      }
      return current[0] || null;
    },
  };
  for (const c of children) c.parentElement = el;
  return el;
}

// Mirrors the enter-by-section editor: a scrolled section-nav list plus an
// unscrolled editor column inside a scoped section.
function buildTree({ listTop = 0 } = {}) {
  const list = mockEl({
    tag: "div",
    attrs: { class: "structured-note-section-list" },
    scrollTop: listTop,
    scrollable: true,
  });
  const nav = mockEl({
    tag: "nav",
    attrs: { "data-note-scope": "admission" },
    children: [list],
  });
  const editor = mockEl({ tag: "div", attrs: { class: "editor" } });
  return mockEl({
    tag: "section",
    attrs: { "data-structured-primary-note-scope": "admission" },
    children: [nav, editor],
  });
}

const root = buildTree({ listTop: 713 });
const snapshot = captureScrollPositions(root);
assert.equal(snapshot.length, 1, "only the scrolled list is captured");
assert.equal(snapshot[0].top, 713);
assert.equal(snapshot[0].selector, 'nav[data-note-scope="admission"] > div');

// Simulate a re-render: a fresh tree with identical structure but zeroed scroll.
const fresh = buildTree({ listTop: 0 });
restoreScrollPositions(fresh, snapshot);
const freshList = fresh.querySelector(snapshot[0].selector);
assert.equal(freshList.scrollTop, 713, "restore re-applies the list scroll in the new tree");

// relativeSelector prefers stable data hooks over positional paths.
const scoped = root.querySelector(':scope');
assert.equal(relativeSelector(root, root), ":scope");
assert.ok(
  relativeSelector(root, root.children[0]).includes('[data-note-scope="admission"]'),
  "stable data hooks are preferred"
);

// preserveViewScroll keeps working with plain mock nodes (no document).
const scrollOwner = { scrollTop: 640, scrollLeft: 18 };
const viewContent = {
  closest: (selector) => (selector === ".view" ? scrollOwner : null),
  set innerHTML(value) {
    this.markup = value;
    scrollOwner.scrollTop = 0;
    scrollOwner.scrollLeft = 0;
  },
};
const { replaceViewContent } = await import("../src/ui/view-scroll.js");
replaceViewContent(viewContent, "<button>Saved</button>");
assert.equal(viewContent.markup, "<button>Saved</button>");
assert.deepEqual(
  [scrollOwner.scrollTop, scrollOwner.scrollLeft],
  [640, 18],
  "whole-view rerenders preserve route scroll"
);

console.log("view-scroll unit tests passed");
