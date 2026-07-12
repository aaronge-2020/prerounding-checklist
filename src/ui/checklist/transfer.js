import {
  createChecklistReturnTransferFile,
  createPhoneChecklistTransferFile,
  encodeChecklistReturnBundle,
  encodePhoneChecklistBundle
} from "../../checklist/state.js?v=20260711-functional-remediation-19";

export function checklistPhoneUrl(location, bundle) {
  return `${location.origin}${location.pathname}#phone=${encodePhoneChecklistBundle(bundle)}`;
}

export function checklistReturnCode(bundle) {
  return encodeChecklistReturnBundle(bundle);
}

function transferFile(FileConstructor, name, contents) {
  if (typeof FileConstructor !== "function") return null;
  return new FileConstructor([JSON.stringify(contents, null, 2)], name, { type: "application/json" });
}

// The browser/OS APIs are injected so this boundary stays deterministic in
// tests and contains the only deliberate browser side effects for transfer.
export function createPhoneTransferController({
  FileConstructor,
  getChecklistBundle,
  getReturnBundle,
  location,
  navigatorObject,
  downloadJson,
  setStatus
}) {
  function currentChecklistUrl() {
    return checklistPhoneUrl(location, getChecklistBundle());
  }

  function currentReturnCode() {
    return checklistReturnCode(getReturnBundle());
  }

  function downloadChecklist() {
    downloadJson("prerounding-checklist.bundle.json", createPhoneChecklistTransferFile(getChecklistBundle()));
    setStatus("Checklist bundle downloaded. Open it on the phone or use Open shared file.");
  }

  function downloadReturn() {
    downloadJson("prerounding-checklist-return.bundle.json", createChecklistReturnTransferFile(getReturnBundle()));
    setStatus("Returned answers bundle downloaded.");
  }

  async function shareChecklist() {
    const url = currentChecklistUrl();
    if (typeof navigatorObject?.share !== "function") {
      downloadChecklist();
      return;
    }
    try {
      await navigatorObject.share({ title: "Prerounding checklist", text: "Open this checklist on the phone.", url });
      setStatus("Checklist link shared.");
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("Sharing cancelled.");
        return;
      }
      downloadChecklist();
    }
  }

  // A file (not a link) so AirDropping it never opens a second tab/instance
  // of the app - it just lands as a file to import, same as a download.
  async function shareReturn() {
    const file = transferFile(FileConstructor, "prerounding-checklist-return.bundle.json", createChecklistReturnTransferFile(getReturnBundle()));
    if (!file || typeof navigatorObject?.share !== "function" || (navigatorObject.canShare && !navigatorObject.canShare({ files: [file] }))) {
      downloadReturn();
      return;
    }
    try {
      await navigatorObject.share({ title: "Prerounding checklist answers", files: [file] });
      setStatus("Returned answers file shared.");
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("Sharing cancelled.");
        return;
      }
      downloadReturn();
    }
  }

  return Object.freeze({ currentChecklistUrl, currentReturnCode, downloadChecklist, downloadReturn, shareChecklist, shareReturn });
}
