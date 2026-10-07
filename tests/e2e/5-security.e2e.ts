import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Use case: the programme is restricted information. The browser must refuse injected script and framing, and
// only a genuine, current sign-in may see a page. Runs last: "sign everyone out" voids every earlier cookie.

/** Collects Content-Security-Policy violations the page reports. */
function violations(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) seen.push(m.text()); });
  return seen;
}

test("every page is served with a per-request script nonce and the browser hardening headers", async ({ page }) => {
  const seen = violations(page);
  await signIn(page);
  for (const path of ["/", "/upload", "/settings"]) {
    const res = (await page.goto(path))!;
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["x-powered-by"]).toBeUndefined();
  }
  const a = (await page.goto("/"))!.headers()["content-security-policy"];
  const b = (await page.goto("/"))!.headers()["content-security-policy"];
  expect(a).not.toBe(b); // a fresh nonce every time
  await expect(page.getByRole("heading", { name: "All companies" })).toBeVisible(); // the app still runs under the CSP
  expect(seen).toEqual([]);
});

test("script injected into the page is blocked by the browser", async ({ page }) => {
  const seen = violations(page);
  await signIn(page);
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = `<img src="x" onerror="window.__pwned = true">`;
    document.body.append(div);
  });
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as { __pwned?: boolean }).__pwned)).toBeUndefined();
});

test("a forged or missing sign-in gets nothing: pages and the upload API send it to sign in", async ({ page, context, request }) => {
  await context.addCookies([{ name: "session", value: "session.0.9999999999999.abc.forged", url: "http://localhost:3100" }]);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  const api = await request.post("/api/extract", { data: { name: "x.png", dataUrl: "data:image/png;base64,AAAA" }, maxRedirects: 0 });
  expect(api.status()).toBe(307);
  expect(api.headers()["location"]).toContain("/login");
});

test("sign-in cookies are httpOnly, expire on schedule, and Sign out ends the session", async ({ page, context }) => {
  await signIn(page);
  const session = (await context.cookies()).find((c) => c.name === "session")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  expect(session.expires).toBe(-1); // browser-session cookie: gone when the browser closes (server expiry is 12 h)

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((c) => c.name === "session")).toBeUndefined();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("a tab opened without passing the sign-in form (a closed tab reopened) must sign in again", async ({ page, context }) => {
  await signIn(page);
  const reopened = await context.newPage(); // same cookie jar, empty sessionStorage
  await reopened.goto("/");
  await expect(reopened).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((c) => c.name === "session")).toBeUndefined();
});

test("the admin unlock is a strict, one-hour cookie", async ({ page, context }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.getByLabel("Admin key").fill("e2e-admin-key");
  await page.getByRole("button", { name: "Unlock editing" }).click();
  await expect(page.getByLabel("Unit name")).toBeEnabled();
  const admin = (await context.cookies()).find((c) => c.name === "admin")!;
  expect(admin.httpOnly).toBe(true);
  expect(admin.sameSite).toBe("Strict");
  expect(admin.expires * 1000 - Date.now()).toBeLessThanOrEqual(3_600_000);
});

test("an admin signs everyone out: every browser, theirs included, must sign in again", async ({ browser }) => {
  const clerk = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await signIn(clerk);
  await signIn(admin);
  const stolen = (await clerk.context().cookies()).find((c) => c.name === "session")!;

  await admin.goto("/settings");
  await admin.getByLabel("Admin key").fill("e2e-admin-key");
  await admin.getByRole("button", { name: "Unlock editing" }).click();
  await expect(admin.getByLabel("Unit name")).toBeEnabled();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Sign everyone out" }).click();
  await expect(admin).toHaveURL(/\/login$/);

  await clerk.reload();
  await expect(clerk).toHaveURL(/\/login$/);
  const thief = await (await browser.newContext()).newPage(); // a copied cookie is void too
  await thief.context().addCookies([stolen]);
  await thief.goto("/");
  await expect(thief).toHaveURL(/\/login$/);

  await signIn(clerk); // signing in again works
});
