import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/** Name of the httpOnly cookie that marks a signed-in browser. */
export const SESSION_COOKIE = "session";

/** Constant-time string comparison. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cookie value for a signed-in browser, derived from ACCESS_KEY so rotating the key signs everyone out. */
export function sessionValue(): string {
  return createHmac("sha256", process.env.ACCESS_KEY!).update("trngprgm-session").digest("hex");
}

/** True if the submitted key matches ACCESS_KEY. */
export function checkKey(key: string): boolean {
  return !!process.env.ACCESS_KEY && same(key, process.env.ACCESS_KEY);
}

/** True if the cookie value proves a prior successful sign-in. */
export function isSignedIn(value: string | undefined): boolean {
  return !!value && !!process.env.ACCESS_KEY && same(value, sessionValue());
}

/** Throws unless the request carries a valid session cookie (server actions and routes are public endpoints). */
export async function requireUser(): Promise<void> {
  if (!isSignedIn((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
}
