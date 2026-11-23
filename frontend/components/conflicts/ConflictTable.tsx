import type { Clash } from "@trng/shared/common/clash";
import type { Event } from "@trng/shared/common/model";
import { fmtDay, sgDate, timeLabel } from "@trng/shared/common/periods";
import { CompanyChip } from "@/components/common/Timetable";

const cell = "border-b border-hairline px-3 py-2 align-top";

/** One side of a clash: time, title and companies. */
function Side({ e }: { e: Event }) {
  return (
    <td className={cell}>
      <div className="tabular-nums text-muted">{timeLabel(e)}</div>
      <div className="font-semibold">{e.title}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">{e.companies.map((c) => <CompanyChip key={c} name={c} small />)}</div>
    </td>
  );
}

/** Table of location clashes: where, when, and the two activities that both booked it. */
export function ConflictTable({ clashes }: { clashes: Clash<Event>[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-[14px]">
        <caption className="px-3 pt-3 pb-1 text-left font-display text-[17px] font-semibold">
          {clashes.length ? `${clashes.length} location clash${clashes.length === 1 ? "" : "es"}` : "No location clashes"}
        </caption>
        <thead className="text-[13px] text-muted">
          <tr>{["Location", "Date", "Activity", "Clashes with"].map((h) => <th key={h} className={`${cell} font-medium`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {clashes.map(({ a, b }) => (
            <tr key={`${a.id}-${b.id}`} data-clash={`${a.title} x ${b.title}`}>
              <td className={`${cell} font-semibold`}>{a.loc}</td>
              <td className={`${cell} whitespace-nowrap`}>{fmtDay(sgDate(a.start_at), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td>
              <Side e={a} />
              <Side e={b} />
            </tr>
          ))}
          {!clashes.length && <tr><td colSpan={4} className="px-3 py-10 text-center text-muted">No two activities share a location at the same time.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
