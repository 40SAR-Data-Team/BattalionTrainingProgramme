import { connection } from "next/server";
import { listEvents } from "@trng/backend/events";
import { Programme } from "@/components/Programme";

/** Renders the saved programme at once; Programme then pulls Google changes company by company. */
export default async function Page() {
  await connection(); // always render per request: the calendar is live
  return <Programme events={await listEvents()} />;
}
