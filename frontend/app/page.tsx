import { connection } from "next/server";
import { Programme } from "@/components/Programme";
import { sql } from "@/lib/db";
import { COMPANIES, type Event } from "@/lib/model";
import { syncAll } from "@/lib/google";

/** Pulls live Google Calendar changes on every load, then renders from the DB. */
export default async function Page() {
  await connection(); // always render per request: the calendar is live
  const syncError = await syncAll(COMPANIES);
  // ponytail: loads everything from 90 days back; add a date-range query if this grows past a few thousand rows.
  const rows = await sql`select * from events where end_at >= now() - interval '90 days' order by start_at`;
  const events = rows.map((r) => ({ ...r, start_at: new Date(r.start_at).toISOString(), end_at: new Date(r.end_at).toISOString() })) as Event[];
  return <Programme events={events} syncError={syncError} />;
}
