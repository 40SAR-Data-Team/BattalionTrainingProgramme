"use client";
import type { Event } from "@trng/shared/model";
import { addDays, hhmm, onGrid, sgDate, timesToSpan } from "@trng/shared/periods";
import { inkOn, useSettings } from "./SettingsContext";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NO_CATEGORY = "#ffffff";

type Props = {
  events: Event[];
  week: string; // Monday, "YYYY-MM-DD"
  showCompanies?: boolean;
  onOpen?: (e: Event) => void;
  onMove?: (id: string, day: string, period: number) => void;
};

/** Greedy lane packing so overlapping events in a day stack vertically (NUSMods-style). */
function lanes(items: { e: Event; s: number; t: number }[]) {
  const ends: number[] = [];
  return items
    .sort((a, b) => a.s - b.s || b.t - a.t)
    .map((it) => {
      let lane = ends.findIndex((end) => end < it.s);
      if (lane < 0) lane = ends.push(0) - 1;
      ends[lane] = it.t;
      return { ...it, lane };
    });
}

/** Category colour of an event, for cards and list chips. */
export function useCategoryColor() {
  const { categories } = useSettings();
  return (e: Pick<Event, "category">) => categories.find((c) => c.name === e.category)?.color ?? NO_CATEGORY;
}

/** Week grid: days as rows, training periods as columns, Remarks on the right. Drag a card to move it. */
export function Timetable({ events, week, showCompanies, onOpen, onMove }: Props) {
  const { periods } = useSettings();
  const today = sgDate(new Date());
  const cols = `4.5rem repeat(${periods.length}, minmax(4.75rem, 1fr)) 9rem`;
  return (
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white shadow-sm">
      <div className="min-w-[1200px] text-[12px] leading-tight">
        <div className="grid border-b border-hairline font-display text-[13px] font-semibold" style={{ gridTemplateColumns: cols }}>
          <div className="p-2 text-muted">Day</div>
          {periods.map((p) => (
            <div key={p.key} className="border-l border-hairline p-2 text-center">
              <div>{p.label}</div>
              <div className="font-sans text-[11px] font-normal text-muted tabular-nums">{p.start.replace(":", "")}</div>
            </div>
          ))}
          <div className="border-l border-hairline p-2">Remarks</div>
        </div>
        {DAY.map((label, d) => {
          const day = addDays(week, d);
          const timed = lanes(events
            .filter((e) => !e.all_day && sgDate(e.start_at) === day)
            .map((e) => { const [s, t] = timesToSpan(periods, e.start_at, e.end_at); return { e, s, t }; }));
          const remarks = events.filter((e) => e.all_day && sgDate(e.start_at) <= day && day <= sgDate(e.end_at));
          const rows = Math.max(1, ...timed.map((x) => x.lane + 1));
          const isToday = day === today;
          return (
            <div key={day} data-day={day} className={`grid border-b border-hairline last:border-b-0 ${isToday ? "bg-canvas/40" : ""}`}
              style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${rows}, minmax(3.75rem, auto))` }}>
              <div className="p-2" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
                <div className={`font-display text-[15px] font-semibold ${isToday ? "text-primary" : ""}`}>{label}</div>
                <div className="text-muted tabular-nums">{day.slice(8)}/{Number(day.slice(5, 7))}</div>
              </div>
              {periods.map((p, i) => (
                <div key={p.key} className="border-l border-hairline/70" style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
                  onDragOver={(ev) => onMove && ev.preventDefault()}
                  onDrop={(ev) => onMove?.(ev.dataTransfer.getData("text/plain"), day, i)} />
              ))}
              {timed.map(({ e, s, t, lane }) => (
                <Card key={e.id} e={e} showCompanies={showCompanies} onOpen={onOpen} draggable={!!onMove}
                  style={{ gridColumn: `${s + 2} / ${t + 3}`, gridRow: lane + 1 }} />
              ))}
              <div className="flex flex-col gap-1 border-l border-hairline p-1" style={{ gridColumn: periods.length + 2, gridRow: "1 / -1" }}>
                {remarks.map((e) => <Card key={e.id} e={e} showCompanies={showCompanies} onOpen={onOpen} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One activity block: title, then COND / LOC / RESRC lines as on the source programme. */
function Card({ e, showCompanies, onOpen, draggable, style }: {
  e: Event; showCompanies?: boolean; onOpen?: (e: Event) => void; draggable?: boolean; style?: React.CSSProperties;
}) {
  const { periods } = useSettings();
  const color = useCategoryColor()(e);
  const uncertain = e.comments?.startsWith("UNCERTAIN");
  return (
    <button type="button" draggable={draggable} data-event={e.title}
      style={{ ...style, background: color, borderLeftColor: `color-mix(in oklab, ${color} 55%, #1d1d1f)` }}
      onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
      onClick={() => onOpen?.(e)}
      className={`relative z-10 m-0.5 overflow-hidden rounded-lg border border-l-4 border-black/5 px-2 py-1 text-left transition hover:brightness-95 active:scale-[.98] ${draggable ? "cursor-grab" : ""} ${uncertain ? "ring-2 ring-orange-500" : ""}`}>
      <div className="font-display text-[13px] font-semibold uppercase">{e.title}</div>
      {!e.all_day && !onGrid(periods, e.start_at, e.end_at) && <div className="tabular-nums text-ink/70">{hhmm(e.start_at)}–{hhmm(e.end_at)}</div>}
      {[e.cond, e.loc, e.resrc].filter(Boolean).map((v, i) => <div key={i} className="text-ink/70">{v}</div>)}
      {showCompanies && <div className="mt-0.5 flex flex-wrap gap-0.5">{e.companies.map((c) => <CompanyChip key={c} name={c} small />)}</div>}
    </button>
  );
}

/** A company name in its configured colour. */
export function CompanyChip({ name, small }: { name: string; small?: boolean }) {
  const bg = useSettings().companies.find((c) => c.name === name)?.color ?? "#ffffff";
  return (
    <span className={`inline-block rounded-full font-medium ${small ? "px-1.5 text-[10px]" : "px-2.5 py-0.5 text-[12px]"}`}
      style={{ background: bg, color: inkOn(bg) }}>{name}</span>
  );
}
