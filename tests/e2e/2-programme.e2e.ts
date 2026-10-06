import { expect, test } from "@playwright/test";
import { card, signIn } from "./helpers";

test.beforeEach(async ({ page }) => signIn(page));

test("this week's programme shows on the timetable and in the company lists", async ({ page }) => {
  for (const title of ["ORIENTATION RUN", "LIVE FIRING RANGE", "NIGHT NAVIGATION", "BOOK OUT"]) {
    await expect(card(page, title).first()).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
});

test("a company tab shows only that company's activities", async ({ page }) => {
  await page.getByRole("group", { name: "Company" }).getByRole("button", { name: "Braves" }).click();
  await expect(page.getByRole("heading", { name: "Braves", exact: true })).toBeVisible();
  await expect(card(page, "FIELD CAMP DAY 1")).toBeVisible();
  await expect(card(page, "UIP LESSONS")).toHaveCount(0);
});

test("search narrows the programme, and a bad query explains what's wrong", async ({ page }) => {
  const search = page.getByLabel("Search activities");
  await search.fill('cat:"live firing" OR loc:mandai');
  await expect(card(page, "LIVE FIRING RANGE")).toBeVisible();
  await expect(card(page, "NIGHT NAVIGATION")).toBeVisible();
  await expect(card(page, "ORIENTATION RUN")).toHaveCount(0);
  await search.fill("(range");
  await expect(page.getByText('Missing ")"')).toBeVisible();
});

test("the upcoming view lists activities as a table", async ({ page }) => {
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Upcoming" }).click();
  await expect(page.getByRole("table")).toBeVisible();
});

test("editing an activity saves it, and the change is still there after a reload", async ({ page }) => {
  await card(page, "IPPT").click();
  const dialog = page.getByRole("dialog", { name: "Edit activity" });
  await dialog.getByLabel("Location (LOC)").fill("SAFTI STADIUM");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(card(page, "IPPT")).toContainText("SAFTI STADIUM");
});

test("a new activity added by hand appears on the timetable and is still there after a reload", async ({ page }) => {
  await page.getByRole("group", { name: "Company" }).getByRole("button", { name: "Cougar" }).click();
  await page.getByRole("button", { name: "New activity" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit activity" });
  await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await dialog.getByLabel("Title").fill("WEAPON HANDLING");
  await dialog.getByLabel("From period").selectOption({ index: 6 }); // keep the early periods free for the drag test
  await dialog.getByLabel("To period").selectOption({ index: 6 });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(card(page, "WEAPON HANDLING")).toBeVisible();
});

test("dragging an activity to another period moves it", async ({ page }) => {
  const run = card(page, "IPPT");
  const before = await run.boundingBox();
  const row = page.locator(`[data-day]`).filter({ has: run });
  await run.dragTo(row, { targetPosition: { x: 120, y: 20 } }); // the early-morning columns
  await page.reload();
  const after = await card(page, "IPPT").boundingBox();
  expect(after!.x).toBeLessThan(before!.x);
});
