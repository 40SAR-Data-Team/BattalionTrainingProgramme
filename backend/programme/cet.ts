import type { Event } from "@trng/shared/common/model";
import { buildCet, keepFilled } from "@trng/shared/programme/cet";
import { sgDate } from "@trng/shared/common/periods";
import { sql } from "../common/db";
import { toEvent } from "../common/events";
import { allDayWhen, api, calendarId, gone } from "./google";
import { getSettings } from "../common/settings";

const TITLE = "📢 CET";

/** Brings every company calendar's CET all-day events in line with the programme: one per day that has activities,
 * written only when its text changed, and removed when its day has none. Idempotent, so it also backfills.
 * ponytail: a multi-day activity counts on its start day only; per-day fan-out if CET must show it on every day. */
export async function syncCet(): Promise<void> {
  const { companies, lookbackDays } = await getSettings();
  const g = await api();
  for (const { name } of companies) {
    const cal = await calendarId(name);
    const rows = await sql`
      select * from events where ${name} = any(companies) and end_at >= now() - make_interval(days => ${lookbackDays})`;
    const byDay = new Map<string, Event[]>();
    for (const e of rows.map(toEvent)) byDay.set(sgDate(e.start_at), [...(byDay.get(sgDate(e.start_at)) ?? []), e]);

    const { data } = await g.events.list({
      calendarId: cal, privateExtendedProperty: ["cet=1"], singleEvents: true, maxResults: 2500,
    });
    const existing = new Map((data.items ?? []).map((c) => [c.extendedProperties?.private?.cetDay, c]));

    for (const [day, c] of existing) {
      if (day && byDay.has(day)) continue;
      await g.events.delete({ calendarId: cal, eventId: c.id! }).catch((err) => { if (!gone(err)) throw err; });
    }
    for (const [day, evs] of byDay) {
      const old = existing.get(day);
      const description = keepFilled(old?.description, buildCet(day, evs));
      if (old?.description === description) continue;
      const requestBody = {
        summary: TITLE, description, transparency: "transparent", ...allDayWhen(day, day),
        extendedProperties: { private: { cet: "1", cetDay: day } },
      };
      if (old) await g.events.patch({ calendarId: cal, eventId: old.id!, requestBody });
      else await g.events.insert({ calendarId: cal, requestBody });
    }
  }
}
