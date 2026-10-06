import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a visitor without the key is sent to the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Good day, Commander" })).toBeVisible();
});

test("the public sign-in page reveals no unit settings", async ({ request }) => {
  const html = await (await request.get("/login")).text();
  for (const leak of ["calendarOwner", "companies", "Hercules", "Live Firing"]) expect(html).not.toContain(leak);
});

test("a wrong access key is refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Access key").fill("not-the-key");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That access key is not right.")).toBeVisible();
});

test("the right access key opens the programme and stays signed in", async ({ page }) => {
  await signIn(page);
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Upload a programme" })).toBeVisible();
});
