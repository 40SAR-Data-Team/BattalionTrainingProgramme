import { expect, test } from "@playwright/test";
import { card, PHOTO, signIn } from "./helpers";

test("a clerk uploads a photo, reviews the draft, fixes a block and adds it to the calendar", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle"); // let the page hydrate before choosing a file
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await page.getByLabel(/within security classification requirements/).check();
  await page.locator('input[type="file"]').setInputFiles(PHOTO);

  await expect(page.getByText("Read archer-week.png: Archer: 3 blocks")).toBeVisible();
  await expect(page.getByText(/1 blocks have an orange outline/)).toBeVisible();
  await expect(card(page, "UPLOADED PT")).toBeVisible();

  await card(page, "UPLOADED MAP READING").click();
  const dialog = page.getByRole("dialog", { name: "Edit activity" });
  await dialog.getByLabel("Comments").fill("Checked against the paper copy");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/orange outline/)).toHaveCount(0);

  await page.getByRole("button", { name: "New activity" }).click(); // something the photo missed
  await dialog.getByLabel("Title").fill("UPLOADED FIELD CRAFT");
  await dialog.getByRole("checkbox", { name: "Archer" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(card(page, "UPLOADED FIELD CRAFT")).toBeVisible();

  await page.getByRole("button", { name: "Add 4 activities to Google Calendar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, "UPLOADED PT")).toBeVisible();
  await expect(card(page, "UPLOADED ADMIN DAY")).toBeVisible();
  await expect(card(page, "UPLOADED FIELD CRAFT")).toBeVisible();
});
