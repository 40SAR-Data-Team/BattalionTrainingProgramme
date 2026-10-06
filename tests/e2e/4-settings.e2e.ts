import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("a clerk can read settings but not change them without the admin key", async ({ page }) => {
  await expect(page.getByLabel("Unit name")).toHaveValue("40SAR");
  await expect(page.getByLabel("Unit name")).toBeDisabled();
  await page.getByLabel("Admin key").fill("guess");
  await page.getByRole("button", { name: "Unlock editing" }).click();
  await expect(page.getByText("That admin key is not right")).toBeVisible();
  await expect(page.getByLabel("Unit name")).toBeDisabled();
});

test("an admin renames the unit, adds a company, and the programme page follows", async ({ page }) => {
  await page.getByLabel("Admin key").fill("e2e-admin-key");
  await page.getByRole("button", { name: "Unlock editing" }).click();
  await expect(page.getByLabel("Unit name")).toBeEnabled();

  await page.getByLabel("Unit name").fill("41SAR");
  const companies = page.locator("section").filter({ has: page.getByRole("heading", { name: "Companies" }) });
  await companies.getByRole("button", { name: "Add" }).click();
  await companies.getByLabel("Company name").last().fill("Scorpion");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.getByRole("link", { name: "Programme", exact: true }).click();
  await expect(page.getByRole("navigation")).toContainText("41SAR");
  await expect(page.getByRole("group", { name: "Company" }).getByRole("button", { name: "Scorpion" })).toBeVisible();
});

test("an invalid period grid is refused with a reason", async ({ page }) => {
  await page.getByLabel("Admin key").fill("e2e-admin-key");
  await page.getByRole("button", { name: "Unlock editing" }).click();
  await page.getByLabel("Period 1 start").fill("05:00");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Period 1 overlaps the one before it")).toBeVisible();
});

test("keys are write-only: the page shows where a key comes from, never its value", async ({ page }) => {
  await expect(page.getByText("From server environment").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("e2e-access-key");
  await expect(page.locator("body")).not.toContainText("sk-fake");
});
