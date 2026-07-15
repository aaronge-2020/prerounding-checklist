// Captures the real hospital admission date once per session via the native
// <dialog id="admissionDateDialog">. The value is kept only on the in-memory
// app state (never persisted) and used solely to anchor de-identified dates
// to Hospital Day numbers.
export function createAdmissionDateGate({ app, byId }) {
  function requestAdmissionDateFromUser() {
    return new Promise((resolve, reject) => {
      const dialog = byId("admissionDateDialog");
      const input = byId("admissionDateInput");
      if (!dialog || !input) {
        reject(new Error("Admission date dialog is unavailable."));
        return;
      }
      input.value = app.admissionDate || "";
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        if (dialog.returnValue === "confirm" && input.value) {
          app.admissionDate = input.value;
          resolve(input.value);
        } else {
          reject(new Error("Admission date is required before de-identifying."));
        }
      };
      dialog.addEventListener("close", onClose);
      dialog.showModal();
    });
  }

  return { requestAdmissionDateFromUser };
}
