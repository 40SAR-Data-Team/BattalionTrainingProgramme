import type { Event } from "./model";

/** Two timed events that want the same thing (a place, an instructor, a resource) at overlapping times. */
export type Clash<E> = { key: string; a: E; b: E };

/** Normalises a free-text name so "Range 3 " and "range  3" match: trimmed, lower case, single spaces. */
export const normName = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Finds every pair of timed events that share a key and overlap in time. Touching (end == start) is not a clash.
 *
 * Args:
 *   events: Events to check; all-day remarks are ignored.
 *   keysOf: The keys an event holds, e.g. its normalised location. Empty keys are ignored.
 *
 * Returns:
 *   Clashes sorted by key, then by the first event's start.
 */
export function clashes<E extends Pick<Event, "start_at" | "end_at" | "all_day">>(events: E[], keysOf: (e: E) => string[]): Clash<E>[] {
  const byKey = new Map<string, E[]>();
  for (const e of events) {
    if (e.all_day) continue;
    for (const key of new Set(keysOf(e).filter(Boolean))) byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  const out: Clash<E>[] = [];
  for (const [key, list] of [...byKey].sort(([x], [y]) => x.localeCompare(y))) {
    const sorted = list.map((e) => ({ e, s: Date.parse(e.start_at), t: Date.parse(e.end_at) })).sort((x, y) => x.s - y.s);
    // ponytail: pairwise scan of the still-open events; fine for a week's or term's programme.
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length && sorted[j].s < sorted[i].t; j++) out.push({ key, a: sorted[i].e, b: sorted[j].e });
  }
  return out;
}
