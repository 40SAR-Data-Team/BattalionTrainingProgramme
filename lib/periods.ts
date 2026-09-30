/**
 * The fixed period grid used by the source training programmes (rows = days, columns = periods).
 * Times are Singapore time (UTC+8, no DST).
 */
export const PERIODS = [
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
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

const TZ = "+08:00";
const DAY_MS = 86_400_000;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Index of a period key ("0".."10", "N1".."N3", "ON") in PERIODS; throws if unknown. */
export function periodIndex(key: string): number {
  const i = PERIODS.findIndex((p) => p.key === key);
  if (i < 0) throw new Error(`Unknown period "${key}"`);
  return i;
}

/** Converts a "YYYY-MM-DD" date and inclusive period indexes to {start_at, end_at} (+08:00 ISO). */
export function spanToTimes(date: string, startIdx: number, endIdx: number) {
  return {
    start_at: `${date}T${PERIODS[startIdx].start}:00${TZ}`,
    end_at: `${date}T${PERIODS[endIdx].end}:00${TZ}`,
  };
}

/** Singapore calendar date ("YYYY-MM-DD") of an instant. */
export function sgDate(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** Minutes since midnight, Singapore time, of an instant. */
function sgMinutes(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Inclusive [startIdx, endIdx] of the periods a timed event overlaps.
 * Off-grid times (e.g. a Google edit to 12:15) snap to the nearest period. */
export function timesToSpan(start_at: string, end_at: string): [number, number] {
  const s = sgMinutes(start_at);
  // ponytail: multi-day timed events render on their start day only, ending at the last period.
  const e = sgDate(end_at) > sgDate(start_at) ? 24 * 60 : sgMinutes(end_at);
  const hits = PERIODS.map((p, i) => [i, toMin(p.start) < e && toMin(p.end) > s] as const).filter(([, hit]) => hit);
  if (hits.length) return [hits[0][0], hits[hits.length - 1][0]];
  const nearest = PERIODS.reduce((best, p, i) =>
    Math.abs(toMin(p.start) - s) < Math.abs(toMin(PERIODS[best].start) - s) ? i : best, 0);
  return [nearest, nearest];
}

/** True if a timed event starts and ends exactly on period boundaries. */
export function onGrid(start_at: string, end_at: string): boolean {
  const [a, b] = timesToSpan(start_at, end_at);
  const t = spanToTimes(sgDate(start_at), a, b);
  return new Date(t.start_at).getTime() === new Date(start_at).getTime() && new Date(t.end_at).getTime() === new Date(end_at).getTime();
}

/** Adds whole days to a "YYYY-MM-DD" date. */
export function addDays(date: string, n: number): string {
  return new Date(new Date(date + "T00:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week containing a "YYYY-MM-DD" date. */
export function mondayOf(date: string): string {
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** "HHMM" Singapore time of an instant, as printed on the source programme. */
export function hhmm(iso: string): string {
  const m = sgMinutes(iso);
  return String(Math.floor(m / 60)).padStart(2, "0") + String(m % 60).padStart(2, "0");
}

/** Moves a timed event to (day, period), keeping its length in periods and clamping at the last period. */
export function moveTo<T extends { start_at: string; end_at: string }>(e: T, day: string, period: number): T {
  const [s, t] = timesToSpan(e.start_at, e.end_at);
  return { ...e, ...spanToTimes(day, period, Math.min(period + t - s, PERIODS.length - 1)) };
}
