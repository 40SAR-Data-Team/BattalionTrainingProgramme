import type { Period } from "./model";

/**
 * Time helpers for the period grid used by the source training programmes (rows = days, columns = periods).
 * The grid itself is a setting, so every grid function takes `periods` first.
 * ponytail: times are Singapore time (UTC+8, no DST); add a timezone setting if another unit ever needs one.
 */

type Periods = readonly Period[];

const TZ = "+08:00";
const DAY_MS = 86_400_000;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Index of a period key (e.g. "N1") in `periods`; throws if unknown. */
export function periodIndex(periods: Periods, key: string): number {
  const i = periods.findIndex((p) => p.key === key);
  if (i < 0) throw new Error(`Unknown period "${key}"`);
  return i;
}

/** Converts a "YYYY-MM-DD" date and inclusive period indexes to {start_at, end_at} (+08:00 ISO). */
export function spanToTimes(periods: Periods, date: string, startIdx: number, endIdx: number) {
  return {
    start_at: `${date}T${periods[startIdx].start}:00${TZ}`,
    end_at: `${date}T${periods[endIdx].end}:00${TZ}`,
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
export function timesToSpan(periods: Periods, start_at: string, end_at: string): [number, number] {
  const s = sgMinutes(start_at);
  // ponytail: multi-day timed events render on their start day only, ending at the last period.
  const e = sgDate(end_at) > sgDate(start_at) ? 24 * 60 : sgMinutes(end_at);
  const hits = periods.map((p, i) => [i, toMin(p.start) < e && toMin(p.end) > s] as const).filter(([, hit]) => hit);
  if (hits.length) return [hits[0][0], hits[hits.length - 1][0]];
  const nearest = periods.reduce((best, p, i) =>
    Math.abs(toMin(p.start) - s) < Math.abs(toMin(periods[best].start) - s) ? i : best, 0);
  return [nearest, nearest];
}

/** True if a timed event starts and ends exactly on period boundaries. */
export function onGrid(periods: Periods, start_at: string, end_at: string): boolean {
  const [a, b] = timesToSpan(periods, start_at, end_at);
  const t = spanToTimes(periods, sgDate(start_at), a, b);
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

/** Start of a "YYYY-MM-DD" day, Singapore time, as ISO; used for all-day events. */
export const sgMidnight = (date: string) => `${date}T00:00:00${TZ}`;

/** "All day" or "HHMM–HHMM", as shown in lists. */
export const timeLabel = (e: { all_day: boolean; start_at: string; end_at: string }) =>
  e.all_day ? "All day" : `${hhmm(e.start_at)}–${hhmm(e.end_at)}`;

/** Formats a "YYYY-MM-DD" date for display, e.g. fmtDay(d, { weekday: "short" }) → "Mon". */
export const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("en-SG", { ...opts, timeZone: "UTC" });

/** Moves a timed event to (day, period), keeping its length in periods and clamping at the last period. */
export function moveTo<T extends { start_at: string; end_at: string }>(periods: Periods, e: T, day: string, period: number): T {
  const [s, t] = timesToSpan(periods, e.start_at, e.end_at);
  return { ...e, ...spanToTimes(periods, day, period, Math.min(period + t - s, periods.length - 1)) };
}
