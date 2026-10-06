import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import type { Category, Event } from "@trng/shared/model";
import { addDays, sgDate, sgMidnight } from "@trng/shared/periods";
import { publicMessage, UserError } from "@trng/shared/errors";
import { calendarName } from "@trng/shared/settings";
import { sql } from "./db";
import { secret } from "./secrets";
import { getSettings } from "./settings";

const TZ = "Asia/Singapore";

/** Thrown when Google has a newer version of an event than the app (HTTP 412). */
export class ConflictError extends UserError {}

type GEvent = calendar_v3.Schema$Event;

let client: { key: string; api: calendar_v3.Calendar } | null = null;

/** Calendar client signed in as the service account key from Settings or GOOGLE_SERVICE_ACCOUNT_KEY; retries rate limits.
 * GOOGLE_API_ROOT points it at a fake Calendar server (tests); that server takes no OAuth. */
async function api(): Promise<calendar_v3.Calendar> {
  const key = await secret("GOOGLE_SERVICE_ACCOUNT_KEY");
  const root = process.env.GOOGLE_API_ROOT;
  if (!key && !root) throw new UserError("No Google service account key: set it in Settings or GOOGLE_SERVICE_ACCOUNT_KEY");
  if (client && client.key === (key ?? "")) return client.api;
  const api = calendar({
    version: "v3",
    ...(root
      ? { rootUrl: root, auth: "fake" }
      : { auth: new auth.GoogleAuth({ credentials: parseKey(key!), scopes: ["https://www.googleapis.com/auth/calendar"] }) }),
    retryConfig: {
      retry: 4, retryDelay: 500, statusCodesToRetry: [[403, 403], [429, 429]],
      httpMethodsToRetry: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
  });
  client = { key: key ?? "", api };
  return api;
}

/** Parses the service account JSON with a readable error instead of a bare JSON.parse failure. */
function parseKey(key: string) {
  try { return JSON.parse(key); } catch { throw new UserError("The Google service account key is not valid JSON — paste the whole key file"); }
}

/** HTTP status of a failed Google API call, if it got a response. */
const status = (err: unknown) => (err as { status?: number }).status;

/** True when the failed call's event or calendar is already gone (404/410). */
const gone = (err: unknown) => status(err) === 404 || status(err) === 410;

/** Calendar id for a company: cached in `calendars`, else found by name, else created and shared with the owner. */
export async function calendarId(company: string): Promise<string> {
  const [row] = await sql`select calendar_id from calendars where company = ${company}`;
  if (row) return row.calendar_id;
  const s = await getSettings();
  const name = calendarName(s, company);
  const g = await api();
  const { data: list } = await g.calendarList.list({ maxResults: 250 });
  let id = list.items?.find((c) => c.summary === name)?.id;
  if (!id) {
    id = (await g.calendars.insert({ requestBody: { summary: name, timeZone: TZ } })).data.id!;
    const owner = s.calendarOwner || process.env.GOOGLE_CALENDAR_OWNER;
    if (owner) await g.acl.insert({ calendarId: id, requestBody: { role: "owner", scope: { type: "user", value: owner } } });
  }
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

/** Google event resource for one company's copy of an app event; `categories` supplies the Google colour. */
export function toGoogle(e: Event, company: string, categories: Category[]) {
  const when = e.all_day
    ? { start: { date: sgDate(e.start_at) }, end: { date: addDays(sgDate(e.end_at), 1) } } // Google's all-day end is exclusive
    : { start: { dateTime: e.start_at, timeZone: TZ }, end: { dateTime: e.end_at, timeZone: TZ } };
  return {
    summary: e.title, location: e.loc ?? "", description: describe(e), colorId: categories.find((c) => c.name === e.category)?.googleColorId,
    extendedProperties: { private: { trngEventId: e.id, company } }, ...when,
  };
}

/** App event fields read back from a Google event (times normalised to ISO). */
export function fromGoogle(g: GEvent) {
  const allDay = !!g.start?.date;
  return {
    title: g.summary || "(untitled)", loc: g.location || null, all_day: allDay,
    start_at: allDay ? sgMidnight(g.start!.date!) : new Date(g.start!.dateTime!).toISOString(),
    end_at: allDay ? sgMidnight(addDays(g.end!.date!, -1)) : new Date(g.end!.dateTime!).toISOString(),
    ...parseDescription(g.description ?? ""),
  };
}

const pick = (g: GEvent) => ({ id: g.id!, etag: g.etag! });

/** Creates or ETag-patches one company copy; returns its new {id, etag}. Throws ConflictError on 412. */
async function pushCopy(e: Event, company: string, ifMatch = true) {
  const cal = await calendarId(company);
  const copy = e.google[company];
  const requestBody = toGoogle(e, company, (await getSettings()).categories);
  if (copy) {
    try {
      const { data } = await (await api()).events.patch(
        { calendarId: cal, eventId: copy.id, requestBody },
        { headers: ifMatch ? { "If-Match": copy.etag } : {} },
      );
      return pick(data);
    } catch (err) {
      if (status(err) === 412) throw new ConflictError(`"${e.title}" was changed in Google Calendar`);
      if (!gone(err)) throw err;
    }
  }
  return pick((await (await api()).events.insert({ calendarId: cal, requestBody })).data); // new, or copy deleted in Google
}

/** Deletes one company copy; already-gone copies are fine. */
async function deleteCopy(company: string, copy: { id: string }) {
  try {
    await (await api()).events.delete({ calendarId: await calendarId(company), eventId: copy.id });
  } catch (err) {
    if (!gone(err)) throw err;
  }
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
export async function pull(company: string): Promise<void> {
  const cal = await calendarId(company);
  const [{ sync_token }] = await sql`select sync_token from calendars where company = ${company}`;
  const { lookbackDays } = await getSettings();
  const changes: GEvent[] = [];
  let pageToken: string | undefined, nextSyncToken = "";
  do {
    try {
      const { data } = await (await api()).events.list({
        calendarId: cal, maxResults: 2500, singleEvents: true, pageToken,
        ...(sync_token ? { syncToken: sync_token } : { timeMin: new Date(Date.now() - lookbackDays * 86_400_000).toISOString() }),
      });
      changes.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? undefined;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } catch (err) {
      if (status(err) !== 410) throw err;
      await sql`update calendars set sync_token = null where company = ${company}`; // sync token expired: full pull
      return pull(company);
    }
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
export async function syncAll(): Promise<string | null> {
  try {
    for (const c of (await getSettings()).companies) await pull(c.name);
    return null;
  } catch (err) {
    return publicMessage(err);
  }
}
