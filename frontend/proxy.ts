import { NextResponse, type NextRequest } from "next/server";
import { cookieOpts, isSignedIn, renew, SESSION_COOKIE } from "@trng/backend/common/session";

/**
 * Content-Security-Policy for one response. Scripts run only with this request's nonce (Next adds it to its own
 * scripts), so injected markup can't execute. Inline style attributes stay allowed: React `style={…}` needs them.
 *
 * Args:
 *   nonce: Fresh random value for this request.
 */
function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development"; // React dev tooling needs eval and plain-http localhost
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Sends any request without a valid session cookie to the login page, renews the cookie's idle window, and sets a
 * per-request CSP on every page. Server actions renew it themselves (requireUser), so the sign-out action's cookie
 * delete can't be overwritten by a renewal set here. */
export async function proxy(req: NextRequest) {
  const isLogin = req.nextUrl.pathname === "/login";
  if (!isLogin && !(await isSignedIn(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const policy = csp(Buffer.from(crypto.randomUUID()).toString("base64"));
  const headers = new Headers(req.headers);
  headers.set("content-security-policy", policy); // Next reads the nonce from the request header
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", policy);
  if (!isLogin && !req.headers.has("next-action")) {
    const fresh = await renew(req.cookies.get(SESSION_COOKIE)?.value);
    if (fresh) res.cookies.set(SESSION_COOKIE, fresh, cookieOpts("lax"));
  }
  return res;
}

// Everything except static assets and Vercel Analytics / Speed Insights (/_vercel/*). The login page passes through
// without a session but still gets the CSP.
export const config = { matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico).*)"] };
