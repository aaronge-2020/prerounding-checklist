// Pure helpers for the admission-date dialog: typed-date parsing lives here,
// outside the DOM code, so the gate and the tests share one definition of
// what a typed date means.
//
// Typed entry exists because the native date control cannot be typed into
// in every browser, and its calendar picker can close without the user
// noticing whether the value stuck. The typed field accepts mm/dd/yyyy
// (the order the dialog asks for) and yyyy-mm-dd, and returns the ISO
// yyyy-mm-dd string the rest of the app stores, or null for anything that
// is not a real calendar date.

function isRealDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toIso(year, month, day) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseTypedAdmissionDate(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso.map(Number);
    return isRealDate(year, month, day) ? toIso(year, month, day) : null;
  }
  const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const [, month, day, year] = us.map(Number);
    return isRealDate(year, month, day) ? toIso(year, month, day) : null;
  }
  return null;
}

export function todayIsoDate(now = new Date()) {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
