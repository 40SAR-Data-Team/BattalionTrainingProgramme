"use client";
import { addDays, fmtDay, mondayOf, sgDate } from "@trng/shared/periods";

const fmt = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

/** Previous / this week / next controls around a "15 Sep – 21 Sep" label. `week` is a Monday, "YYYY-MM-DD". */
export function WeekNav({ week, onChange }: { week: string; onChange: (monday: string) => void }) {
  const btn = "grid size-9 place-items-center rounded-full text-[20px] hover:bg-canvas";
  return (
    <div className="flex items-center gap-1 text-[15px]">
      <button onClick={() => onChange(addDays(week, -7))} className={btn} aria-label="Previous week">‹</button>
      <span className="min-w-36 text-center font-semibold tabular-nums">{fmt(week)} – {fmt(addDays(week, 6))}</span>
      <button onClick={() => onChange(addDays(week, 7))} className={btn} aria-label="Next week">›</button>
      <button onClick={() => onChange(mondayOf(sgDate(new Date())))} className="whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-primary hover:bg-canvas">
        This week
      </button>
    </div>
  );
}
