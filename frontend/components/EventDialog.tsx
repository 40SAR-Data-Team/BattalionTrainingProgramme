"use client";
import { useEffect, useRef } from "react";
import type { Event } from "@trng/shared/model";
import { sgDate, sgMidnight, spanToTimes, timesToSpan } from "@trng/shared/periods";
import { useSettings } from "./SettingsContext";

const field = "mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[15px]";

/** Native <dialog> editor for one event; calls onSave with the edited copy, onDelete to remove. */
export function EventDialog({ event, onClose, onSave, onDelete }: {
  event: Event | null; onClose: () => void; onSave: (e: Event) => void; onDelete?: (e: Event) => void;
}) {
  const { periods, categories, companies } = useSettings();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (event) ref.current?.showModal(); else ref.current?.close(); }, [event]);
  if (!event) return <dialog ref={ref} />;
  const [s, t] = event.all_day ? [0, 0] : timesToSpan(periods, event.start_at, event.end_at);

  /** Builds the edited event from the form fields. */
  function submit(form: FormData) {
    const date = String(form.get("date"));
    const allDay = form.get("allDay") === "on";
    const endDate = String(form.get("endDate") || date);
    const from = Number(form.get("start"));
    const times = allDay
      ? { start_at: sgMidnight(date), end_at: sgMidnight(endDate) }
      : spanToTimes(periods, date, from, Math.max(from, Number(form.get("end"))));
    onSave({
      ...event!, ...times, all_day: allDay,
      title: String(form.get("title")), category: String(form.get("category")) || null,
      companies: form.getAll("companies").map(String),
      cond: String(form.get("cond")), loc: String(form.get("loc")), resrc: String(form.get("resrc")), comments: String(form.get("comments")),
    });
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-label="Edit activity"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-hairline p-0 shadow-2xl backdrop:bg-heading/30">
      <form key={event.id} action={submit} className="flex flex-col gap-4 p-6 text-[14px]">
        <input name="title" defaultValue={event.title} required aria-label="Title"
          className="border-b border-hairline pb-2 font-display text-[24px] font-semibold uppercase outline-none focus:border-primary" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>Date<input type="date" name="date" defaultValue={sgDate(event.start_at)} required className={field} /></label>
          <label>Category
            <select name="category" defaultValue={event.category ?? ""} className={field}>
              <option value="">None</option>{categories.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label>From period
            <select name="start" defaultValue={s} className={field}>{periods.map((p, i) => <option key={p.key} value={i}>{p.label} ({p.start})</option>)}</select>
          </label>
          <label>To period
            <select name="end" defaultValue={t} className={field}>{periods.map((p, i) => <option key={p.key} value={i}>{p.label} (to {p.end})</option>)}</select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" name="allDay" defaultChecked={event.all_day} className="accent-primary" /> Remarks (all day)</label>
          <label>Until (all day)<input type="date" name="endDate" defaultValue={sgDate(event.end_at)} className={field} /></label>
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1">Companies</legend>
          {companies.map((c) => (
            <label key={c.name} className="flex items-center gap-1.5">
              <input type="checkbox" name="companies" value={c.name} defaultChecked={event.companies.includes(c.name)} className="accent-primary" />{c.name}
            </label>
          ))}
        </fieldset>
        <label>Conducting (COND)<input name="cond" defaultValue={event.cond ?? ""} className={field} /></label>
        <label>Location (LOC)<input name="loc" defaultValue={event.loc ?? ""} className={field} /></label>
        <label>Resources (RESRC)<input name="resrc" defaultValue={event.resrc ?? ""} className={field} /></label>
        <label>Comments<textarea name="comments" defaultValue={event.comments ?? ""} rows={3} className={field} /></label>
        <div className="mt-2 flex gap-2">
          {onDelete && <button type="button" onClick={() => onDelete(event)} className="rounded-full px-4 py-2 font-medium text-primary hover:bg-red-50">Delete</button>}
          <button type="button" onClick={onClose} className="ml-auto rounded-full px-4 py-2 font-medium hover:bg-canvas">Cancel</button>
          <button className="rounded-full bg-primary px-6 py-2 font-semibold text-white transition hover:bg-primary-dark active:scale-95">Save</button>
        </div>
      </form>
    </dialog>
  );
}
