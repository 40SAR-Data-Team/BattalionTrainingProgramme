import { expect, type Page } from "@playwright/test";

/** Signs in with the e2e access key and waits for the programme page. */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Access key").fill("e2e-access-key");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "All companies" })).toBeVisible();
}

/** A timetable card by activity title. */
export const card = (page: Page, title: string) => page.locator(`button[data-event="${title}"]`);

/** A tiny valid PNG, standing in for a photo of the paper programme (the fake AI ignores its content). */
export const PHOTO = {
  name: "archer-week.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
};
