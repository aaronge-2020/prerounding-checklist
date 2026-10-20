// Captures the real hospital admission date once per session via the native
// <dialog id="admissionDateDialog">. The value is kept in the in-memory app
// state and copied into the encrypted active-patient metadata when a save
// completes. It anchors de-identified dates to Hospital Day numbers.
//
// R10: the dialog is the fallback, not the first stop. The Hospital Stay
// page already carries an admission-date field; if the user entered a date
// there, the gate uses it and never interrupts de-identification.
// R9: inside the dialog, the user can pick a date, type it as mm/dd/yyyy,
// or press "Use today". A typed date that is not a real date shows an error
// in the dialog instead of closing it with nothing saved.
import { parseTypedAdmissionDate, todayIsoDate } from "./admission-date-input.js?v=20261020-aloop-fixes";

export function createAdmissionDateGate({ app, byId }) {
  function dateEnteredOnPage() {
    const inline = byId("dailyAdmissionDateInput")?.value || "";
    return parseTypedAdmissionDate(inline) || "";
  }

  function requestAdmissionDateFromUser() {
    const onPage = dateEnteredOnPage();
    if (onPage) {
      app.admissionDate = onPage;
      return Promise.resolve(onPage);
    }
    return new Promise((resolve, reject) => {
      const dialog = byId("admissionDateDialog");
      const input = byId("admissionDateInput");
      if (!dialog || !input) {
        reject(new Error("Admission date dialog is unavailable."));
        return;
      }
      const textInput = byId("admissionDateTextInput");
      const todayButton = byId("admissionDateToday");
      const errorLine = byId("admissionDateError");
      const confirmButton = dialog.querySelector('button[value="confirm"]');
      input.value = app.admissionDate || "";
      if (textInput) textInput.value = "";
      if (errorLine) errorLine.hidden = true;

      const showError = (message) => {
        if (errorLine) {
          errorLine.textContent = message;
          errorLine.hidden = false;
        }
      };
      // Validate on Continue instead of on close: an invalid typed date
      // keeps the dialog open with the error visible, rather than the old
      // behavior where the picker closed and nothing was committed.
      const onConfirmClick = (event) => {
        if (input.value) return;
        const typed = String(textInput?.value || "").trim();
        if (!typed) return;
        if (!parseTypedAdmissionDate(typed)) {
          event.preventDefault();
          showError("That date is not a real date. Use mm/dd/yyyy, for example 10/20/2026.");
        }
      };
      const onTodayClick = () => {
        input.value = todayIsoDate();
        if (textInput) textInput.value = "";
        if (errorLine) errorLine.hidden = true;
        dialog.returnValue = "confirm";
        dialog.close();
      };
      const cleanup = () => {
        dialog.removeEventListener("close", onClose);
        confirmButton?.removeEventListener("click", onConfirmClick);
        todayButton?.removeEventListener("click", onTodayClick);
      };
      const onClose = () => {
        cleanup();
        if (dialog.returnValue !== "confirm") {
          reject(new Error("Admission date is required before de-identifying."));
          return;
        }
        const value = input.value || parseTypedAdmissionDate(textInput?.value || "");
        if (value) {
          app.admissionDate = value;
          resolve(value);
        } else {
          reject(new Error("Admission date is required before de-identifying."));
        }
      };
      confirmButton?.addEventListener("click", onConfirmClick);
      todayButton?.addEventListener("click", onTodayClick);
      dialog.addEventListener("close", onClose);
      dialog.showModal();
    });
  }

  return { requestAdmissionDateFromUser };
}
