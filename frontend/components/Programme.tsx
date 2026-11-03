"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { createEvent, deleteEvent, saveEvent, syncCompany, type Result } from "@/app/actions";
import { blankEvent, upsert } from "@trng/shared/drafts";
import type { Event } from "@trng/shared/model";
import { addDays, fmtDay, mondayOf, moveTo, sgDate, timeLabel } from "@trng/shared/periods";
import { compile } from "@trng/shared/search";
import { EventDialog } from "./EventDialog";
import { NavBar } from "./NavBar";
import { Notice } from "./Notice";
import { Progress, useSteps } from "./Progress";
import { useSettings } from "./SettingsContext";
import { CompanyChip, Timetable, useCategoryColor } from "./Timetable";
import { Upcoming } from "./Upcoming";
import { WeekNav } from "./WeekNav";

/** Main screen: search, company filter, week timetable or upcoming list, and the week's activities by day. */
export function Programme({ events }: { events: Event[] }) {
  const settings = useSettings();
  const [, startTransition] = useTransition();
  const { steps, run: runSteps } = useSteps();
  const [syncError, setSyncError] = useState<string | null>(null);
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

  /** Pulls Google changes one company at a time; each pull re-renders the page, so events stream in. */
  async function sync() {
    setSyncError(null);
    const failed: string[] = [];
    await runSteps("Syncing with Google Calendar", settings.companies.map((c) => c.name), async (c) => {
      const r = await syncCompany(c);
      if (!r.ok) failed.push(`${c}: ${r.message}`);
    });
    if (failed.length) setSyncError(failed.join("; "));
  }

  const synced = useRef(false); // dev Strict Mode mounts twice; sync once per page load
  useEffect(() => {
    if (!synced.current) { synced.current = true; void sync(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <button onClick={() => void sync()} disabled={!!steps}
              className="whitespace-nowrap rounded-full bg-primary px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-50">
              {steps ? "Syncing…" : "Sync with Google"}
            </button>
          </div>
        </section>
        <Progress steps={steps} />
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

/** NUSMods-style list under the grid: the week's activities by day in rows of three, plus the category legend. */
function WeekSummary({ events, week, onOpen }: { events: Event[]; week: string; onOpen: (e: Event) => void }) {
  const { categories } = useSettings();
  const colorOf = useCategoryColor();
  const byDay = Array.from({ length: 7 }, (_, i) => addDays(week, i))
    .map((d) => [d, events.filter((e) => sgDate(e.start_at) <= d && sgDate(e.end_at) >= d).sort((a, b) => a.start_at.localeCompare(b.start_at))] as const)
    .filter(([, es]) => es.length);
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="grid h-fit gap-4 rounded-2xl border border-hairline bg-white p-4 shadow-sm">
        {byDay.map(([d, today]) => (
          <div key={d}>
            <h2 className="mb-2 font-display text-[17px] font-semibold">{fmtDay(d, { weekday: "long", day: "numeric", month: "short" })}</h2>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {today.map((e) => (
                <li key={e.id}>
                  <button onClick={() => onOpen(e)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[14px] hover:bg-canvas">
                    <span className="mt-1 size-3.5 shrink-0 rounded border border-black/10" style={{ background: colorOf(e) }} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-primary">{e.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                        <span className="tabular-nums">{timeLabel(e)}</span>
                        {e.companies.map((c) => <CompanyChip key={c} name={c} small />)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!byDay.length && <p className="rounded-2xl border border-dashed border-heading/30 bg-white/70 p-6 text-center text-muted">
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
