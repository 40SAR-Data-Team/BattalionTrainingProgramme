import { connection } from "next/server";
import { listEvents } from "@trng/backend/events";
import { syncAll } from "@trng/backend/google";
import { Programme } from "@/components/Programme";

/** Pulls live Google Calendar changes on every load, then renders from the DB. */
export default async function Page() {
  await connection(); // always render per request: the calendar is live
  const syncError = await syncAll();
  return <Programme events={await listEvents()} syncError={syncError} />;
}
