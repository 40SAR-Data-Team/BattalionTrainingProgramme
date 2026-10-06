"use client";
import type { Event } from "@/lib/model";
import { addDays, hhmm, sgDate } from "@/lib/periods";
import { TINT } from "./Timetable";

/** Table of events from today through the next 60 days, soonest first. */
export function Upcoming({ events, onOpen }: { events: Event[]; onOpen: (e: Event) => void }) {
  const today = sgDate(new Date());
  const rows = events.filter((e) => sgDate(e.end_at) >= today && sgDate(e.start_at) <= addDays(today, 60));
  const cell = "border-b border-hairline px-3 py-2 align-top";
  return (
    <div className="overflow-x-auto rounded-[18px] border border-hairline bg-white">
      <table className="w-full min-w-[900px] text-left text-[14px]">
        <thead className="bg-parchment text-[12px] font-semibold">
          <tr>{["Date", "Time", "Activity", "Companies", "COND", "LOC", "RESRC", "Category", "Comments"].map((h) => <th key={h} className={cell}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} onClick={() => onOpen(e)} className="cursor-pointer hover:bg-parchment">
              <td className={`${cell} whitespace-nowrap`}>{new Date(sgDate(e.start_at) + "T00:00:00Z").toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</td>
              <td className={`${cell} whitespace-nowrap`}>{e.all_day ? "All day" : `${hhmm(e.start_at)}–${hhmm(e.end_at)}`}</td>
              <td className={`${cell} font-semibold`}>{e.title}</td>
              <td className={cell}>{e.companies.join(", ")}</td>
              <td className={cell}>{e.cond}</td>
              <td className={cell}>{e.loc}</td>
              <td className={cell}>{e.resrc}</td>
              <td className={cell}>{e.category && <span className={`rounded-full border-l-4 px-2 py-0.5 text-[12px] ${TINT[e.category] ?? ""}`}>{e.category}</span>}</td>
              <td className={`${cell} whitespace-pre-line text-zinc-600`}>{e.comments}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">No upcoming events match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
