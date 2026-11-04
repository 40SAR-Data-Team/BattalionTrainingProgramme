import type { Event } from "./model";
import { fmtDay, hhmm } from "./periods";

/** Daily CET (Critical Events Timing) message. Roster, duty, notes and fixed-slot times are left blank for the
 * commanders to fill in on the calendar event. */

const SEP = "——————————————————";
const ROSTER = ["CDO", "CDS", "PDS(PLT 1)", "PDS(PLT 2)", "A/S IC", "SIGNAL IC"].map((k) => `${k}:`);
const DUTY = ["*Duty Bunk:*", "Morning Flag Duty:", "Evening Flag Duty:"];
const MORNING = ["Reveille", "Breakfast"];
const EVENING = ["Lunch", "Dinner", "Last Parade", "Lights Out"];
const BLANKS = new Set([...ROSTER, ...DUTY, ...MORNING, ...EVENING]);

/** "Reveille" from "0550 Reveille", "CDO" from "CDO: 2LT X". */
const key = (line: string) => line.replace(/^\d{4}\s+/, "").split(":")[0].trim();

const KEYS = new Set([...BLANKS].map(key));

/** One programme event: "HHMM Title @ Loc" plus its attire, items and comment lines. */
function entry(e: Event): string[] {
  const head = `${e.all_day ? "" : hhmm(e.start_at) + " "}${e.title}${e.loc ? ` @ ${e.loc}` : ""}`;
  return [
    head,
    ...(e.cond ? [`> Attire: ${e.cond}`] : []),
    ...(e.resrc ? [`> Items to Bring: ${e.resrc}`] : []),
    ...(e.comments ?? "").split("\n").filter(Boolean).map((l) => `> ${l}`),
  ];
}

/** CET text for one "YYYY-MM-DD" day from that day's events. */
export function buildCet(day: string, events: Event[]): string {
  const [y, m, d] = day.split("-");
  const sorted = [...events].sort((a, b) => Number(!a.all_day) - Number(!b.all_day) || a.start_at.localeCompare(b.start_at));
  const blocks = [...MORNING.map((s) => [s]), ...sorted.map(entry), ...EVENING.map((s) => [s])];
  return [
    `*Daily CET for ${fmtDay(day, { weekday: "long" })} ${d}${m}${y.slice(2)}*`, "",
    ...ROSTER, "", DUTY[0], "", DUTY[1], DUTY[2], "", SEP, "",
    ...blocks.flatMap((b) => [...b, ""]),
    SEP, "", "Note:", "1.",
  ].join("\n");
}

/** Copies commanders' filled-in roster/duty/slot lines from the old CET text into a regenerated one.
 * ponytail: matches by label, so a programme event titled like a fixed slot ("Lunch") can be mistaken for it. */
export function keepFilled(old: string | null | undefined, next: string): string {
  const filled = new Map<string, string>();
  for (const l of (old ?? "").split("\n")) if (KEYS.has(key(l)) && !BLANKS.has(l) && !l.startsWith(">")) filled.set(key(l), l);
  return next.split("\n").map((l) => (BLANKS.has(l) && filled.get(key(l))) || l).join("\n");
}
