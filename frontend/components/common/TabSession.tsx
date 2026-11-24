"use client";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { signOut } from "@/app/actions";
import { Spinner } from "@/components/common/Progress";

/** sessionStorage key that marks this tab as signed in through the login form. Gone when the tab closes. */
const TAB_KEY = "tab-signed-in";

/** Login form wrapper: marks this tab as signed in when the form is submitted. */
export function LoginForm({ action, className, children }: { action: (form: FormData) => Promise<void>; className: string; children: React.ReactNode }) {
  return <form action={action} onSubmit={() => sessionStorage.setItem(TAB_KEY, "1")} className={className}>{children}</form>;
}

/** Login submit button; shows a spinner while the sign-in runs. */
export function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-[17px] font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-70">
      {pending ? <><Spinner /> Signing in…</> : "Sign in"}
    </button>
  );
}

/** Signs out a tab that never passed the login form (a new or reopened tab), so closing a tab means signing in again.
 * This is convenience, not security: the idle and absolute timeouts on the cookie are what stop a stolen cookie. */
export function TabGuard() {
  useEffect(() => {
    if (!sessionStorage.getItem(TAB_KEY)) void signOut();
  }, []);
  return null;
}
