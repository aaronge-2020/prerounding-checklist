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
  const buttons = [...menu.querySelectorAll("button[data-token]")];
  let visibleCount = 0;
  buttons.forEach((button) => {
    const matches = !normalized || button.dataset.token.replace(/^@/, "").toLowerCase().includes(normalized);
    button.hidden = !matches;
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
  mirror.style.boxSizing = "content-box";
  MIRRORED_TEXTAREA_PROPERTIES.forEach((prop) => { mirror.style[prop] = computed[prop]; });
  document.body.appendChild(mirror);
  const caretIndex = textarea.selectionStart || 0;
  mirror.textContent = textarea.value.slice(0, caretIndex);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(caretIndex) || ".";
  mirror.appendChild(marker);
  const offset = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: marker.offsetHeight || parseInt(computed.lineHeight, 10) || 16
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
