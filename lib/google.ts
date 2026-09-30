import { sql, type Event } from "./db";
import { addDays, sgDate } from "./periods";

const API = "https://www.googleapis.com/calendar/v3";
const TZ = "Asia/Singapore";
/** Google Calendar colorId per category (basil, blueberry, banana, tangerine, graphite). */
const COLOR: Record<string, string> = {
  Outfield: "10", "External Training": "9", "Physical Training": "5", "Live Firing/HRA": "6", "Off/Leave/Weekend": "8",
};

/** Thrown when Google has a newer version of an event than the app (HTTP 412). */
export class ConflictError extends Error {}

type GEvent = {
  id: string; etag: string; status?: string; summary?: string; location?: string; description?: string; colorId?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

let token: { value: string; expires: number } | null = null;

/** Owner access token from GOOGLE_REFRESH_TOKEN, cached until a minute before expiry. */
async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}); reconnect the owner account`);
  const body = await res.json();
  token = { value: body.access_token, expires: Date.now() + (body.expires_in - 60) * 1000 };
  return token.value;
}

/** Calendar REST call; retries 429 / rate-limit 403 with backoff and returns the raw Response. */
async function gcal(path: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    });
    const limited = res.status === 429 || (res.status === 403 && /rateLimitExceeded/.test(await res.clone().text()));
    if (!limited || attempt >= 4) return res;
    await new Promise((r) => setTimeout(r, 2 ** attempt * 500 + Math.random() * 250));
  }
}

/** gcal() that throws on any non-2xx status and parses the JSON body. */
async function gjson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await gcal(path, init);
  if (!res.ok) throw new Error(`Google Calendar ${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Calendar id for a company: cached in `calendars`, else found by name, else created. */
export async function calendarId(company: string): Promise<string> {
  const [row] = await sql`select calendar_id from calendars where company = ${company}`;
  if (row) return row.calendar_id;
  const name = `40SAR ${company} Training Program`;
  const list = await gjson<{ items: { id: string; summary: string }[] }>("/users/me/calendarList?maxResults=250");
  const id = list.items.find((c) => c.summary === name)?.id
    ?? (await gjson<{ id: string }>("/calendars", { method: "POST", body: JSON.stringify({ summary: name, timeZone: TZ }) })).id;
  await sql`insert into calendars (company, calendar_id) values (${company}, ${id}) on conflict do nothing`;
  return id;
}

/** Event description: structured fields Google users can edit, then free-text comments after "---". */
export function describe(e: Pick<Event, "cond" | "resrc" | "category" | "comments">): string {
  return `COND: ${e.cond ?? ""}\nRESRC: ${e.resrc ?? ""}\nCATEGORY: ${e.category ?? ""}\n---\n${e.comments ?? ""}`;
}

/** Inverse of describe(); free text without the header becomes comments. */
export function parseDescription(text = ""): Pick<Event, "cond" | "resrc" | "category" | "comments"> {
  const [head, ...rest] = text.split("\n---\n");
  if (!rest.length) return { cond: null, resrc: null, category: null, comments: text || null };
  const field = (k: string) => head.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "m"))?.[1].trim() || null;
  return { cond: field("COND"), resrc: field("RESRC"), category: field("CATEGORY"), comments: rest.join("\n---\n") || null };
}

/** Google event resource for one company's copy of an app event. */
export function toGoogle(e: Event, company: string) {
  const when = e.all_day
    ? { start: { date: sgDate(e.start_at) }, end: { date: addDays(sgDate(e.end_at), 1) } } // Google's all-day end is exclusive
    : { start: { dateTime: e.start_at, timeZone: TZ }, end: { dateTime: e.end_at, timeZone: TZ } };
  return {
    summary: e.title, location: e.loc ?? "", description: describe(e), colorId: COLOR[e.category ?? ""],
    extendedProperties: { private: { trngEventId: e.id, company } }, ...when,
  };
}

/** App event fields read back from a Google event (times normalised to ISO). */
export function fromGoogle(g: GEvent) {
  const allDay = !!g.start?.date;
  return {
    title: g.summary ?? "(untitled)", loc: g.location || null, all_day: allDay,
    start_at: allDay ? `${g.start!.date}T00:00:00+08:00` : new Date(g.start!.dateTime!).toISOString(),
    end_at: allDay ? `${addDays(g.end!.date!, -1)}T00:00:00+08:00` : new Date(g.end!.dateTime!).toISOString(),
    ...parseDescription(g.description),
  };
}

/** Creates or ETag-patches one company copy; returns its new {id, etag}. Throws ConflictError on 412. */
async function pushCopy(e: Event, company: string, ifMatch = true) {
  const cal = encodeURIComponent(await calendarId(company));
  const copy = e.google[company];
  const body = JSON.stringify(toGoogle(e, company));
  if (copy) {
    const res = await gcal(`/calendars/${cal}/events/${copy.id}`, { method: "PATCH", body, headers: ifMatch ? { "If-Match": copy.etag } : {} });
    if (res.status === 412) throw new ConflictError(`"${e.title}" was changed in Google Calendar`);
    if (res.ok) return pick(await res.json());
    if (res.status !== 404 && res.status !== 410) throw new Error(`Google PATCH ${res.status}: ${await res.text()}`);
  }
  return pick(await gjson<GEvent>(`/calendars/${cal}/events`, { method: "POST", body })); // new, or copy deleted in Google
}

