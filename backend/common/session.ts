import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { UserError } from "@trng/shared/common/errors";
import { sql } from "./db";
import { secret } from "./secrets";

/** httpOnly cookie that marks a signed-in browser. */
export const SESSION_COOKIE = "session";
/** httpOnly cookie that marks a browser unlocked for editing settings. */
export const ADMIN_COOKIE = "admin";
/** How long the admin unlock lasts, in seconds. */
export const ADMIN_MAX_AGE = 60 * 60;
/** Longest a sign-in is honoured by the server, in seconds. The cookie itself ends with the browser session. */
export const SESSION_MAX_AGE = 3 * 60 * 60;
/** A session cookie unused for this long (seconds) is void. Each valid request renews it, up to SESSION_MAX_AGE. */
export const SESSION_IDLE = 15 * 60;

/** Which cookie: "session" is signed with ACCESS_KEY, "admin" with ADMIN_KEY. */
type Kind = "session" | "admin";

/** Cookie options shared by the session and admin cookies. Omit `maxAge` for a browser-session cookie. */
export const cookieOpts = (sameSite: "lax" | "strict", maxAge?: number) =>
  ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite, path: "/", maxAge });

/** Constant-time string comparison; false if either side is missing. */
function same(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Signing key for a cookie kind, so rotating ACCESS_KEY or ADMIN_KEY voids every cookie of that kind. */
const keyFor = async (kind: Kind) => (kind === "session" ? secret("ACCESS_KEY") : process.env.ADMIN_KEY);

const sign = (key: string, body: string) => createHmac("sha256", key).update(body).digest("base64url");

/** Cookies issued before this instant (epoch ms) are void. Set by revokeAll().
 * Read on every check, not cached: the proxy runs in its own module instance, and a revoke must bite at once. */
async function revokedBefore(): Promise<number> {
  const [row] = await sql`select value from settings where key = 'auth'`;
  return Number(row?.value?.revokedBefore ?? 0);
}

/** Signs `kind.issuedMs.expiresMs.seenMs.nonce` with the key for `kind`. */
function seal(key: string, kind: Kind, issued: number, expires: number, seen: number): string {
  const body = [kind, issued, expires, seen, randomBytes(16).toString("base64url")].join(".");
  return `${body}.${sign(key, body)}`;
}

/**
 * Issues a cookie value `kind.issuedMs.expiresMs.lastSeenMs.nonce.signature`. The server checks the expiry, the idle
 * time (session only) and the signature, so a copied cookie stops working when it expires, goes idle, when the key
 * changes, or after revokeAll().
 *
 * Args:
 *   kind: Which cookie.
 *   maxAge: Lifetime in seconds.
 *
 * Returns:
 *   The cookie value, or undefined while that kind's key is not configured.
 */
export async function issue(kind: Kind, maxAge: number): Promise<string | undefined> {
  const key = await keyFor(kind);
  if (!key) return undefined;
  const now = Date.now();
  return seal(key, kind, now, now + maxAge * 1000, now);
}

/**
 * True if a cookie value was issued by this server for `kind`, is unexpired, and was not revoked.
 *
 * Args:
 *   kind: Which cookie it must be.
 *   value: The cookie value from the request, if any.
 */
export async function verify(kind: Kind, value: string | undefined): Promise<boolean> {
  const key = await keyFor(kind);
  const parts = value?.split(".") ?? [];
  if (!key || parts.length !== 6) return false;
  const [k, issued, expires, seen, , sig] = parts;
  const idle = kind === "session" ? SESSION_IDLE * 1000 : Infinity;
  return same(sig, sign(key, parts.slice(0, 5).join(".")))
    && k === kind && Number(expires) > Date.now() && Number(seen) + idle > Date.now()
    && Number(issued) >= (await revokedBefore());
}

/**
 * Slides the idle window of a session cookie: the same cookie with a fresh last-seen time. The absolute expiry is kept.
 *
 * Args:
 *   value: The session cookie value from the request, if any.
 *
 * Returns:
 *   The renewed cookie value, or undefined if `value` is not a valid session.
 */
export async function renew(value: string | undefined): Promise<string | undefined> {
  const key = await keyFor("session");
  if (!key || !(await verify("session", value))) return undefined;
  const [, issued, expires] = value!.split(".");
  return seal(key, "session", Number(issued), Number(expires), Date.now());
}

/** Signs every browser out: voids all session and admin cookies issued until now. */
export async function revokeAll(): Promise<void> {
  const now = Date.now();
  await sql`insert into settings (key, value) values ('auth', ${JSON.stringify({ revokedBefore: now })}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

/** Thrown by requireUser(): the browser has no valid sign-in and should go to the sign-in page. */
export class SignedOutError extends UserError {}

/** True if the submitted key matches the access key. */
export async function checkKey(key: string): Promise<boolean> {
  return same(key, await secret("ACCESS_KEY"));
}

/** True if the cookie value proves a prior successful sign-in. */
export async function isSignedIn(value: string | undefined): Promise<boolean> {
  return verify("session", value);
}

/** Throws unless the request carries a valid session cookie (server actions and routes are public endpoints).
 * Renews the cookie's idle window, so call it only from server actions and route handlers (they may set cookies). */
export async function requireUser(): Promise<void> {
  const jar = await cookies();
  const fresh = await renew(jar.get(SESSION_COOKIE)?.value);
  if (!fresh) throw new SignedOutError("Not signed in");
  jar.set(SESSION_COOKIE, fresh, cookieOpts("lax"));
}

/** True if the submitted key matches ADMIN_KEY. */
export function checkAdminKey(key: string): boolean {
  return same(key, process.env.ADMIN_KEY);
}

/** True if this request carries a valid admin cookie. */
export async function isAdmin(): Promise<boolean> {
  return verify("admin", (await cookies()).get(ADMIN_COOKIE)?.value);
}

/** Throws unless the request is signed in and unlocked with the admin key. */
export async function requireAdmin(): Promise<void> {
  await requireUser();
  if (!(await isAdmin())) throw new UserError("Unlock settings with the admin key first");
}
