import { updateActivePatient } from "../app/state/vault.js";

export function createAdmissionDateAnchor({ state, active, sortDays }) {
  function restore() {
    const patient = active();
    if (!patient) {
      state.admissionDate = "";
      return "";
    }
    const stored = String(patient.metadata?.admissionDate || "").trim();
    const fallback = sortDays(patient.days || [])[0]?.date || "";
    state.admissionDate = stored || fallback;
    return state.admissionDate;
  }

  function remember() {
    if (!state.admissionDate || !active()) return;
    state.vault = updateActivePatient(state.vault, (patient) => ({
      ...patient,
      metadata: { ...(patient.metadata || {}), admissionDate: state.admissionDate }
    }));
  }

  return Object.freeze({ restore, remember });
}
