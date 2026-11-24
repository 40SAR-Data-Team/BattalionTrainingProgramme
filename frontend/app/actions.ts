"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_COOKIE } from "@trng/backend/common/session";

/** Signs this browser out (session and admin unlock) and goes to the sign-in page. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ADMIN_COOKIE);
  redirect("/login");
}
