"use client";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { createEvent, deleteEvent, saveEvent, type Result } from "@/app/actions";
import { blankEvent, upsert } from "@trng/shared/drafts";
import type { Event } from "@trng/shared/model";
import { addDays, fmtDay, mondayOf, moveTo, sgDate, timeLabel } from "@trng/shared/periods";
import { compile } from "@trng/shared/search";
import { EventDialog } from "./EventDialog";
import { NavBar } from "./NavBar";
import { Notice } from "./Notice";
import { useSettings } from "./SettingsContext";
import { CompanyChip, Timetable, useCategoryColor } from "./Timetable";
import { Upcoming } from "./Upcoming";
import { WeekNav } from "./WeekNav";

/** Main screen: search, company filter, week timetable or upcoming list, and the week's activities by company. */
export function Programme({ events, syncError }: { events: Event[]; syncError: string | null }) {
  const settings = useSettings();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [list, applyLocal] = useOptimistic(events, upsert);
  const [tab, setTab] = useState("All");
  const [week, setWeek] = useState(() => mondayOf(sgDate(new Date())));
  const [editing, setEditing] = useState<Event | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"Timetable" | "Upcoming">("Timetable");
  const [query, setQuery] = useState("");
  const [match, queryError] = useMemo(() => {
    try { return [compile(query), null] as const; } catch (err) { return [() => true, (err as Error).message] as const; }
  }, [query]);
  const shown = list.filter((e) => (tab === "All" || e.companies.includes(tab)) && match(e));
  const isNew = !!editing && !list.some((x) => x.id === editing.id);

  /** Opens a blank activity on today (or the shown week's Monday), ticked for the selected company. */
  function create() {
    const today = sgDate(new Date());
    const date = view === "Upcoming" || (today >= week && today <= addDays(week, 6)) ? today : week;
    setEditing(blankEvent(settings.periods, date, tab === "All" ? [] : [tab]));
  }

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
    const moved = moveTo(settings.periods, e, day, period);
    run(() => saveEvent(moved), moved);
  }

  const pill = "rounded-full px-3 py-1.5 font-medium aria-pressed:bg-ink aria-pressed:text-white hover:bg-canvas aria-pressed:hover:bg-ink";
  return (
    <div className="flex min-h-full flex-col">
      <NavBar>
        <SearchBox query={query} onChange={setQuery} error={queryError} />
      </NavBar>
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5">
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">{tab === "All" ? "All companies" : tab}</h1>
          <div className="flex flex-wrap gap-1 text-[14px]" role="group" aria-label="Company">
            {["All", ...settings.companies.map((c) => c.name)].map((c) => (
              <button key={c} onClick={() => setTab(c)} aria-pressed={tab === c} className={pill}>{c}</button>
            ))}
          </div>
          <div className="flex rounded-full bg-canvas p-0.5 text-[14px]" role="group" aria-label="View">
            {(["Timetable", "Upcoming"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className="rounded-full px-3 py-1 font-medium aria-pressed:bg-white aria-pressed:shadow-sm">{v}</button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {view === "Timetable" && <WeekNav week={week} onChange={setWeek} />}
            <button onClick={create} className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-white transition active:scale-95">
              New activity
            </button>
            <button onClick={() => startTransition(() => router.refresh())} disabled={pending}
              className="whitespace-nowrap rounded-full bg-primary px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-50">
              {pending ? "Syncing…" : "Sync with Google"}
            </button>
          </div>
        </section>
        {syncError && <Notice>Google Calendar sync failed: {syncError}. Showing the last saved programme.</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {view === "Timetable"
          ? <Timetable events={shown} week={week} showCompanies={tab === "All"} onOpen={setEditing} onMove={move} />
          : <Upcoming events={shown} onOpen={setEditing} />}
        {view === "Timetable" && <WeekSummary events={shown} week={week} onOpen={setEditing} />}
      </main>
      <EventDialog event={editing} onClose={() => setEditing(null)}
        onSave={(e) => { setEditing(null); run(() => (isNew ? createEvent(e) : saveEvent(e)), e); }}
        onDelete={isNew ? undefined : (e) => { if (confirm(`Delete "${e.title}" from every calendar?`)) { setEditing(null); run(() => deleteEvent(e.id)); } }} />
    </div>
  );
}

/** Search field with the query syntax a click away. */
function SearchBox({ query, onChange, error }: { query: string; onChange: (q: string) => void; error: string | null }) {
  return (
    <div className="relative">
      <input type="search" value={query} onChange={(e) => onChange(e.target.value)} aria-label="Search activities"
        aria-invalid={!!error} placeholder="Search activities, e.g. range co:braves"
        className="h-10 w-full rounded-full border border-hairline bg-canvas/50 px-4 text-[15px] outline-none focus:border-primary focus:bg-white" />
      {error && <p role="alert" className="absolute mt-1 px-4 text-[12px] text-primary">{error}</p>}
      <details className="absolute top-2 right-3 text-[13px]">
        <summary className="cursor-pointer list-none rounded-full px-2 text-muted hover:text-ink" aria-label="Search help">?</summary>
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-hairline bg-white p-4 leading-relaxed shadow-xl">
          <p>Words side by side must all match. Combine with <b>OR</b>, <b>AND</b>, <b>NOT</b> and brackets.</p>
          <p className="mt-2">Search one field with <code>cat:</code> <code>loc:</code> <code>cond:</code> <code>resrc:</code> <code>co:</code> <code>title:</code></p>
          <p className="mt-2 text-muted">Example: <code>cat:&quot;live firing&quot; OR (range AND NOT co:braves)</code></p>
        </div>
      </details>
    </div>
  );
}

/** NUSMods-style list under the grid: the week's activities grouped by company, plus the category legend. */
function WeekSummary({ events, week, onOpen }: { events: Event[]; week: string; onOpen: (e: Event) => void }) {
  const { companies, categories } = useSettings();
  const colorOf = useCategoryColor();
  const end = addDays(week, 6);
  const inWeek = events.filter((e) => sgDate(e.start_at) <= end && sgDate(e.end_at) >= week);
  const day = (iso: string) => fmtDay(sgDate(iso), { weekday: "short" });
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => {
          const mine = inWeek.filter((e) => e.companies.includes(c.name));
          if (!mine.length) return null;
          return (
            <div key={c.name} className="rounded-2xl border border-hairline bg-white p-4 shadow-sm">
              <h2 className="mb-2 flex items-center justify-between"><CompanyChip name={c.name} /><span className="text-[13px] text-muted">{mine.length} activities</span></h2>
              <ul className="divide-y divide-hairline text-[14px]">
                {mine.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => onOpen(e)} className="flex w-full items-baseline gap-2 py-1.5 text-left hover:text-primary">
                      <span className="size-2.5 shrink-0 self-center rounded-full border border-black/10" style={{ background: colorOf(e) }} />
                      <span className="w-9 shrink-0 text-muted">{day(e.start_at)}</span>
                      <span className="w-20 shrink-0 tabular-nums text-muted">{timeLabel(e)}</span>
                      <span className="font-medium">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!inWeek.length && <p className="rounded-2xl border border-dashed border-heading/30 bg-white/70 p-6 text-center text-muted sm:col-span-2 xl:col-span-3">
          Nothing planned this week. Add an activity, upload a programme, or move to another week.
        </p>}
      </div>
      <aside className="h-fit rounded-2xl border border-hairline bg-white p-4 text-[14px] shadow-sm">
        <h2 className="mb-2 font-display text-[17px] font-semibold">Categories</h2>
        <ul className="space-y-1.5">
          {categories.map((c) => (
            <li key={c.name} className="flex items-center gap-2">
              <span className="size-3.5 rounded border border-black/10" style={{ background: c.color }} />{c.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-muted">Orange outline: the AI wasn&apos;t sure about this block. Check it against the original programme.</p>
      </aside>
    </section>
  );
}
