/**
 * Use cases, end to end through the backend with a real (in-memory) Postgres and fake Google/OpenAI.
 * Each test reads as "a clerk / an admin / someone in Google Calendar does X, and Y happens".
 */
import { describe, expect, spyOn, test } from "bun:test";
import { cal, fakes } from "./setup";
import { sql } from "@trng/backend/db";
import { commitDrafts, createEvent, deleteEvent, listEvents, readUpload, saveEvent } from "@trng/backend/events";
import { syncAll } from "@trng/backend/google";
import { secret, secretSources, setSecret } from "@trng/backend/secrets";
import { getSettings, saveSettings } from "@trng/backend/settings";
import { checkAdminKey, checkKey, issue, renew, revokeAll, SESSION_IDLE, SESSION_MAX_AGE, verify } from "@trng/backend/session";
import { GENERIC_ERROR, publicMessage, UserError } from "@trng/shared/errors";
import { blankEvent } from "@trng/shared/drafts";
import type { Event } from "@trng/shared/model";
import { moveTo, periodIndex, sgDate } from "@trng/shared/periods";

const sample = { name: "archer-week.jpg", dataUrl: "data:image/jpeg;base64,AAAA" };
/** The app's event with this title that belongs to `company`. */
const find = async (title: string, company = "Archer") =>
  (await listEvents()).find((e) => e.title === title && e.companies.includes(company))!;

describe("viewing the programme", () => {
  test("the seeded dummy week is listed, and the first sync creates one calendar per company", async () => {
    expect(await syncAll()).toBeNull();
    const titles = (await listEvents()).map((e) => e.title);
    expect(titles).toContain("ORIENTATION RUN");
    expect(titles).toContain("BOOK OUT");
    for (const c of ["Archer", "Braves", "Cougar", "Stallion", "Hercules"]) {
      expect(fakes.google.byName(cal(c))?.owners).toEqual(["owner@example.com"]);
    }
  });
});

describe("uploading a programme", () => {
  let drafts: Event[] = [];

  test("a photo is read into draft blocks on the period grid, with the company detected", async () => {
    const r = await readUpload(sample, "");
    drafts = r.drafts;
    expect(r.company).toBe("Archer");
    const pt = drafts.find((d) => d.title === "UPLOADED PT")!;
    expect(pt.start_at).toEndWith("T07:00:00+08:00"); // period 1 start
    expect(pt.end_at).toEndWith("T08:50:00+08:00"); // period 2 end
    expect(drafts.find((d) => d.title === "UPLOADED ADMIN DAY")!.all_day).toBe(true);
    expect(drafts.find((d) => d.title === "UPLOADED MAP READING")!.comments).toStartWith("UNCERTAIN");
  });

  test("the clerk can override the detected company", async () => {
    expect((await readUpload(sample, "Braves")).company).toBe("Braves");
  });

  test("an unreadable company heading asks the clerk to pick one", async () => {
    fakes.openai.next = () => ({ company: "Unknown", blocks: [] });
    await expect(readUpload(sample, "")).rejects.toThrow("pick one");
    fakes.openai.next = (await import("../fakes/openai")).sampleExtraction;
  });

  test("committing adds every block to the company's Google Calendar", async () => {
    expect(await commitDrafts(drafts)).toEqual({ created: 3, skipped: 0 });
    const inGoogle = fakes.google.eventsIn(cal("Archer")).map((e) => e.summary);
    expect(inGoogle).toEqual(expect.arrayContaining(["UPLOADED PT", "UPLOADED MAP READING", "UPLOADED ADMIN DAY"]));
  });

  test("uploading the same week again creates no duplicates", async () => {
    const again = (await readUpload(sample, "")).drafts;
    expect(await commitDrafts(again)).toEqual({ created: 0, skipped: 3 });
    expect(fakes.google.eventsIn(cal("Archer")).filter((e) => e.summary === "UPLOADED PT")).toHaveLength(1);
  });

  test("the same activity uploaded for another company reaches that company's calendar too", async () => {
    const braves = (await readUpload(sample, "Braves")).drafts;
    expect((await commitDrafts(braves)).created).toBe(3);
    expect(fakes.google.eventsIn(cal("Braves")).map((e) => e.summary)).toContain("UPLOADED PT");
  });

  test("a draft with no title is refused", async () => {
    await expect(commitDrafts([{ ...drafts[0], title: " " }])).rejects.toThrow("Title is required");
  });
});

