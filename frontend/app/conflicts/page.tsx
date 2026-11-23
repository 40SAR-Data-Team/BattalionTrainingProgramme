import { connection } from "next/server";
import { clashes, normName } from "@trng/shared/common/clash";
import { mondayOf, sgDate } from "@trng/shared/common/periods";
import { listEvents } from "@trng/backend/common/events";
import { NavBar } from "@/components/common/NavBar";
import { ConflictTable } from "@/components/conflicts/ConflictTable";

/** Location clashes among activities from this week (Monday, Singapore time) on.
 * ponytail: reads the saved programme; Google-side edits show after the next sync on the Training Programme tab. */
async function upcomingLocationClashes() {
  const monday = mondayOf(sgDate(new Date()));
  const upcoming = (await listEvents()).filter((e) => sgDate(e.end_at) >= monday);
  return clashes(upcoming, (e) => [normName(e.loc)]);
}

/** Conflict Checker: activities from this week on that book the same location at overlapping times. */
export default async function ConflictsPage() {
  await connection(); // always render per request: the programme is live
  const found = await upcomingLocationClashes();
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 text-[14px]">
        <section className="rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">Conflict Checker</h1>
          <p className="text-muted">Activities from this week on that use the same location (LOC) at overlapping times.</p>
        </section>
        <ConflictTable clashes={found} />
      </main>
    </div>
  );
}
