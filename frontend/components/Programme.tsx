"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { deleteEvent, saveEvent, type Result } from "@/app/actions";
import { COMPANIES, type Event } from "@/lib/model";
import { addDays, mondayOf, moveTo, sgDate } from "@/lib/periods";
import { compile } from "@/lib/search";
import { EventDialog } from "./EventDialog";
import { Timetable } from "./Timetable";
import { Upcoming } from "./Upcoming";

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });

/** Main screen: company tabs, week navigation, the editable timetable. */
export function Programme({ events, syncError }: { events: Event[]; syncError: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [list, applyLocal] = useOptimistic(events, (all, e: Event) => all.map((x) => (x.id === e.id ? e : x)));
  const [tab, setTab] = useState<string>("All");
  const [week, setWeek] = useState(() => mondayOf(sgDate(new Date())));
  const [editing, setEditing] = useState<Event | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"Timetable" | "Upcoming">("Timetable");
  const [query, setQuery] = useState("");
  const [match, queryError] = useMemo(() => {
    try { return [compile(query), null] as const; } catch (err) { return [() => true, (err as Error).message] as const; }
  }, [query]);
  const shown = list.filter((e) => (tab === "All" || e.companies.includes(tab)) && match(e));

  /** Runs a server action with an optimistic local update; surfaces failures as a notice. */
  function run(action: () => Promise<Result>, optimistic?: Event) {
    setNotice(null);
    startTransition(async () => {
      if (optimistic) applyLocal(optimistic);
      const r = await action();
      if (!r.ok) setNotice(r.message);
    });
  }

  /** Drag & drop: moves an event to (day, period), keeping its length in periods. */
  function move(id: string, day: string, period: number) {
    const e = list.find((x) => x.id === id);
    if (!e || e.all_day) return;
    const moved = moveTo(e, day, period);
    run(() => saveEvent(moved), moved);
  }

  return (
    <div className="flex min-h-full flex-col">
      <nav className="flex h-11 items-center gap-6 bg-black px-4 text-[12px] text-white">
        <span className="font-semibold">40SAR Training Programme</span>
        <Link href="/upload" className="ml-auto hover:underline">Upload</Link>
      </nav>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/10 bg-parchment/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150">
        <h1 className="text-[21px] font-semibold tracking-tight">{tab === "All" ? "All companies" : tab}</h1>
        <div className="flex flex-wrap gap-1 text-[14px]">
          {["All", ...COMPANIES].map((c) => (
            <button key={c} onClick={() => setTab(c)}
              className={`rounded-full px-3 py-1 ${tab === c ? "bg-ink text-white" : "hover:bg-black/5"}`}>{c}</button>
          ))}
        </div>
        <div className="flex rounded-full bg-black/5 p-0.5 text-[14px]">
          {(["Timetable", "Upcoming"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 ${view === v ? "bg-white" : ""}`}>{v}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[14px]">
          {view === "Timetable" && <>
          <button onClick={() => setWeek(addDays(week, -7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Previous week">‹</button>
          <span className="min-w-36 text-center">{fmt(week)} – {fmt(addDays(week, 6))}</span>
          <button onClick={() => setWeek(addDays(week, 7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Next week">›</button>
          <button onClick={() => setWeek(mondayOf(sgDate(new Date())))} className="rounded-full px-3 py-1 text-primary hover:bg-black/5">Today</button>
          </>}
          <button onClick={() => startTransition(() => router.refresh())} disabled={pending}
            className="rounded-full bg-primary px-4 py-1.5 text-white transition active:scale-95 disabled:opacity-50">
            {pending ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>
      {syncError && <p className="mx-4 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[14px] text-orange-900">Google Calendar sync failed: {syncError}. Showing last saved data.</p>}
      {notice && <p role="status" className="mx-4 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[14px] text-orange-900">{notice}</p>}
      <main className="flex-1 p-4">
        {view === "Timetable"
          ? <Timetable events={shown} week={week} showCompanies={tab === "All"} onOpen={setEditing} onMove={move} />
          : <Upcoming events={shown} onOpen={setEditing} />}
      </main>
      <footer className="sticky bottom-0 z-20 border-t border-black/10 bg-parchment/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search activities"
          placeholder='Search, e.g. cat:"live firing" OR (range AND NOT co:braves)   ·   fields: cat: loc: cond: resrc: co: title:'
          className="h-11 w-full rounded-full border border-black/10 bg-white px-5 text-[17px] outline-none focus:outline-2 focus:outline-primary" />
        {queryError && <p className="mt-1 px-5 text-[12px] text-red-600">{queryError}</p>}
      </footer>
      <EventDialog event={editing} onClose={() => setEditing(null)}
        onSave={(e) => { setEditing(null); run(() => saveEvent(e), e); }}
        onDelete={(e) => { if (confirm(`Delete "${e.title}" from every calendar?`)) { setEditing(null); run(() => deleteEvent(e.id)); } }} />
    </div>
  );
}