describe("keeping the app and Google Calendar in step", () => {
  test("an edit in the app reaches every company's Google Calendar", async () => {
    const e = await find("ROUTE MARCH"); // seeded for all five companies, not yet in Google
    await saveEvent({ ...e, loc: "CAMP PERIMETER" });
    for (const c of ["Archer", "Braves", "Cougar", "Stallion", "Hercules"]) {
      expect(fakes.google.eventsIn(cal(c)).find((x) => x.summary === "ROUTE MARCH")?.location).toBe("CAMP PERIMETER");
    }
  });

  test("an edit made in one company's Google Calendar shows in the app and reaches the other companies", async () => {
    const e = await find("ROUTE MARCH");
    fakes.google.editInGoogle(cal("Archer"), e.google.Archer.id, { location: "STADIUM" });
    await syncAll();
    expect((await find("ROUTE MARCH")).loc).toBe("STADIUM");
    expect(fakes.google.eventsIn(cal("Hercules")).find((x) => x.summary === "ROUTE MARCH")?.location).toBe("STADIUM");
  });

  test("when both sides change the same event, Google wins and the clerk is told", async () => {
    const stale = await find("UPLOADED PT");
    fakes.google.editInGoogle(cal("Archer"), stale.google.Archer.id, { summary: "PT (MOVED BY OPS)" });
    await expect(saveEvent({ ...stale, title: "PT FROM APP" })).rejects.toThrow("changed in Google Calendar");
    const titles = (await listEvents()).map((e) => e.title);
    expect(titles).toContain("PT (MOVED BY OPS)");
    expect(titles).not.toContain("PT FROM APP");
  });

  test("an activity added by hand reaches each ticked company's calendar, and adding it twice is refused", async () => {
    const { periods } = await getSettings();
    const e = { ...blankEvent(periods, sgDate(new Date()), ["Archer", "Cougar"]), title: "ADDED BY HAND" };
    await createEvent(e);
    for (const c of ["Archer", "Cougar"]) expect(fakes.google.eventsIn(cal(c)).map((x) => x.summary)).toContain("ADDED BY HAND");
    await expect(createEvent({ ...e, id: crypto.randomUUID() })).rejects.toThrow("already on the calendar");
  });

  test("an activity with no company is refused", async () => {
    const { periods } = await getSettings();
    await expect(createEvent({ ...blankEvent(periods, sgDate(new Date()), []), title: "NOBODY" })).rejects.toThrow("company");
  });

  test("an event created directly in Google Calendar is imported", async () => {
    fakes.google.createInGoogle(cal("Cougar"), {
      summary: "ADDED IN GOOGLE",
      start: { dateTime: new Date().toISOString() }, end: { dateTime: new Date(Date.now() + 3_000_000).toISOString() },
    });
    await syncAll();
    expect((await find("ADDED IN GOOGLE", "Cougar")).companies).toEqual(["Cougar"]);
  });

  test("an event deleted from one company's Google Calendar stays for the other companies", async () => {
    const e = await find("ROUTE MARCH");
    fakes.google.deleteInGoogle(cal("Archer"), e.google.Archer.id);
    await syncAll();
    expect((await find("ROUTE MARCH", "Braves")).companies).toEqual(["Braves", "Cougar", "Stallion", "Hercules"]);
  });

  test("deleting in the app removes the event from every calendar", async () => {
    const e = await find("ROUTE MARCH", "Braves");
    await deleteEvent(e.id);
    expect((await listEvents()).map((x) => x.title)).not.toContain("ROUTE MARCH");
    for (const c of ["Braves", "Cougar", "Stallion", "Hercules"]) {
      expect(fakes.google.eventsIn(cal(c)).map((x) => x.summary)).not.toContain("ROUTE MARCH");
    }
  });

  test("dragging an event to another period pushes the new time to every company's calendar", async () => {
    const e = await find("ORIENTATION RUN");
    const { periods } = await getSettings();
    const moved = moveTo(periods, e, sgDate(e.start_at), periodIndex(periods, "3"));
    await saveEvent(moved);
    for (const c of ["Archer", "Braves"]) {
      const g = fakes.google.eventsIn(cal(c)).find((x) => x.summary === "ORIENTATION RUN") as unknown as { start: { dateTime: string } };
      expect(new Date(g.start.dateTime).getTime()).toBe(new Date(moved.start_at).getTime());
    }
  });
});

