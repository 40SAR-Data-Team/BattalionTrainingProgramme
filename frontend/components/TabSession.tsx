"use client";
import { useEffect } from "react";
import { signOut } from "@/app/actions";

/** sessionStorage key that marks this tab as signed in through the login form. Gone when the tab closes. */
const TAB_KEY = "tab-signed-in";

/** Login form wrapper: marks this tab as signed in when the form is submitted. */
export function LoginForm({ action, className, children }: { action: (form: FormData) => Promise<void>; className: string; children: React.ReactNode }) {
  return <form action={action} onSubmit={() => sessionStorage.setItem(TAB_KEY, "1")} className={className}>{children}</form>;
}

/** Signs out a tab that never passed the login form (a new or reopened tab), so closing a tab means signing in again.
 * This is convenience, not security: the idle and absolute timeouts on the cookie are what stop a stolen cookie. */
export function TabGuard() {
  useEffect(() => {
    if (!sessionStorage.getItem(TAB_KEY)) void signOut();
  }, []);
  return null;
}
