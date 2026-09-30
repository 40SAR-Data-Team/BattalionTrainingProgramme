/**
 * One-off: sign in as the Google account that owns the company calendars and print its refresh
 * token for the GOOGLE_REFRESH_TOKEN env var.
 *
 * Usage: add http://localhost:3999 as an authorized redirect URI on the OAuth client, then
 *   bun --env-file=.env.local scripts/get-token.ts
 */
const id = process.env.AUTH_GOOGLE_ID!;
const secret = process.env.AUTH_GOOGLE_SECRET!;
const redirect = "http://localhost:3999";

const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
consent.search = new URLSearchParams({
  client_id: id,
  redirect_uri: redirect,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/calendar",
  access_type: "offline",
  prompt: "consent",
}).toString();
console.log("Open this URL as the calendar owner:\n\n" + consent + "\n");

const server = Bun.serve({
  port: 3999,
  async fetch(req) {
    const code = new URL(req.url).searchParams.get("code");
    if (!code) return new Response("No code", { status: 400 });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
    });
    const body = await res.json();
    console.log(body.refresh_token ? `GOOGLE_REFRESH_TOKEN=${body.refresh_token}` : body);
    setTimeout(() => server.stop(), 100);
    return new Response("Done. Check the terminal.");
  },
});
