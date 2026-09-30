"use client";
import type { Event } from "@/lib/model";
import { PERIODS, addDays, hhmm, onGrid, sgDate, timesToSpan } from "@/lib/periods";

/** Card tint per category, echoing the source programme's colour legend. */
export const TINT: Record<string, string> = {
  Outfield: "bg-green-50 border-green-600",
  "External Training": "bg-sky-50 border-sky-600",
  "Physical Training": "bg-yellow-50 border-yellow-500",
  "Live Firing/HRA": "bg-orange-50 border-orange-600",
  "Off/Leave/Weekend": "bg-zinc-100 border-zinc-400",
};
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLS = `4.5rem repeat(${PERIODS.length}, minmax(4.75rem, 1fr)) 9rem`;

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

/** Week grid: days as rows, fixed training periods as columns, REMARKS on the right. */
export function Timetable({ events, week, showCompanies, onOpen, onMove }: Props) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-hairline bg-white">
      <div className="min-w-[1200px] text-[12px] leading-tight">
        <div className="grid border-b border-hairline bg-parchment font-semibold" style={{ gridTemplateColumns: COLS }}>
          <div className="p-2">Day</div>
          {PERIODS.map((p) => (
            <div key={p.key} className="border-l border-hairline p-2 text-center">
              <div>{p.label}</div>
              <div className="font-normal text-zinc-500">{p.start.replace(":", "")}–{p.key === "ON" ? "" : p.end.replace(":", "")}</div>
            </div>
          ))}
          <div className="border-l border-hairline p-2">Remarks</div>
        </div>
        {DAY.map((label, d) => {
          const day = addDays(week, d);
          const timed = lanes(events
            .filter((e) => !e.all_day && sgDate(e.start_at) === day)
            .map((e) => { const [s, t] = timesToSpan(e.start_at, e.end_at); return { e, s, t }; }));
          const remarks = events.filter((e) => e.all_day && sgDate(e.start_at) <= day && day <= sgDate(e.end_at));
          const rows = Math.max(1, ...timed.map((x) => x.lane + 1));
          return (
            <div key={day} className="grid border-b border-hairline last:border-b-0"
              style={{ gridTemplateColumns: COLS, gridTemplateRows: `repeat(${rows}, minmax(3.75rem, auto))` }}>
              <div className="p-2 font-semibold" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
                {label}<div className="font-normal text-zinc-500">{day.slice(8)}/{Number(day.slice(5, 7))}</div>
              </div>
              {PERIODS.map((p, i) => (
                <div key={p.key} className="border-l border-hairline" style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
                  onDragOver={(ev) => onMove && ev.preventDefault()}
                  onDrop={(ev) => onMove?.(ev.dataTransfer.getData("text/plain"), day, i)} />
              ))}
              {timed.map(({ e, s, t, lane }) => (
                <Card key={e.id} e={e} showCompanies={showCompanies} onOpen={onOpen} draggable={!!onMove}
                  style={{ gridColumn: `${s + 2} / ${t + 3}`, gridRow: lane + 1 }} />
              ))}
              <div className="flex flex-col gap-1 border-l border-hairline p-1" style={{ gridColumn: PERIODS.length + 2, gridRow: "1 / -1" }}>
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
  return (
    <button type="button" style={style} draggable={draggable}
      onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
      onClick={() => onOpen?.(e)}
      className={`relative z-10 m-0.5 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left transition active:scale-95 ${TINT[e.category ?? ""] ?? "bg-blue-50 border-primary"} ${draggable ? "cursor-grab" : ""} ${e.comments?.startsWith("UNCERTAIN") ? "ring-2 ring-orange-400" : ""}`}>
      <div className="font-semibold uppercase">{e.title}</div>
      {!e.all_day && !onGrid(e.start_at, e.end_at) && <div className="text-zinc-600">{hhmm(e.start_at)}–{hhmm(e.end_at)}</div>}
      {e.cond && <div className="text-zinc-600">{e.cond}</div>}
      {e.loc && <div className="text-zinc-600">{e.loc}</div>}
      {e.resrc && <div className="text-zinc-600">{e.resrc}</div>}
      {showCompanies && <div className="mt-0.5 flex flex-wrap gap-0.5">{e.companies.map((c) => (
        <span key={c} className="rounded-full bg-white/80 px-1.5 text-[10px] text-zinc-700">{c}</span>
      ))}</div>}
    </button>
  );
}
