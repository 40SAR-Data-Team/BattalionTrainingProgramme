import type { Event } from "@trng/shared/common/model";
import { sql } from "./db";
import { getSettings } from "./settings";

/** Normalises DB rows to the client `Event` shape (ISO strings for times). */
export const toEvent = (r: Record<string, unknown>) =>
  ({ ...r, start_at: new Date(r.start_at as string).toISOString(), end_at: new Date(r.end_at as string).toISOString() }) as Event;

/** Events ending within the sync lookback window or later, soonest first.
 * ponytail: loads the whole window; add a date-range query if this grows past a few thousand rows. */
export async function listEvents(): Promise<Event[]> {
  const { lookbackDays } = await getSettings();
  const rows = await sql`select * from events where end_at >= now() - make_interval(days => ${lookbackDays}) order by start_at`;
  return rows.map(toEvent);
}
