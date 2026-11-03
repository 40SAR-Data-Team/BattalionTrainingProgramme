import type { Event, Period } from "./model";
import { periodIndex, sgMidnight, spanToTimes } from "./periods";

/** One activity block as read off the source grid by the AI. start/end are period keys or "REMARKS". */
export type Block = {
  date: string; start: string; end: string; title: string;
  cond: string | null; loc: string | null; resrc: string | null; category: string | null; comments: string | null;
};

/** Turns extracted blocks into unsaved events (period spans → times; REMARKS → all-day). */
export function toDrafts(periods: readonly Period[], company: string, blocks: Block[]): Event[] {
  return blocks.map((b) => {
    const remark = b.start === "REMARKS" || b.end === "REMARKS";
    const s = remark ? 0 : periodIndex(periods, b.start);
    return {
      id: crypto.randomUUID(), title: b.title.trim(),
      ...(remark
        ? { start_at: sgMidnight(b.date), end_at: sgMidnight(b.date), all_day: true }
        : { ...spanToTimes(periods, b.date, s, Math.max(s, periodIndex(periods, b.end))), all_day: false }),
      cond: b.cond, loc: b.loc, resrc: b.resrc, comments: b.comments, category: b.category,
      companies: [company], google: {}, attrs: {},
    };
  });
}

/**
 * A new, empty activity for the clerk to fill in.
 *
 * Args:
 *   periods: The period grid; the activity starts in the first period.
 *   date: Day of the activity (YYYY-MM-DD, Singapore time).
 *   companies: Companies ticked by default.
 */
export function blankEvent(periods: readonly Period[], date: string, companies: string[]): Event {
  return {
    id: crypto.randomUUID(), title: "", ...spanToTimes(periods, date, 0, 0), all_day: false,
    cond: null, loc: null, resrc: null, comments: null, category: null, companies, google: {}, attrs: {},
  };
}

/** Replaces the event with the same id, or appends it when it is new. */
export const upsert = (all: Event[], e: Event) => (all.some((x) => x.id === e.id) ? all.map((x) => (x.id === e.id ? e : x)) : [...all, e]);

const norm = (s: string | null) => (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
/** Identity of an activity occurrence, used to merge and de-duplicate. */
const key = (e: Event) => [norm(e.title), new Date(e.start_at).getTime(), new Date(e.end_at).getTime(), norm(e.loc), norm(e.cond)].join("|");

/** Merges drafts that are the same activity occurrence in several companies into one multi-company event. */
export function merge(drafts: Event[]): Event[] {
  const byKey = new Map<string, Event>();
  for (const d of drafts) {
    const hit = byKey.get(key(d));
    if (hit) hit.companies = [...new Set([...hit.companies, ...d.companies])];
    else byKey.set(key(d), { ...d, companies: [...d.companies] });
  }
  return [...byKey.values()];
}

/** Drops companies (and then drafts) that already have the same activity occurrence, so re-uploads append. */
export function withoutExisting(drafts: Event[], existing: Event[]): Event[] {
  const have = new Map<string, Set<string>>();
  for (const e of existing) have.set(key(e), new Set([...(have.get(key(e)) ?? []), ...e.companies]));
  return drafts
    .map((d) => ({ ...d, companies: d.companies.filter((c) => !have.get(key(d))?.has(c)) }))
    .filter((d) => d.companies.length);
}
