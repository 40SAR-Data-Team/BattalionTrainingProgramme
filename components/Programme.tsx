"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { deleteEvent, saveEvent, type Result } from "@/app/actions";
import { COMPANIES, type Event } from "@/lib/db";
import { PERIODS, addDays, mondayOf, sgDate, spanToTimes, timesToSpan } from "@/lib/periods";
import { EventDialog } from "./EventDialog";
import { Timetable } from "./Timetable";

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
  const shown = tab === "All" ? list : list.filter((e) => e.companies.includes(tab));

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
    const [s, t] = timesToSpan(e.start_at, e.end_at);
    const moved = { ...e, ...spanToTimes(day, period, Math.min(period + t - s, PERIODS.length - 1)) };
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
        <div className="ml-auto flex items-center gap-2 text-[14px]">
          <button onClick={() => setWeek(addDays(week, -7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Previous week">‹</button>
          <span className="min-w-36 text-center">{fmt(week)} – {fmt(addDays(week, 6))}</span>
          <button onClick={() => setWeek(addDays(week, 7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Next week">›</button>
          <button onClick={() => setWeek(mondayOf(sgDate(new Date())))} className="rounded-full px-3 py-1 text-primary hover:bg-black/5">Today</button>
          <button onClick={() => startTransition(() => router.refresh())} disabled={pending}
            className="rounded-full bg-primary px-4 py-1.5 text-white transition active:scale-95 disabled:opacity-50">
            {pending ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>
      {syncError && <p className="mx-4 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[14px] text-orange-900">Google Calendar sync failed: {syncError}. Showing last saved data.</p>}
      {notice && <p role="status" className="mx-4 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[14px] text-orange-900">{notice}</p>}
      <main className="flex-1 p-4">
        <Timetable events={shown} week={week} showCompanies={tab === "All"} onOpen={setEditing} onMove={move} />
      </main>
      <EventDialog event={editing} onClose={() => setEditing(null)}
        onSave={(e) => { setEditing(null); run(() => saveEvent(e), e); }}
        onDelete={(e) => { if (confirm(`Delete "${e.title}" from every calendar?`)) { setEditing(null); run(() => deleteEvent(e.id)); } }} />
    </div>
  );
}
