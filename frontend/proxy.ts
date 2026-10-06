import { NextResponse, type NextRequest } from "next/server";
import { isSignedIn, SESSION_COOKIE } from "@/lib/session";

/** Sends any request without a valid session cookie to the login page. */
export function proxy(req: NextRequest) {
  if (isSignedIn(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

// Everything except the login page and static assets requires a signed-in user.
export const config = { matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"] };
