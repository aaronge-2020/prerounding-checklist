import { addCustomPromptTask, removeCustomPromptTask, saveCustomPromptTasks } from "../../prompts/custom-tasks.js";
import { savePromptTemplateOverrides } from "../../prompts/custom-templates.js";
import { OPEN_EVIDENCE_TASKS } from "../../prompts/open-evidence.js";

// Create/delete custom prompt tasks - kept out of app.js to respect the
// coordinator-file size boundary (scripts/check-ui-module-boundaries.js).
// `state` is the shared app state object, mutated directly the same way
// the other controllers in src/ui/checklist/ already do.
export function createPromptTaskController({ state, setStatus, renderPrompts, byId }) {
  function createTaskFromInput() {
    const input = byId("newPromptTaskNameInput");
    const label = String(input?.value || "").trim();
    if (!label) throw new Error("Name the new prompt before creating it.");
    const nextTasks = addCustomPromptTask(state.customPromptTasks, label);
    state.customPromptTasks = nextTasks;
    saveCustomPromptTasks(nextTasks);
    state.selectedPromptTask = nextTasks.at(-1).id;
    if (input) input.value = "";
    renderPrompts();
  }

  function requestRemove(taskId) {
    state.pendingRemovePromptTaskId = taskId;
    byId("removePromptTaskConfirmDialog")?.showModal();
  }

  function confirmRemovePending() {
    const taskId = state.pendingRemovePromptTaskId;
    if (!taskId) return;
    state.customPromptTasks = removeCustomPromptTask(state.customPromptTasks, taskId);
    saveCustomPromptTasks(state.customPromptTasks);
    const nextOverrides = { ...state.promptTemplates };
    delete nextOverrides[taskId];
    state.promptTemplates = nextOverrides;
    savePromptTemplateOverrides(nextOverrides);
    delete state.promptDrafts[taskId];
    if (state.selectedPromptTask === taskId) state.selectedPromptTask = OPEN_EVIDENCE_TASKS[0].id;
    state.pendingRemovePromptTaskId = "";
    byId("removePromptTaskConfirmDialog")?.close();
    setStatus("Custom prompt deleted.");
    renderPrompts();
  }

  return Object.freeze({ createTaskFromInput, requestRemove, confirmRemovePending });
}

// Filters the already-rendered variable buttons in place (same
// hide-non-matching-rows pattern as the checklist search/workup catalog
// filters) instead of re-rendering, so the textarea keeps focus and caret
// position while the user is mid-keystroke.
export function filterSmartVariableMenu(menu, query) {
  if (!menu) return;
  const normalized = String(query || "").trim().toLowerCase();
  const rows = [...menu.querySelectorAll(".smart-variable-row[data-token]")];
  let visibleCount = 0;
  rows.forEach((row) => {
    const matches = !normalized || row.dataset.token.replace(/^@/, "").toLowerCase().includes(normalized);
    row.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  let empty = menu.querySelector(".smart-variable-empty");
  if (!visibleCount) {
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "smart-variable-empty muted";
      empty.textContent = "No matching variables.";
      menu.appendChild(empty);
    }
  } else {
    empty?.remove();
  }
}

// Properties that affect how a textarea wraps and lays out its text - mirrored
// onto a hidden clone so a <span> inserted at the caret index lands exactly
// where the real caret is rendered. Standard "mirror div" caret-tracking
// technique (the same approach textarea-caret-position libraries use).
const MIRRORED_TEXTAREA_PROPERTIES = [
  "direction", "width", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontFamily", "lineHeight",
  "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize"
];

function caretOffsetWithinTextarea(textarea) {
  const mirror = document.createElement("div");
  const computed = window.getComputedStyle(textarea);
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  // Match the textarea's own box-sizing (border-box everywhere in this app)
  // so the mirrored width copied below wraps text identically - mismatched
  // box-sizing made the mirror wider than the real textarea, so the caret
  // marker landed on the wrong line and the menu opened far from the caret.
  mirror.style.boxSizing = computed.boxSizing;
  MIRRORED_TEXTAREA_PROPERTIES.forEach((prop) => { mirror.style[prop] = computed[prop]; });
  document.body.appendChild(mirror);
  const caretIndex = textarea.selectionStart || 0;
  mirror.textContent = textarea.value.slice(0, caretIndex);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(caretIndex) || ".";
  mirror.appendChild(marker);
  // The marker holds all the *remaining* text after the caret so its top/left
  // land on the right line - but when that remaining text wraps onto several
  // lines (anything past the caret with more line breaks below it), the
  // marker span itself spans that many line boxes. offsetHeight sums the
  // bounding box across every one of those line boxes, not just the caret's
  // own line - with a few hundred characters left in the textarea that
  // inflated "line height" to several lines' worth, and the menu opened that
  // much too low. getClientRects()[0] is just the first line box: the actual
  // line the caret sits on.
  const markerLineRect = marker.getClientRects()[0];
  const offset = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: markerLineRect?.height || parseInt(computed.lineHeight, 10) || 16
  };
  document.body.removeChild(mirror);
  return offset;
}

// Docks the menu directly under the line the user is currently typing on
// (like Epic's SmartPhrase menu), flipping above the caret when there isn't
// room below, instead of sitting at a fixed spot that can cover other text.
export function positionSmartVariableMenu(menu, textarea) {
  if (!menu || !textarea) return;
  const wrap = menu.parentElement;
  if (!wrap) return;
  const caret = caretOffsetWithinTextarea(textarea);
  const textareaBox = textarea.getBoundingClientRect();
  const wrapBox = wrap.getBoundingClientRect();
  const lineTop = textareaBox.top + (caret.top - textarea.scrollTop);
  const lineBottom = lineTop + caret.height;
  const lineLeft = textareaBox.left + (caret.left - textarea.scrollLeft);

  const menuHeight = menu.offsetHeight || 230;
  const openUpward = window.innerHeight - lineBottom < menuHeight && lineTop > menuHeight;
  const viewportTop = openUpward ? lineTop - menuHeight : lineBottom;

  const menuWidth = menu.offsetWidth || 260;
  const maxLeft = Math.max(textareaBox.left, textareaBox.right - menuWidth);
  const viewportLeft = Math.min(Math.max(lineLeft, textareaBox.left), maxLeft);

  menu.style.top = `${viewportTop - wrapBox.top}px`;
  menu.style.left = `${viewportLeft - wrapBox.left}px`;
}

// The generated prompt is its own scroll surface. Scroll that surface after
// insertion rather than the page, so the newly inserted variable's filled
// content is immediately visible on the right-hand preview.
export function scrollPromptOutputToVariable(output, token) {
  if (!output || !token) return false;
  const target = [...output.querySelectorAll(".var-fill[data-token]")]
    .find((element) => element.dataset.token === token);
  if (!target) return false;
  const targetTop = target.offsetTop - output.offsetTop;
  const centeredTop = targetTop - Math.max(0, (output.clientHeight - target.offsetHeight) / 3);
  output.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
  return true;
}

// Finds the smart-variable token under the caret in the transparent editor.
// The editor sits above the highlighted backdrop, so this lets a click on a
// colored token behave like a click on the corresponding preview highlight.
export function promptVariableTokenAtCaret(value, caret) {
  const text = String(value || "");
  const position = Number.isFinite(caret) ? caret : text.length;
  const matches = text.matchAll(/@[a-z][\w-]*/gi);
  for (const match of matches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (position >= start && position <= end) return match[0];
  }
  return "";
}
