// Tests for the phone entry point (mobile.html) and the small-screen
// redirect in index.html.
// Run: node tests/test-mobile-entry.js   (exits non-zero on failure)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${name}`);
  }
}

const mobile = read("mobile.html");
const index = read("index.html");
const proto = read("scribe-prototype.html");

// ---- mobile.html contract ------------------------------------------------
check("mobile links the scribe prototype (does not embed it)", mobile.includes('href="./scribe-prototype.html"'), true);
// The phone-first scribe auto-loads on phones: mobile.html forwards straight
// to the scribe unless the bedside escape is present.
check("mobile auto-forwards to the phone scribe", mobile.includes("window.location.replace('./scribe-prototype.html')"), true);
check("mobile bedside escape opts out of the forward", mobile.includes("get('bedside')") && mobile.includes("bedside"), true);
check("scribe prototype links back to bedside cheat sheets", proto.includes('href="./mobile.html?bedside=1"'), true);
check("mobile loads the bundled cheat-sheet data", mobile.includes("./src/data/cheat-sheets.json"), true);
check("mobile has a search field", /id="q"/.test(mobile), true);
check("mobile has no vault passphrase gate", !/passphrase/i.test(mobile) && !/unlock the/i.test(mobile) && !/type="password"/i.test(mobile), true);
check("mobile imports no app modules", !/src\/ui\/app\.js|note-drafts|patient-context/.test(mobile), true);
check("mobile mirrors the search tiers", mobile.includes("titlePrefix: 100") && mobile.includes("systemSub: 15"), true);
check("mobile escapes sheet content", mobile.includes("function esc("), true);
check("mobile offers a full-site escape", mobile.includes('href="./index.html?full=1"'), true);
check("mobile persists the full-site choice", mobile.includes("prerounding.mobileChoice.v1"), true);
check("mobile search input avoids iOS focus zoom", /#q\s*{[^}]*font-size:\s*1[67]px/.test(mobile), true);
check("mobile respects the iPhone safe area", mobile.includes("safe-area-inset"), true);

// ---- redesigned compact UI contract ---------------------------------------
check("detail shows no answer-choice chips by default", !mobile.includes('class="chips"') && !mobile.includes("function chipList"), true);
check("questions render as dense expandable rows", mobile.includes("qrow"), true);
check("tap-to-expand uses aria-expanded", mobile.includes("aria-expanded"), true);
check("expand region shows clinical reasoning (meaning), not answer choices",
  mobile.includes("item.meaning") && !mobile.includes("Listen for:") && !mobile.includes("Findings:"), true);
check("AI-drafted meanings carry a review note", mobile.includes("AI-drafted"), true);
check("fast sheet switcher strip exists", mobile.includes('id="sheetStrip"'), true);
check("History/Exam quick-jump exists", mobile.includes("#sec-history") && mobile.includes("#sec-exam"), true);
check("no checkbox or check-off UI", !/type="checkbox"/.test(mobile), true);

// ---- index.html redirect contract -----------------------------------------
const startMarker = "<!-- mobile-redirect:start";
const endMarker = "mobile-redirect:end -->";
const si = index.indexOf(startMarker);
const ei = index.indexOf(endMarker);
check("index carries the redirect block", si !== -1 && ei > si, true);

const snippet = index.slice(index.indexOf("<script>", si) + "<script>".length, index.indexOf("</script>", si));
check("redirect snippet targets mobile.html", snippet.includes("./mobile.html"), true);
check("redirect snippet honors the persisted choice", snippet.includes("prerounding.mobileChoice.v1"), true);
check("redirect snippet honors ?full=1", snippet.includes("full"), true);
check("redirect snippet never throws (guarded)", /catch\s*\(/.test(snippet), true);

// ---- redirect behavior, exercised with fake browser globals ----------------
function runRedirect({ search = "", storedChoice = null, smallScreen = false, storageThrows = false }) {
  const calls = { replaced: null, stored: {}, replaceState: false };
  const store = storageThrows
    ? { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() {} }
    : {
        getItem: (k) => (k in calls.stored ? calls.stored[k] : storedChoice && k === "prerounding.mobileChoice.v1" ? storedChoice : null),
        setItem: (k, v) => { calls.stored[k] = v; },
        removeItem: (k) => { delete calls.stored[k]; }
      };
  const fakeWindow = {
    location: { search, replace: (u) => { calls.replaced = u; }, pathname: "/prerounding-checklist/index.html" },
    localStorage: store,
    matchMedia: (q) => ({ matches: smallScreen && q === "(max-width: 700px)", media: q }),
    history: { replaceState: () => { calls.replaceState = true; } }
  };
  new Function("window", "URLSearchParams", snippet)(fakeWindow, URLSearchParams);
  return calls;
}

let r = runRedirect({ smallScreen: true });
check("small screen, no choice -> goes to mobile.html", r.replaced, "./mobile.html");

r = runRedirect({ smallScreen: true, search: "?full=1" });
check("?full=1 persists the full choice", r.stored["prerounding.mobileChoice.v1"], "full");
check("?full=1 cleans the URL", r.replaceState, true);
check("?full=1 does not redirect", r.replaced, null);

r = runRedirect({ smallScreen: true, storedChoice: "full" });
check("persisted full choice is honored on small screens", r.replaced, null);

r = runRedirect({ smallScreen: false });
check("large screen, no choice -> stays on full app", r.replaced, null);

r = runRedirect({ smallScreen: false, storedChoice: "mobile" });
check("persisted mobile choice is honored on large screens", r.replaced, "./mobile.html");

r = runRedirect({ smallScreen: true, storageThrows: true });
check("redirect still works when storage is denied", r.replaced, "./mobile.html");

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll mobile entry tests passed.");
