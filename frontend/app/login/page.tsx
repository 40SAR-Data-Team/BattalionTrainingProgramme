import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "@trng/backend/settings";
import { checkKey, cookieOpts, issue, SESSION_COOKIE, SESSION_MAX_AGE } from "@trng/backend/session";
import { LoginForm } from "@/components/TabSession";
import { UnitMark } from "@/components/UnitMark";

/** Sets the session cookie when the access key is right; otherwise back to the form with an error. */
async function login(form: FormData) {
  "use server";
  if (!(await checkKey(String(form.get("key") ?? "")))) redirect("/login?error=1");
  (await cookies()).set(SESSION_COOKIE, (await issue("session", SESSION_MAX_AGE))!, cookieOpts("lax"));
  redirect("/");
}

/** Access-key sign-in: a centred panel on the unit's striped flag. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const { unitName } = await getSettings();
  return (
    <main className="grid min-h-screen flex-1 place-items-center px-4 py-14">
      <div className="w-full max-w-xl text-center">
        <UnitMark name={unitName} className="mx-auto mb-8 size-24 text-[28px]" />
        <h1 className="font-display text-[44px] leading-[1.05] font-bold tracking-tight text-heading text-balance sm:text-[56px]">
          Good day, Commander
        </h1>
        <p className="mt-3 text-[17px] text-heading/80">{unitName} training programme</p>
        <LoginForm action={login} className="mt-10 flex flex-wrap justify-center gap-3">
          <label htmlFor="key" className="sr-only">Access key</label>
          <input id="key" name="key" type="password" required autoFocus autoComplete="current-password" placeholder="Access key"
            aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined}
            className="h-12 min-w-0 flex-[1_1_18rem] rounded-full border border-heading/20 bg-white px-6 text-center text-[17px] shadow-sm" />
          <button className="h-12 rounded-full bg-primary px-8 text-[17px] font-semibold text-white transition hover:bg-primary-dark active:scale-95">
            Sign in
          </button>
        </LoginForm>
        {error && <p id="login-error" role="alert" className="mt-4 text-[15px] font-medium text-primary">That access key is not right.</p>}
        <p className="mx-auto mt-12 max-w-sm text-[13px] leading-relaxed text-heading/70">
          Ask your training clerk for the access key. It keeps this browser signed in, so don&apos;t use it on a shared computer.
        </p>
      </div>
    </main>
  );
}
