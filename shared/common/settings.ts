import { UserError } from "./errors";
import { EFFORTS, type Settings } from "./model";

/** Factory defaults. An empty `settings` table behaves exactly like these. */
export const DEFAULT_SETTINGS: Settings = {
  unitName: "40SAR",
  calendarName: "{unit} {company} Training Program",
  calendarOwner: "",
  companies: [
    { name: "Archer", color: "#fbe38e" },
    { name: "Braves", color: "#f6b8b8" },
    { name: "Cougar", color: "#b9e6c6" },
    { name: "Stallion", color: "#bcd5f7" },
    { name: "Hercules", color: "#1d1d1f" },
  ],
  categories: [
    { name: "Outfield", color: "#bbf7d0", googleColorId: "10", legend: "green" },
    { name: "External Training", color: "#bae6fd", googleColorId: "9", legend: "blue or lavender" },
    { name: "Physical Training", color: "#fef08a", googleColorId: "5", legend: "yellow, or solid deep orange/amber" },
    { name: "Live Firing/HRA", color: "#fed7aa", googleColorId: "6", legend: "peach, salmon, brown or red" },
    { name: "Off/Leave/Weekend", color: "#e4e4e7", googleColorId: "8", legend: "grey" },
  ],
  periods: [
    { key: "0", label: "0", start: "05:30", end: "06:50" },
    { key: "1", label: "1", start: "07:00", end: "07:50" },
    { key: "2", label: "2", start: "08:00", end: "08:50" },
    { key: "3", label: "3", start: "09:00", end: "09:50" },
    { key: "4", label: "4", start: "10:00", end: "10:50" },
    { key: "5", label: "5", start: "11:00", end: "11:50" },
    { key: "6", label: "6", start: "13:00", end: "13:50" },
    { key: "7", label: "7", start: "14:00", end: "14:50" },
    { key: "8", label: "8", start: "15:00", end: "15:50" },
    { key: "9", label: "9", start: "16:00", end: "16:50" },
    { key: "10", label: "10", start: "17:00", end: "17:50" },
    { key: "N1", label: "Night Trg 1", start: "19:00", end: "19:50" },
    { key: "N2", label: "Night Trg 2", start: "20:00", end: "20:50" },
    { key: "N3", label: "Night Trg 3", start: "21:00", end: "21:50" },
    { key: "ON", label: "Overnight Trg", start: "22:00", end: "22:50" },
  ],
  aiModel: "gpt-6-luna",
  aiEffort: "medium",
  upcomingDays: 60,
  lookbackDays: 90,
  photoMaxPx: 2400,
};

const HEX = /^#[0-9a-f]{6}$/i;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Throws `Error(message)` unless `ok`. */
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new UserError(message);
}

/** Throws if a list has blank or repeated names. */
function checkNames(names: string[], what: string) {
  check(names.length > 0, `Add at least one ${what}`);
  check(names.every((n) => n.trim()), `Every ${what} needs a name`);
  check(new Set(names.map((n) => n.toLowerCase())).size === names.length, `Two ${what}s have the same name`);
}

/** Throws unless the period grid is in time order with no overlaps. */
function checkPeriods(periods: Settings["periods"]) {
  checkNames(periods.map((p) => p.key), "period key");
  for (const [i, p] of periods.entries()) {
    check(HHMM.test(p.start) && HHMM.test(p.end), `Period ${p.key}: times must be HH:MM`);
    check(p.start < p.end, `Period ${p.key}: end must be after start`);
    check(i === 0 || periods[i - 1].end <= p.start, `Period ${p.key} overlaps the one before it`);
  }
}

/**
 * Merges stored or submitted settings over the defaults and validates them.
 *
 * Args:
 *   input: Partial settings, e.g. the stored JSON row or a form submission.
 *
 * Returns:
 *   A complete, valid Settings object.
 *
 * Raises:
 *   Error: With a user-readable message when a value is invalid.
 */
export function parseSettings(input: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...input };
  check(s.unitName.trim(), "Unit name is required");
  check(s.calendarName.includes("{company}"), "Calendar name must contain {company}");
  checkNames(s.companies.map((c) => c.name), "company");
  checkNames(s.categories.map((c) => c.name), "category");
  check([...s.companies, ...s.categories].every((c) => HEX.test(c.color)), "Colours must be #RRGGBB");
  check(s.categories.every((c) => /^([1-9]|1[01])$/.test(c.googleColorId)), "Google colour must be 1–11");
  checkPeriods(s.periods);
  check(EFFORTS.includes(s.aiEffort), `Reasoning effort must be one of ${EFFORTS.join(", ")}`);
  for (const k of ["upcomingDays", "lookbackDays", "photoMaxPx"] as const) {
    check(Number.isInteger(s[k]) && s[k] > 0, `${k} must be a positive whole number`);
  }
  return s;
}

/** Calendar name for a company, e.g. "40SAR Archer Training Program". */
/** True when `name` is one of the configured companies. */
export const isCompany = (s: Pick<Settings, "companies">, name: string) => s.companies.some((c) => c.name === name);

export function calendarName(s: Pick<Settings, "calendarName" | "unitName">, company: string): string {
  return s.calendarName.replaceAll("{unit}", s.unitName).replaceAll("{company}", company);
}
