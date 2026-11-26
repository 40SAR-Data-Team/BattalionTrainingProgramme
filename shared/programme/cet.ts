import type { Event } from "../common/model";
import { fmtDay, hhmm } from "../common/periods";

/** Daily CET (Critical Events Timing) message. Roster, duty, notes and fixed-slot times are left blank for the
 * commanders to fill in on the calendar event. */

const SEP = "——————————————————";
const ROSTER = ["CDO", "CDS", "PDS(PLT 1)", "PDS(PLT 2)", "A/S IC", "SIGNAL IC"].map((k) => `${k}:`);
const DUTY = ["Duty Bunk:"];
const FIXED = ["1130 LUNCH", "1730 DINNER", "2200 LIGHTS OUT"];
const BLANKS = new Set([...ROSTER, ...DUTY, ...FIXED]);

/** "Reveille" from "0550 Reveille", "CDO" from "CDO: 2LT X". */
const key = (line: string) => line.replace(/^\d{4}\s+/, "").split(":")[0].trim();

const KEYS = new Set([...BLANKS].map(key));

/** One programme event: "HHMM Title @ Loc". */
const entry = (e: Event) => `${e.all_day ? "" : hhmm(e.start_at) + " "}${e.title}${e.loc ? ` @ ${e.loc}` : ""}`;
const timed = (l: string) => Number(/^\d{4} /.test(l));

/** CET text for one "YYYY-MM-DD" day from that day's events. */
export function buildCet(day: string, events: Event[]): string {
  const [y, m, d] = day.split("-");
  // ponytail: dedupe on "HHMM Title", keeping the longer heading (the one with "@ loc"); fix duplicate rows at ingest if they spread
  const lines = new Map<string, string>();
  for (const h of [...events.map(entry), ...FIXED]) if ((lines.get(h.split(" @ ")[0])?.length ?? 0) < h.length) lines.set(h.split(" @ ")[0], h);
  const body = [...lines.values()].sort((a, b) => timed(a) - timed(b) || a.localeCompare(b));
  return [
    `*Daily CET for ${fmtDay(day, { weekday: "long" })} ${d}${m}${y.slice(2)}*`, "",
    ...ROSTER, "", ...DUTY, "", SEP, "",
    ...body.flatMap((l) => [l, ""]),
    SEP, "", "Note:", "1.",
  ].join("\n");
}

/** Copies commanders' filled-in roster/duty/slot lines from the old CET text into a regenerated one.
 * ponytail: matches by label, so a programme event titled like a fixed slot ("LUNCH") can be mistaken for it. */
export function keepFilled(old: string | null | undefined, next: string): string {
  const filled = new Map<string, string>();
  for (const l of (old ?? "").split("\n")) if (KEYS.has(key(l)) && !BLANKS.has(l) && !l.startsWith(">")) filled.set(key(l), l);
  return next.split("\n").map((l) => (BLANKS.has(l) && filled.get(key(l))) || l).join("\n");
}
