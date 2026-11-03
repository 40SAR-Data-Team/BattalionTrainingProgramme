"use client";
import { addDays, fmtDay, mondayOf, sgDate } from "@trng/shared/periods";

const fmt = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

/** Previous / this week / next controls around a "15 Sep – 21 Sep" label; click the label to pick any day. `week` is a Monday, "YYYY-MM-DD". */
export function WeekNav({ week, onChange }: { week: string; onChange: (monday: string) => void }) {
  const btn = "grid size-9 place-items-center rounded-full text-[20px] hover:bg-canvas";
  return (
    <div className="flex items-center gap-1 text-[15px]">
      <button onClick={() => onChange(addDays(week, -7))} className={btn} aria-label="Previous week">‹</button>
      <label className="relative min-w-36 cursor-pointer rounded-full px-2 py-1 text-center font-semibold tabular-nums hover:bg-canvas">
        {fmt(week)} – {fmt(addDays(week, 6))}
        {/* ponytail: native date picker, hidden under the label; showPicker() opens it on click */}
        <input type="date" value={week} aria-label="Jump to week"
          onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => e.target.value && onChange(mondayOf(e.target.value))}
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <button onClick={() => onChange(addDays(week, 7))} className={btn} aria-label="Next week">›</button>
      <button onClick={() => onChange(mondayOf(sgDate(new Date())))} className="whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-primary hover:bg-canvas">
        This week
      </button>
    </div>
  );
}
