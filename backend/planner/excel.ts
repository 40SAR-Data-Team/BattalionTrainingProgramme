import ExcelJS from "exceljs";
import type { Settings } from "@trng/shared/common/model";
import { addDays, fmtDay, mondayOf } from "@trng/shared/common/periods";
import { parsePeriods, poolGroups, heldPools, spanOf, type Training } from "@trng/shared/planner/rules";

/**
 * The company training programme as the familiar printed Excel timetable, ported from BattalionSAT's excel.py.
 * One sheet per week; each day is four rows (activity, COND, LOC, RESRC) across the periods, and the daily routine
 * fills whatever training leaves free.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Read off a real company programme (BattalionSAT's DEFAULT_ROUTINE). Later rows overwrite earlier ones.
 * ponytail: fixed routine; make it a setting when a unit's day differs. */
const ROUTINE = [
  { days: [0, 1, 2, 3, 4], periods: "P1-P10", name: "ADMIN TIME", cond: "ALL", loc: "COYLINE" },
  { days: [0, 1, 2, 3, 4], periods: "P0", name: "REVEILLE / BREAKFAST / DRAW ARMS", cond: "ALL", loc: "COYLINE" },
  { days: [0, 1, 2, 3], periods: "P10", name: "PX / LAST PARADE", cond: "ALL", loc: "COYLINE" },
  { days: [0, 1, 2, 3], periods: "N1-ON", name: "COY ADMIN", cond: "ALL", loc: "COYLINE" },
  { days: [4], periods: "P9", name: "LAST PARADE", cond: "ALL", loc: "COYLINE" },
  { days: [4], periods: "P10-ON", name: "WEEKEND", cond: "", loc: "" },
  { days: [5], periods: "P0-ON", name: "WEEKEND", cond: "", loc: "" },
  { days: [6], periods: "P0-N3", name: "WEEKEND", cond: "", loc: "" },
  { days: [6], periods: "ON", name: "BOOK IN", cond: "ALL", loc: "COYLINE" },
];

const thin = { style: "thin" as const, color: { argb: "FF808080" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const centre = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex.replace("#", "").toUpperCase()}` } });
const bare = (pool: string) => pool.replace(/^\w+:/, "");

/** Routine blocks for one weekday as [start, length, row], skipping busy periods and merging runs of the same row. */
function routineBlocks(periods: Settings["periods"], weekday: number, busy: Set<number>) {
  const owner: (number | null)[] = periods.map(() => null);
  ROUTINE.forEach((r, i) => { if (r.days.includes(weekday)) for (const p of parsePeriods(periods, r.periods)) owner[p] = i; });
  const out: [number, number, (typeof ROUTINE)[number]][] = [];
  owner.forEach((o, p) => {
    if (o === null || busy.has(p)) return;
    const last = out.at(-1);
    if (last && owner[p - 1] === o && !busy.has(p - 1) && last[0] + last[1] === p) last[1]++;
    else out.push([p, 1, ROUTINE[o]]);
  });
  return out;
}

/** Builds one company's printed programme for every week touching [from, to].
 *
 * Args:
 *   s: Settings (unit name, periods, categories: a tag naming a category colours the block).
 *   plan: The whole plan; only this company's placed trainings are printed.
 *   company: Company to print.
 *   from, to: Window ("YYYY-MM-DD"); sheets start on the Monday of `from`.
 *
 * Returns:
 *   The .xlsx file.
 */
export async function workbook(s: Pick<Settings, "unitName" | "periods" | "categories">, plan: Training[], company: string, from: string, to: string): Promise<Buffer> {
  const { periods } = s;
  const FIRST = 3, REMARKS = FIRST + periods.length;
  const mine = plan.filter((t) => t.company === company && t.day !== null && t.period !== null);
  const colour = (t: Training) => t.tags.split(",").map((x) => x.trim().toLowerCase()).map((tag) => s.categories.find((c) => c.name.toLowerCase() === tag)?.color).find(Boolean);
  const wb = new ExcelJS.Workbook();

  for (let monday = mondayOf(from); monday <= to; monday = addDays(monday, 7)) {
    const ws = wb.addWorksheet(`Wk ${monday.slice(8)}-${monday.slice(5, 7)}`, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    /** Writes one boxed, centred cell. */
    const write = (row: number, col: number, value: string, bold = false, bg?: string) => {
      const c = ws.getCell(row, col);
      c.value = value; c.font = { bold, size: bold ? 9 : 8 }; c.alignment = centre; c.border = box;
      if (bg) c.fill = fill(bg);
    };
    /** One block: four stacked rows, each merged across the periods it spans. */
    const block = (top: number, start: number, length: number, lines: string[], bg?: string) => {
      const first = FIRST + start, last = FIRST + Math.min(start + length, periods.length) - 1;
      lines.forEach((text, r) => {
        if (last > first) ws.mergeCells(top + r, first, top + r, last);
        write(top + r, first, text, r === 0, bg);
      });
    };

    ws.getCell("A1").value = "COMPANY:";
    ws.getCell("B1").value = s.unitName ? `${company} (${s.unitName})` : company;
    ws.getCell("E1").value = "TRAINING PROGRAMME FOR";
    ws.getCell("J1").value = `${fmtDay(monday, { day: "2-digit", month: "2-digit", year: "2-digit" })}  -  ${fmtDay(addDays(monday, 6), { day: "2-digit", month: "2-digit", year: "2-digit" })}`;
    for (const a of ["A1", "B1", "E1", "J1"]) ws.getCell(a).font = { bold: true, size: 11 };

    ws.mergeCells(3, 1, 4, 1);
    write(3, 1, "Date", true, "#D9D9D9"); write(3, 2, "Period", true, "#D9D9D9"); write(4, 2, "Time", true, "#D9D9D9");
    periods.forEach((p, i) => {
      write(3, FIRST + i, p.label.toUpperCase(), true, "#D9D9D9");
      write(4, FIRST + i, `${p.start.replace(":", "")} – ${p.end.replace(":", "")}`, false, "#D9D9D9");
    });
    ws.mergeCells(3, REMARKS, 4, REMARKS);
    write(3, REMARKS, "REMARKS", true, "#D9D9D9");

    WEEKDAYS.forEach((name, d) => {
      const day = addDays(monday, d), top = 5 + d * 4;
      ws.mergeCells(top, 1, top + 3, 1);
      write(top, 1, `${name} ${day.slice(8)}/${day.slice(5, 7)}`, true);
      ws.mergeCells(top, REMARKS, top + 3, REMARKS);
      write(top, REMARKS, "");
      ["", "COND", "LOC", "RESRC"].forEach((label, r) => write(top + r, 2, label));
      ws.getRow(top).height = 36;

      const busy = new Set<number>();
      for (const t of mine.filter((x) => x.day === day)) {
        const span = spanOf(periods, t);
        for (let p = t.period!; p < Math.min(t.period! + span, periods.length); p++) busy.add(p);
        const pools = heldPools(t).length ? heldPools(t) : poolGroups(t).map((g) => g[0]);
        const of = (ns: string) => pools.filter((x) => x.startsWith(`${ns}:`)).map(bare).join(", ");
        block(top, t.period!, span, [t.name.toUpperCase(), of("instr"), of("loc"), of("res")], colour(t));
      }
      for (const [start, length, r] of routineBlocks(periods, d, busy)) block(top, start, length, [r.name, r.cond, r.loc, ""]);
    });

    ws.getColumn(1).width = 11; ws.getColumn(2).width = 7; ws.getColumn(REMARKS).width = 18;
    periods.forEach((_, i) => { ws.getColumn(FIRST + i).width = 12; });
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
