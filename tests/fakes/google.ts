/**
 * In-memory fake of the Google Calendar v3 endpoints the app uses: calendarList, calendars.insert, acl.insert,
 * events list (with syncToken), insert, patch (If-Match → 412) and delete. Point the app at it with GOOGLE_API_ROOT.
 */

type GEvent = Record<string, unknown> & {
  id: string; etag: string; status: string; seq: number; extendedProperties?: { private?: Record<string, string> };
};
type Calendar = { id: string; summary: string; owners: string[]; events: Map<string, GEvent> };

export class FakeGoogle {
  calendars = new Map<string, Calendar>();
  private seq = 0;
  private ids = 0;

  /** Records a change: bumps the global sequence and gives the event a new etag. */
  private touch(e: Partial<GEvent>): GEvent {
    e.seq = ++this.seq;
    e.etag = `"${e.seq}"`;
    return e as GEvent;
  }

  /** Calendar with this name, or undefined. */
  byName(summary: string): Calendar | undefined {
    return [...this.calendars.values()].find((c) => c.summary === summary);
  }

  /** Live (not cancelled) events in the named calendar. */
  eventsIn(summary: string): GEvent[] {
    return [...(this.byName(summary)?.events.values() ?? [])].filter((e) => e.status !== "cancelled");
  }

  /** Simulates someone editing an event directly in Google Calendar. */
  editInGoogle(summary: string, id: string, patch: Record<string, unknown>) {
    const e = this.byName(summary)!.events.get(id)!;
    Object.assign(e, patch);
    this.touch(e);
  }

  /** Simulates someone creating an event directly in Google Calendar. */
  createInGoogle(summary: string, body: Record<string, unknown>): GEvent {
    const cal = this.byName(summary)!;
    const e = this.touch({ ...body, id: `g${++this.ids}`, status: "confirmed" });
    cal.events.set(e.id, e);
    return e;
  }

  /** Simulates someone deleting an event directly in Google Calendar. */
  deleteInGoogle(summary: string, id: string) {
    const e = this.byName(summary)!.events.get(id)!;
    e.status = "cancelled";
    this.touch(e);
  }

  /** Handles one HTTP request from the googleapis client. */
  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/calendar\/v3\//, "").split("/").map(decodeURIComponent);
    const body = req.method === "POST" || req.method === "PATCH" ? await req.json() : null;
    const json = (data: unknown, status = 200) => Response.json(data, { status });
    const strip = ({ seq, ...e }: GEvent) => (void seq, e);

    if (parts[0] === "users" && parts[2] === "calendarList") {
      return json({ items: [...this.calendars.values()].map((c) => ({ id: c.id, summary: c.summary })) });
    }
    if (parts[0] !== "calendars") return json({ error: "not found" }, 404);
    if (parts.length === 1 && req.method === "POST") {
      const id = `cal${this.calendars.size + 1}@fake`;
      this.calendars.set(id, { id, summary: body.summary, owners: [], events: new Map() });
      return json({ id, summary: body.summary });
    }
    const cal = this.calendars.get(parts[1]);
    if (!cal) return json({ error: "calendar not found" }, 404);
    if (parts[2] === "acl") { cal.owners.push(body.scope.value); return json(body); }
    if (parts[2] !== "events") return json({ error: "not found" }, 404);

    const id = parts[3];
    if (!id && req.method === "GET") {
      const token = url.searchParams.get("syncToken");
      const props = url.searchParams.getAll("privateExtendedProperty").map((p) => p.split("="));
      const items = [...cal.events.values()]
        .filter((e) => (token ? e.seq > Number(token) : e.status !== "cancelled"))
        .filter((e) => props.every(([k, v]) => e.extendedProperties?.private?.[k] === v));
      return json({ items: items.map(strip), nextSyncToken: String(this.seq) });
    }
    if (!id && req.method === "POST") {
      const e = this.touch({ ...body, id: `g${++this.ids}`, status: "confirmed" });
      cal.events.set(e.id, e);
      return json(strip(e));
    }
    const e = cal.events.get(id);
    if (!e || e.status === "cancelled") return json({ error: "gone" }, 410);
    if (req.method === "PATCH") {
      const ifMatch = req.headers.get("if-match");
      if (ifMatch && ifMatch !== e.etag) return json({ error: "precondition failed" }, 412);
      Object.assign(e, body);
      return json(strip(this.touch(e)));
    }
    if (req.method === "DELETE") { e.status = "cancelled"; this.touch(e); return new Response(null, { status: 204 }); }
    return json({ error: "not found" }, 404);
  }
}
