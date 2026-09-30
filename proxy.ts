export { auth as proxy } from "@/auth";

// Everything except the auth routes and static assets requires a signed-in, allow-listed user.
export const config = { matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"] };
