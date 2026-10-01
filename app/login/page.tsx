import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkKey, SESSION_COOKIE, sessionValue } from "@/lib/session";

/** Sets the session cookie when the pre-shared key is right; otherwise back to the form with an error. */
async function login(form: FormData) {
  "use server";
  if (!checkKey(String(form.get("key") ?? ""))) redirect("/login?error=1");
  (await cookies()).set(SESSION_COOKIE, sessionValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86_400,
  });
  redirect("/");
}

/** Pre-shared key sign-in for clerks. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-parchment p-4">
      <form action={login} className="flex w-full max-w-xs flex-col gap-3 text-[14px]">
        <h1 className="text-[21px] font-semibold tracking-tight">40SAR Training Programme</h1>
        <input name="key" type="password" required autoFocus placeholder="Access key" aria-label="Access key"
          className="rounded-full border border-black/10 bg-white px-4 py-2" />
        {error && <p role="alert" className="text-red-600">Wrong key</p>}
        <button className="rounded-full bg-primary px-4 py-2 text-white transition active:scale-95">Sign in</button>
      </form>
    </main>
  );
}
