import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** Emails allowed to sign in, from the comma-separated ALLOWED_EMAILS env var. */
const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    /** Rejects any Google account not on the allow-list. */
    signIn: ({ user }) => allowed.includes(user.email?.toLowerCase() ?? ""),
    /** Lets the proxy block unauthenticated requests. */
    authorized: ({ auth }) => !!auth,
  },
});