describe("changing settings", () => {
  test("adding a company gives it a calendar on the next sync", async () => {
    const s = await getSettings();
    await saveSettings({ ...s, companies: [...s.companies, { name: "Scorpion", color: "#c4b5fd" }] });
    await syncAll();
    expect(fakes.google.byName(cal("Scorpion"))).toBeDefined();
  });

  test("renaming the calendar template names new calendars accordingly", async () => {
    const s = await getSettings();
    await saveSettings({ ...s, calendarName: "{unit} {company} Programme", companies: [...s.companies, { name: "Viper", color: "#a7f3d0" }] });
    await syncAll();
    expect(fakes.google.byName("40SAR Viper Programme")).toBeDefined();
  });

  test("an invalid change is refused and nothing is stored", async () => {
    const before = await getSettings();
    await expect(saveSettings({ ...before, periods: [] })).rejects.toThrow("Add at least one period key");
    expect((await getSettings()).periods).toEqual(before.periods);
  });

  test("only the right admin key unlocks editing", () => {
    expect(checkAdminKey("test-admin-key")).toBe(true);
    expect(checkAdminKey("guess")).toBe(false);
  });

  test("a new access key set in Settings replaces the old one", async () => {
    expect(await checkKey("test-access-key")).toBe(true);
    await setSecret("ACCESS_KEY", "new-access-key");
    expect(await checkKey("new-access-key")).toBe(true);
    expect(await checkKey("test-access-key")).toBe(false);
    await setSecret("ACCESS_KEY", "");
    expect(await checkKey("test-access-key")).toBe(true);
  });

  test("saved keys are stored encrypted and only their source is ever shown", async () => {
    await setSecret("OPENAI_API_KEY", "sk-from-settings");
    expect(await secret("OPENAI_API_KEY")).toBe("sk-from-settings");
    expect((await secretSources()).OPENAI_API_KEY).toBe("settings");
    const [row] = await sql`select value from secrets where name = 'OPENAI_API_KEY'`;
    expect(row.value).not.toContain("sk-from-settings");
  });
});

