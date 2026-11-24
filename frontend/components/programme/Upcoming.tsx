"use client";
import type { Event } from "@trng/shared/common/model";
import { addDays, fmtDay, sgDate, timeLabel } from "@trng/shared/common/periods";
import { useSettings } from "@/components/common/SettingsContext";
import { CompanyChip, useCategoryColor } from "@/components/common/Timetable";

const dayLabel = (iso: string) => fmtDay(sgDate(iso), { weekday: "short", day: "numeric", month: "short" });

/** Table of events from today through the configured upcoming window, soonest first. */
export function Upcoming({ events, onOpen }: { events: Event[]; onOpen: (e: Event) => void }) {
  const { upcomingDays } = useSettings();
  const colorOf = useCategoryColor();
  const today = sgDate(new Date());
  const rows = events.filter((e) => sgDate(e.end_at) >= today && sgDate(e.start_at) <= addDays(today, upcomingDays));
  const cell = "border-b border-hairline px-3 py-2 align-top";
  return (
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white shadow-sm">
      <table className="w-full min-w-[900px] text-left text-[14px]">
        <caption className="px-3 pt-3 pb-1 text-left font-display text-[17px] font-semibold">Next {upcomingDays} days</caption>
        <thead className="text-[13px] text-muted">
          <tr>{["Date", "Time", "Activity", "Companies", "COND", "LOC", "RESRC", "Comments"].map((h) => <th key={h} className={`${cell} font-medium`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} onClick={() => onOpen(e)} className="cursor-pointer hover:bg-canvas/50">
              <td className={`${cell} whitespace-nowrap`}>{dayLabel(e.start_at)}</td>
              <td className={`${cell} whitespace-nowrap tabular-nums`}>{timeLabel(e)}</td>
              <td className={cell}>
                <span className="mr-2 inline-block size-2.5 rounded-full border border-black/10" style={{ background: colorOf(e) }} />
                <span className="font-semibold">{e.title}</span>
              </td>
              <td className={cell}><div className="flex flex-wrap gap-1">{e.companies.map((c) => <CompanyChip key={c} name={c} />)}</div></td>
              <td className={cell}>{e.cond}</td>
              <td className={cell}>{e.loc}</td>
              <td className={cell}>{e.resrc}</td>
              <td className={`${cell} whitespace-pre-line text-muted`}>{e.comments}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-muted">Nothing coming up matches. Clear the search or pick another company.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
