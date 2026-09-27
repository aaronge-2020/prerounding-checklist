// Pregnancy Due Dates Calculator.
// Pure module: no DOM, no storage, no network.
//
// Mirrors MDCalc "Pregnancy Due Dates Calculator" (MDCalc calc 423) one-to-one:
//   - the same 5 entry modes: last menstrual period, EGA as of today, EGA as of
//     another date, estimated date of conception, estimated due date
//   - cycle length adjustment: EDD = 1st day of LMP + 40 weeks + (cycle length - 28 days)
//   - EDC = LMP + 2 weeks; EGA = time since 1st day of LMP
//   - default cycle length 28 days
// MDCalc formula text: "Estimated gestational age (EGA) = time since 1st day
// of last menstrual period (LMP). Estimated date of conception (EDC) = two
// weeks* since 1st day of LMP. Estimated due date (EDD) = 1st day of LMP +
// 40 weeks* (Naegele's Rule). *Assumes 28 day cycle. If cycle is longer than
// 28 days, this calculator adds the number of days more than 28 to obtain EDD."

export const DUE_DATE_MODES = [
  { value: "lmp", label: "Last menstrual period" },
  { value: "ega-today", label: "Estimated gestational age (EGA) as of today" },
  { value: "ega-on-date", label: "EGA as of another date" },
  { value: "conception", label: "Estimated date of conception" },
  { value: "edd", label: "Estimated due date" }
];

export const DUE_DATES_INPUTS = [
  {
    key: "cycleLength",
    label: "Cycle length",
    type: "number",
    unit: "days",
    min: 20,
    max: 45,
    step: 1,
    defaultValue: 28,
    placeholder: "28"
  },
  {
    key: "mode",
    label: "Dates to enter",
    type: "radio",
    defaultValue: "lmp",
    options: DUE_DATE_MODES
  },
  {
    key: "dateISO",
    label: "Date",
    type: "date",
    modes: ["lmp", "conception", "edd"],
    modeLabels: {
      lmp: "First day of last menstrual period",
      conception: "Estimated date of conception",
      edd: "Estimated due date"
    },
    pull: { kind: "text", field: "lmpISO", modes: ["lmp"] }
  },
  {
    key: "egaWeeks",
    label: "EGA \u2014 weeks",
    type: "number",
    min: 0,
    max: 44,
    step: 1,
    modes: ["ega-today", "ega-on-date"],
    placeholder: "e.g. 39",
    pull: { kind: "text", field: "egaWeeks", modes: ["ega-today", "ega-on-date"] }
  },
  {
    key: "egaDays",
    label: "EGA \u2014 days",
    type: "number",
    min: 0,
    max: 6,
    step: 1,
    modes: ["ega-today", "ega-on-date"],
    placeholder: "e.g. 2",
    pull: { kind: "text", field: "egaDays", modes: ["ega-today", "ega-on-date"] }
  },
  {
    key: "egaDateISO",
    label: "Date of EGA (e.g. date of ultrasound)",
    type: "date",
    modes: ["ega-on-date"]
  }
];

const DAY_MS = 24 * 60 * 60 * 1000;

function parseISODate(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function todayUTC(todayISO) {
  const parsed = parseISODate(todayISO);
  if (parsed) return parsed;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function calculateDueDates(values = {}) {
  const missing = [];
  const mode = DUE_DATE_MODES.some((entry) => entry.value === values.mode) ? values.mode : null;
  if (!mode) missing.push("Dates to enter");
  const cycleLength = finiteNumber(values.cycleLength) ?? 28;
  const today = todayUTC(values.todayISO);
  const cycleAdjustment = cycleLength - 28;

  let lmp = null;
  if (mode === "lmp") {
    lmp = parseISODate(values.dateISO);
    if (!lmp) missing.push("First day of last menstrual period");
  } else if (mode === "conception") {
    const conception = parseISODate(values.dateISO);
    if (!conception) missing.push("Estimated date of conception");
    else lmp = addDays(conception, -14);
  } else if (mode === "ega-today" || mode === "ega-on-date") {
    const weeks = finiteNumber(values.egaWeeks);
    const days = finiteNumber(values.egaDays);
    if (weeks === null || days === null) {
      missing.push("Estimated gestational age");
    } else {
      const anchor = mode === "ega-today" ? today : parseISODate(values.egaDateISO);
      if (!anchor) missing.push("Date of EGA (e.g. date of ultrasound)");
      else lmp = addDays(anchor, -(weeks * 7 + days));
    }
  }

  let edd = null;
  if (mode === "edd") {
    edd = parseISODate(values.dateISO);
    if (!edd) missing.push("Estimated due date");
    else lmp = addDays(edd, -(280 + cycleAdjustment));
  } else if (lmp) {
    edd = addDays(lmp, 280 + cycleAdjustment);
  }

  if (missing.length || !lmp || !edd) {
    return { complete: false, missing, eddISO: null, lmpISO: null, conceptionISO: null, egaToday: null, interpretation: null };
  }

  const egaTodayDays = Math.round((today.getTime() - lmp.getTime()) / DAY_MS);
  const egaWeeksToday = Math.floor(egaTodayDays / 7);
  const egaDaysToday = egaTodayDays - egaWeeksToday * 7;
  const conception = addDays(lmp, 14);
  const egaToday = { weeks: egaWeeksToday, days: egaDaysToday, totalDays: egaTodayDays };

  // MDCalc labels its result rows "Gestational age", "Due date",
  // "Last menstrual period", "Date of conception". Like MDCalc, the
  // gestational-age row is omitted when EGA is the entered input.
  const rows = [
    `Due date: ${formatLongDate(toISODate(edd))}`,
    `Last menstrual period: ${formatLongDate(toISODate(lmp))}`,
    `Date of conception: ${formatLongDate(toISODate(conception))}`
  ];
  if (mode !== "ega-today" && mode !== "ega-on-date") {
    rows.splice(0, 0, `Gestational age: ${formatEgaLong(egaToday)}`);
  }
  rows.push(`(cycle ${cycleLength} days)`);

  return {
    complete: true,
    missing: [],
    eddISO: toISODate(edd),
    lmpISO: toISODate(lmp),
    conceptionISO: toISODate(conception),
    egaToday,
    interpretation: {
      band: "calculated",
      headline: `Due date: ${formatLongDate(toISODate(edd))}`,
      detail: rows.join(" \u00B7 ")
    }
  };
}

export function formatGestationalAge(ega) {
  if (!ega) return "";
  return `${ega.weeks}w${ega.days}d`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// MDCalc renders result dates as e.g. "Thursday, Oct 8, 2026"
// (verified against the live calculator 2026-09-26).
export function formatLongDate(isoDate) {
  const date = parseISODate(isoDate);
  if (!date) return "";
  return `${WEEKDAY_NAMES[date.getUTCDay()]}, ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function formatEgaLong(ega) {
  if (!ega) return "";
  return `${ega.weeks} weeks & ${ega.days} days`;
}

export const dueDatesDefinition = {
  verifiedOn: "2026-09-26",
  id: "due-dates",
  title: "Pregnancy Due Dates",
  subtitle: "EDD, EGA & conception from LMP or ultrasound",
  mdcalcId: "423",
  mdcalcUrl: "https://www.mdcalc.com/calc/423/pregnancy-due-dates-calculator",
  reference: "Naegele's rule with cycle-length adjustment; ACOG: first-trimester ultrasound (through 13 6/7 weeks) is the most accurate dating method.",
  inputs: DUE_DATES_INPUTS,
  calculate: calculateDueDates
};
