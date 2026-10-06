"use client";
import { useEffect, useRef } from "react";
import { CATEGORIES, COMPANIES, type Event } from "@/lib/model";
import { PERIODS, sgDate, spanToTimes, timesToSpan } from "@/lib/periods";

const field = "w-full rounded-lg border border-black/10 px-3 py-2 text-[14px]";

/** Native <dialog> editor for one event; calls onSave with the edited copy, onDelete to remove. */
export function EventDialog({ event, onClose, onSave, onDelete }: {
  event: Event | null; onClose: () => void; onSave: (e: Event) => void; onDelete?: (e: Event) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (event) ref.current?.showModal(); else ref.current?.close(); }, [event]);
  if (!event) return <dialog ref={ref} />;
  const [s, t] = event.all_day ? [0, 0] : timesToSpan(event.start_at, event.end_at);

  /** Builds the edited event from the form fields. */
  function submit(form: FormData) {
    const date = String(form.get("date"));
    const allDay = form.get("allDay") === "on";
    const endDate = String(form.get("endDate") || date);
    const times = allDay
      ? { start_at: `${date}T00:00:00+08:00`, end_at: `${endDate}T00:00:00+08:00` }
      : spanToTimes(date, Number(form.get("start")), Math.max(Number(form.get("start")), Number(form.get("end"))));
    onSave({
      ...event!, ...times, all_day: allDay,
      title: String(form.get("title")), category: String(form.get("category")) || null,
      companies: form.getAll("companies").map(String),
      cond: String(form.get("cond")), loc: String(form.get("loc")), resrc: String(form.get("resrc")), comments: String(form.get("comments")),
    });
  }

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-[18px] p-0 backdrop:bg-black/30">
      <form key={event.id} action={submit} className="flex flex-col gap-3 p-6 text-[14px]">
        <input name="title" defaultValue={event.title} required className="text-[21px] font-semibold outline-none" aria-label="Title" />
        <div className="grid grid-cols-2 gap-3">
          <label>Date<input type="date" name="date" defaultValue={sgDate(event.start_at)} required className={field} /></label>
          <label>Category
            <select name="category" defaultValue={event.category ?? ""} className={field}>
              <option value="">—</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>From period
            <select name="start" defaultValue={s} className={field}>{PERIODS.map((p, i) => <option key={p.key} value={i}>{p.label} ({p.start})</option>)}</select>
          </label>
          <label>To period
            <select name="end" defaultValue={t} className={field}>{PERIODS.map((p, i) => <option key={p.key} value={i}>{p.label} (to {p.end})</option>)}</select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" name="allDay" defaultChecked={event.all_day} /> Remarks (all day)</label>
          <label>Until (all day)<input type="date" name="endDate" defaultValue={sgDate(event.end_at)} className={field} /></label>
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1">Companies</legend>
          {COMPANIES.map((c) => (
            <label key={c} className="flex items-center gap-1"><input type="checkbox" name="companies" value={c} defaultChecked={event.companies.includes(c)} />{c}</label>
          ))}
        </fieldset>
        <label>Conducting (COND)<input name="cond" defaultValue={event.cond ?? ""} className={field} /></label>
        <label>Location (LOC)<input name="loc" defaultValue={event.loc ?? ""} className={field} /></label>
        <label>Resources (RESRC)<input name="resrc" defaultValue={event.resrc ?? ""} className={field} /></label>
        <label>Comments<textarea name="comments" defaultValue={event.comments ?? ""} rows={3} className={field} /></label>
        <div className="mt-2 flex gap-2">
          {onDelete && <button type="button" onClick={() => onDelete(event)} className="rounded-lg px-4 py-2 text-red-600 hover:bg-red-50">Delete</button>}
          <button type="button" onClick={onClose} className="ml-auto rounded-full px-4 py-2 hover:bg-black/5">Cancel</button>
          <button className="rounded-full bg-primary px-5 py-2 text-white transition active:scale-95">Save</button>
        </div>
      </form>
    </dialog>
  );
}