describe("staying secure", () => {
  test("a sign-in cookie only works while genuine, unexpired and of the right kind", async () => {
    const good = (await issue("session", 3600))!;
    expect(await verify("session", good)).toBe(true);
    expect(await verify("admin", good)).toBe(false); // a session cookie never unlocks settings
    expect(await verify("session", good.replace(/\.\d+\./, ".9999999999999."))).toBe(false); // forged expiry
    expect(await verify("session", (await issue("session", 0))!)).toBe(false); // expired
    expect(await verify("session", "session")).toBe(false);
  });

  test("a session goes void after 15 idle minutes, renewing slides it, and 3 hours is the hard cap", async () => {
    const t0 = Date.now(), at = (ms: number) => spyOn(Date, "now").mockReturnValue(t0 + ms);
    try {
      const first = (await issue("session", SESSION_MAX_AGE))!;
      at((SESSION_IDLE - 60) * 1000);
      const second = (await renew(first))!;
      expect(await verify("session", second)).toBe(true);
      at((2 * SESSION_IDLE - 120) * 1000); // 29 min in: idle 14 min since the renewal, but 29 min since the first cookie
      expect(await verify("session", first)).toBe(false);
      expect(await verify("session", second)).toBe(true);
      at((SESSION_IDLE - 60 + SESSION_IDLE + 60) * 1000);
      expect(await verify("session", second)).toBe(false); // idle > 15 min
      expect(await renew(second)).toBeUndefined();
      let cookie = first;
      for (let ms = 0; ms < SESSION_MAX_AGE * 1000; ms += 600_000) { // active every 10 min, never idle
        at(ms);
        cookie = (await renew(cookie))!;
      }
      at(SESSION_MAX_AGE * 1000 + 1);
      expect(await verify("session", cookie)).toBe(false); // the cap holds however active the user is
    } finally {
      spyOn(Date, "now").mockRestore();
    }
  });

  test("changing the access key signs everyone out", async () => {
    const old = (await issue("session", 3600))!;
    await setSecret("ACCESS_KEY", "rotated-access-key");
    expect(await verify("session", old)).toBe(false);
    await setSecret("ACCESS_KEY", "");
    expect(await verify("session", old)).toBe(true);
  });

  test("an admin signs everyone out: every earlier cookie stops working, new sign-ins work", async () => {
    const session = (await issue("session", 3600))!, admin = (await issue("admin", 3600))!;
    await Bun.sleep(2);
    await revokeAll();
    expect(await verify("session", session)).toBe(false);
    expect(await verify("admin", admin)).toBe(false);
    await Bun.sleep(2);
    expect(await verify("session", (await issue("session", 3600))!)).toBe(true);
  });

  test("only messages written for users reach the browser; internal errors are replaced", () => {
    expect(publicMessage(new UserError("Title is required"))).toBe("Title is required");
    const log = console.error;
    console.error = () => {};
    try { expect(publicMessage(new Error('relation "events" does not exist'))).toBe(GENERIC_ERROR); } finally { console.error = log; }
  });

  test("the database itself refuses impossible activities", async () => {
    const bad = async (end: string, companies: string[], title = "X") =>
      await sql`insert into events (title, start_at, end_at, companies) values (${title}, '2026-10-05T10:00:00+08:00', ${end}, ${companies})`;
    await expect(bad("2026-10-05T09:00:00+08:00", ["Archer"])).rejects.toThrow("events_times");
    await expect(bad("2026-10-05T11:00:00+08:00", [])).rejects.toThrow("events_companies");
    await expect(bad("2026-10-05T11:00:00+08:00", ["Archer"], "x".repeat(501))).rejects.toThrow("events_text_sizes");
  });

  test("an over-long activity is refused with a readable reason before it reaches the database", async () => {
    const e = { ...blankEvent((await getSettings()).periods, sgDate(new Date()), ["Archer"]), title: "LONG", comments: "x".repeat(20_001) };
    await expect(createEvent(e)).rejects.toThrow("Text is too long");
  });

  test("the app's database role can read and write rows but not change the schema", async () => {
    const db = fakes.neon.db;
    await db.exec("create role trngprgm_app");
    await db.exec(await Bun.file(`${import.meta.dir}/../../database/schema.sql`).text()); // re-run migration: grants apply
    await db.exec("set role trngprgm_app");
    try {
      expect((await db.query("select count(*) from events")).rows.length).toBe(1);
      await expect(db.exec("create table stolen (x int)")).rejects.toThrow("permission denied");
      await expect(db.exec("drop table events")).rejects.toThrow("must be owner");
    } finally {
      await db.exec("reset role");
    }
  });
});
