"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { exportExcel, optimisePlan, savePlanAction } from "@/app/planner/actions";
import type { Event } from "@trng/shared/common/model";
import { addDays, mondayOf, sgDate, spanToTimes } from "@trng/shared/common/periods";
import { fromCsv, keyOf, periodLabel, spanOf, toCsv, type Training } from "@trng/shared/planner/rules";
import { NavBar } from "@/components/common/NavBar";
import { Notice } from "@/components/common/Notice";
import { useSettings } from "@/components/common/SettingsContext";
import { Timetable } from "@/components/common/Timetable";
import { WeekNav } from "@/components/common/WeekNav";

const blank = (company: string): Training => ({
  id: "", name: "", company, duration: 1, wholeDay: false, instructor: "", location: "", resources: "",
  rules: "", day: null, period: null, pin: "", tags: "",
});

/** Saves a file the browser built. */
function download(name: string, blob: Blob) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Training Planner: trainings with rules, placed on the week grid by hand or by Optimise (CP-SAT) in a chosen window. */
export function Planner({ initial }: { initial: Training[] }) {
  const { periods, companies, categories } = useSettings();
  const [plan, setPlan] = useState(initial);
  const [tab, setTab] = useState(companies[0]?.name ?? "");
  const [week, setWeek] = useState(() => mondayOf(sgDate(new Date())));
  const [from, setFrom] = useState(week);
  const [to, setTo] = useState(() => addDays(week, 27));
  const [weekends, setWeekends] = useState(false);
  const [editing, setEditing] = useState<{ t: Training; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<{ text: string; list?: string[]; tone?: "good" } | null>(null);
  const [busy, startBusy] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** Shows a change at once and stores it; a refused save shows why and keeps the edit on screen to fix. */
  function commit(next: Training[]) {
    setPlan(next);
    void savePlanAction(next).then((r) => { if (!r.ok) setNotice({ text: r.message }); });
  }

  const mine = plan.filter((t) => t.company === tab);
  const unplaced = mine.filter((t) => t.day === null);
  // The grid draws events, so each placed training becomes one (id = its key), coloured by a tag that names a category.
  const events: Event[] = mine.filter((t) => t.day !== null && t.period !== null).map((t) => ({
    id: keyOf(t), title: `${t.pin === "fixed" ? "🔒 " : ""}${t.name}`, all_day: false,
    ...spanToTimes(periods, t.day!, t.period!, Math.min(t.period! + spanOf(periods, t), periods.length) - 1),
    cond: t.instructor, loc: t.location, resrc: t.resources, comments: null, companies: [t.company], google: {}, attrs: {},
    category: categories.find((c) => t.tags.toLowerCase().split(",").map((x) => x.trim()).includes(c.name.toLowerCase()))?.name ?? null,
  }));

  /** Drag onto the grid: the training stays there as a preference (soft pin) unless it was locked. */
  function move(key: string, day: string, period: number) {
    commit(plan.map((t) => (keyOf(t) === key ? { ...t, day, period: Math.min(period, periods.length - spanOf(periods, t)), pin: t.pin === "fixed" ? "fixed" : "soft", booked: undefined } : t)));
  }

  function optimise() {
    setNotice(null);
    startBusy(async () => {
      const r = await optimisePlan(plan, { from, to, weekends });
      if (!r.ok) return setNotice({ text: r.message });
      const { result } = r;
      if (!result.conflicts.length) setPlan(result.plan);
      const list = [...result.conflicts, ...result.unmet.map((u) => `Not met: ${u}`), ...result.problems.map((p) => `Check: ${p}`)];
      setNotice({ text: result.message, list, tone: result.conflicts.length || result.problems.length ? undefined : "good" });
    });
  }

  function excel() {
    startBusy(async () => {
      const r = await exportExcel(plan, tab, from, to);
      if (!r.ok) return setNotice({ text: r.message });
      download(`${tab} training programme ${from}.xlsx`, new Blob([Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    });
  }

  async function importCsv(file: File) {
    try {
      const incoming = fromCsv(periods, companies, await file.text());
      const keys = new Set(incoming.map(keyOf));
      commit([...plan.filter((t) => !keys.has(keyOf(t))), ...incoming]);
      setNotice({ text: `Imported ${incoming.length} trainings from ${file.name}.`, tone: "good" });
    } catch (err) {
      setNotice({ text: (err as Error).message });
    }
  }

  const pill = "rounded-full px-3 py-1.5 font-medium aria-pressed:bg-ink aria-pressed:text-white hover:bg-canvas aria-pressed:hover:bg-ink";
  const btn = "whitespace-nowrap rounded-full border border-hairline px-4 py-2 text-[14px] font-semibold transition hover:bg-canvas active:scale-95 disabled:opacity-50";
  const date = "rounded-full border border-hairline bg-white px-3 py-1.5 tabular-nums";
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 text-[14px]">
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">Training Planner</h1>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Company">
            {companies.map((c) => <button key={c.name} onClick={() => setTab(c.name)} aria-pressed={tab === c.name} className={pill}>{c.name}</button>)}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => setEditing({ t: blank(tab), isNew: true })} className={btn}>New training</button>
            <button onClick={() => fileRef.current?.click()} className={btn}>Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Import CSV file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importCsv(f); }} />
            <button onClick={() => download("training plan.csv", new Blob([toCsv(periods, companies, plan)], { type: "text/csv" }))} className={btn}>Export CSV</button>
            <button onClick={excel} disabled={busy} className={btn}>Export Excel</button>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm" aria-label="Optimise">
          <span className="font-semibold text-heading">Solve window</span>
          <label className="flex items-center gap-2">From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={date} /></label>
          <label className="flex items-center gap-2">To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={date} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} className="accent-primary" /> Include weekends</label>
          <button onClick={optimise} disabled={busy || !from || !to}
            className="rounded-full bg-primary px-5 py-2 font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-50">
            {busy ? "Working…" : "Optimise"}
          </button>
          <span className="text-muted">Places unplaced trainings, and re-places unlocked ones in the window. Locked (🔒) ones stay put.</span>
        </section>

        {notice && (
          <Notice tone={notice.tone}>
            {notice.text}
            {notice.list?.map((x) => <span key={x} className="mt-1 block pl-4 -indent-3">• {x}</span>)}
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-2 shadow-sm">
          <WeekNav week={week} onChange={setWeek} />
          <span className="text-muted">Drag a training onto the grid to place it; click it to edit, lock or unplace.</span>
        </div>
        <Timetable events={events} week={week} onMove={move}
          onOpen={(e) => { const t = plan.find((x) => keyOf(x) === e.id); if (t) setEditing({ t, isNew: false }); }} />

        <section className="rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm" aria-label="Unplaced trainings">
          <h2 className="font-display text-[17px] font-semibold">Unplaced ({unplaced.length})</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {unplaced.map((t) => (
              <button key={keyOf(t)} draggable data-event={t.name} onDragStart={(ev) => ev.dataTransfer.setData("text/plain", keyOf(t))}
                onClick={() => setEditing({ t, isNew: false })}
                className="cursor-grab rounded-lg border border-hairline bg-canvas/40 px-3 py-1.5 text-left hover:brightness-95">
                <span className="font-display font-semibold uppercase">{t.name}</span>
                <span className="ml-2 text-muted">{t.wholeDay ? "whole day" : `${t.duration} period${t.duration > 1 ? "s" : ""}`}</span>
              </button>
            ))}
            {!unplaced.length && <p className="text-muted">Nothing waiting. Add a training or import a BattalionSAT CSV.</p>}
          </div>
        </section>
      </main>
      <TrainingDialog editing={editing} onClose={() => setEditing(null)}
        onSave={(t, old) => { setEditing(null); commit(old ? plan.map((x) => (keyOf(x) === keyOf(old) ? t : x)) : [...plan, t]); }}
        onDelete={(t) => { setEditing(null); commit(plan.filter((x) => keyOf(x) !== keyOf(t))); }} />
    </div>
  );
}

const field = "mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[15px]";

/** Native <dialog> editor for one training: id, name, length, pools, rules, and its place and lock. */
function TrainingDialog({ editing, onClose, onSave, onDelete }: {
  editing: { t: Training; isNew: boolean } | null; onClose: () => void;
  onSave: (t: Training, old: Training | null) => void; onDelete: (t: Training) => void;
}) {
  const { periods, companies } = useSettings();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (editing) ref.current?.showModal(); else ref.current?.close(); }, [editing]);
  if (!editing) return <dialog ref={ref} />;
  const { t, isNew } = editing;

  /** Builds the edited training from the form; clearing the date unplaces it. */
  function submit(form: FormData) {
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const day = get("day") || null;
    const wholeDay = form.get("wholeDay") === "on";
    onSave({
      ...t, id: get("id"), name: get("name") || get("id"), company: get("company"), wholeDay, duration: wholeDay ? 0 : Number(get("duration")),
      instructor: get("instructor"), location: get("location"), resources: get("resources"), rules: get("rules"), tags: get("tags"),
      day, period: day ? Number(get("period")) : null, pin: day ? (form.get("locked") === "on" ? "fixed" : "soft") : "", booked: undefined,
    }, isNew ? null : t);
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Edit training"
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-hairline p-0 shadow-2xl backdrop:bg-heading/30">
      <form key={keyOf(t)} action={submit} className="flex flex-col gap-3 p-6 text-[14px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>Training id<input name="id" defaultValue={t.id} required pattern="[^;@+]+" placeholder="e.g. IPPT" className={field} /></label>
          <label>Name<input name="name" defaultValue={t.name} className={field} /></label>
          <label>Company
            <select name="company" defaultValue={t.company} className={field}>{companies.map((c) => <option key={c.name}>{c.name}</option>)}</select>
          </label>
          <label>Duration (periods)<input type="number" name="duration" min={1} max={periods.length} defaultValue={t.duration || 1} className={field} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="wholeDay" defaultChecked={t.wholeDay} className="accent-primary" /> Whole day</label>
          <label>Tags (a category name colours it)<input name="tags" defaultValue={t.tags} className={field} /></label>
          <label>Conducting (COND)<input name="instructor" defaultValue={t.instructor} placeholder="FT" className={field} /></label>
          <label>Location (LOC)<input name="location" defaultValue={t.location} placeholder="RANGE_1/RANGE_2" className={field} /></label>
          <label className="sm:col-span-2">Resources (RESRC)<input name="resources" defaultValue={t.resources} placeholder="MEDIC,5TONS" className={field} /></label>
        </div>
        <label>Rules
          <textarea name="rules" defaultValue={t.rules} rows={2} placeholder="after:IMT+1d;by:2026-08-31;?periods:P1-P4@20" className={`${field} font-mono text-[13px]`} />
          <span className="mt-1 block text-[12px] text-muted">
            ; between rules. fixed:DATE:P1 · between:DATE..DATE · by:DATE · not_before:DATE · after:ID+1d · before:ID+1d · periods:P1-P4.
            Start with ? for a preference, end with @weight. &quot;/&quot; in LOC, COND or RESRC means any one of; &quot;,&quot; means all of.
          </span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>Placed on (blank = unplaced)<input type="date" name="day" defaultValue={t.day ?? ""} className={field} /></label>
          <label>At period
            <select name="period" defaultValue={t.period ?? 1} className={field}>{periods.map((p, i) => <option key={p.key} value={i}>{periodLabel(periods, i)} ({p.start})</option>)}</select>
          </label>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="locked" defaultChecked={t.pin === "fixed"} className="accent-primary" /> Locked</label>
        </div>
        <div className="flex gap-2 pt-2">
          <button className="rounded-full bg-primary px-5 py-2 font-semibold text-white hover:bg-primary-dark">Save</button>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 font-medium hover:bg-canvas">Cancel</button>
          {!isNew && <button type="button" onClick={() => onDelete(t)} className="ml-auto rounded-full px-4 py-2 font-medium text-primary hover:bg-canvas">Delete</button>}
        </div>
      </form>
    </dialog>
  );
}
