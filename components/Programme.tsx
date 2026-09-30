"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COMPANIES, type Event } from "@/lib/db";
import { addDays, mondayOf, sgDate } from "@/lib/periods";
import { Timetable } from "./Timetable";

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });

/** Main screen: company tabs, week navigation and the timetable. */
export function Programme({ events, syncError }: { events: Event[]; syncError: string | null }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<string>("All");
  const [week, setWeek] = useState(() => mondayOf(sgDate(new Date())));
  const shown = tab === "All" ? events : events.filter((e) => e.companies.includes(tab));

  return (
    <div className="flex min-h-full flex-col">
      <nav className="flex h-11 items-center gap-6 bg-black px-4 text-[12px] text-white">
        <span className="font-semibold">40SAR Training Programme</span>
        <Link href="/upload" className="ml-auto hover:underline">Upload</Link>
      </nav>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/10 bg-parchment/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150">
        <h1 className="text-[21px] font-semibold tracking-tight">{tab === "All" ? "All companies" : tab}</h1>
        <div className="flex gap-1 text-[14px]">
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
          <button onClick={() => startRefresh(() => router.refresh())} disabled={refreshing}
            className="rounded-full bg-primary px-4 py-1.5 text-white transition active:scale-95 disabled:opacity-50">
            {refreshing ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>
      {syncError && <p className="mx-4 mt-3 rounded-lg bg-orange-50 px-3 py-2 text-[14px] text-orange-900">Google Calendar sync failed: {syncError}. Showing last saved data.</p>}
      <main className="flex-1 p-4">
        <Timetable events={shown} week={week} showCompanies={tab === "All"} />
      </main>
    </div>
  );
}