const pick = (g: GEvent) => ({ id: g.id, etag: g.etag });

/** Deletes one company copy; already-gone copies are fine. */
async function deleteCopy(company: string, copy: { id: string }) {
  const res = await gcal(`/calendars/${encodeURIComponent(await calendarId(company))}/events/${copy.id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google DELETE ${res.status}: ${await res.text()}`);
}

/** Writes an event to every company calendar it belongs to, removes stale copies, and saves the new etags. */
export async function pushEvent(e: Event, { ifMatch = true, only }: { ifMatch?: boolean; only?: string[] } = {}) {
  const google = { ...e.google };
  for (const company of Object.keys(google)) {
    if (!e.companies.includes(company)) { await deleteCopy(company, google[company]); delete google[company]; }
  }
  for (const company of only ?? e.companies) google[company] = await pushCopy({ ...e, google }, company, ifMatch);
  await sql`update events set google = ${JSON.stringify(google)}::jsonb where id = ${e.id}`;
  return google;
}

/** Deletes every Google copy of an event. */
export async function deleteEverywhere(e: Event) {
  for (const [company, copy] of Object.entries(e.google)) await deleteCopy(company, copy);
}

/** Incremental pull of one company calendar into the DB; Google wins on every change it reports. */
export async function pull(company: string) {
  const cal = encodeURIComponent(await calendarId(company));
  const [{ sync_token }] = await sql`select sync_token from calendars where company = ${company}`;
  const changes: GEvent[] = [];
  let pageToken = "", nextSyncToken = "";
  do {
    const q = new URLSearchParams({ maxResults: "2500", singleEvents: "true", ...(pageToken ? { pageToken } : {}) });
    if (sync_token) q.set("syncToken", sync_token);
    else q.set("timeMin", new Date(Date.now() - 90 * 86_400_000).toISOString());
    const res = await gcal(`/calendars/${cal}/events?${q}`);
    if (res.status === 410) { // sync token expired: start over with a full pull
      await sql`update calendars set sync_token = null where company = ${company}`;
      return pull(company);
    }
    if (!res.ok) throw new Error(`Google list ${res.status}: ${await res.text()}`);
    const page = await res.json();
    changes.push(...page.items);
    pageToken = page.nextPageToken ?? "";
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  for (const g of changes) await applyChange(company, g);
  await sql`update calendars set sync_token = ${nextSyncToken} where company = ${company}`;
}

/** Applies one changed Google event from a company calendar to the DB. */
async function applyChange(company: string, g: GEvent) {
  const tag = g.extendedProperties?.private?.trngEventId;
  const [row] = (await sql`
    select * from events where id::text = ${tag ?? ""} or google -> ${company} ->> 'id' = ${g.id} limit 1`) as Event[];

  if (g.status === "cancelled") {
    if (!row) return;
    const companies = row.companies.filter((c) => c !== company);
    const google = { ...row.google }; delete google[company];
    if (companies.length) await sql`update events set companies = ${companies}, google = ${JSON.stringify(google)}::jsonb, updated_at = now() where id = ${row.id}`;
    else await sql`delete from events where id = ${row.id}`;
    return;
  }

  if (row?.google[company]?.etag === g.etag) return; // echo of our own write
  const fields = fromGoogle(g);

  if (!row) { // created directly in Google: import it and tag it
    const [created] = (await sql`
      insert into events (title, start_at, end_at, all_day, cond, loc, resrc, comments, category, companies)
      values (${fields.title}, ${fields.start_at}, ${fields.end_at}, ${fields.all_day}, ${fields.cond}, ${fields.loc},
              ${fields.resrc}, ${fields.comments}, ${fields.category}, ${[company]})
      returning *`) as Event[];
    await pushEvent({ ...created, google: { [company]: pick(g) } }, { ifMatch: false });
    return;
  }

  const [updated] = (await sql`
    update events set title = ${fields.title}, start_at = ${fields.start_at}, end_at = ${fields.end_at}, all_day = ${fields.all_day},
      cond = ${fields.cond}, loc = ${fields.loc}, resrc = ${fields.resrc}, comments = ${fields.comments}, category = ${fields.category},
      google = jsonb_set(google, ${[company]}, ${JSON.stringify(pick(g))}::jsonb), updated_at = now()
    where id = ${row.id} returning *`) as Event[];
  const siblings = updated.companies.filter((c) => c !== company);
  // ponytail: a sibling copy also edited in Google since the last pull gets overwritten here; its own
  // change then arrives on its calendar's pull and wins last. Per-field merge if that ever matters.
  if (siblings.length) await pushEvent(updated, { ifMatch: false, only: siblings });
}

/** Pulls every company calendar; returns an error message instead of throwing so pages still render. */
export async function syncAll(companies: readonly string[]): Promise<string | null> {
  try {
    for (const c of companies) await pull(c);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
