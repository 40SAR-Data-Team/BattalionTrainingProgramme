import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("two activities booked into the same place at the same time show in the Conflict Checker", async ({ page }) => {
  await signIn(page);
  const tuesday = await page.locator("[data-day]").nth(1).getAttribute("data-day"); // FIELD CAMP DAY 1, 0800-1750 at PULAU TEKONG
  const clash = page.locator('[data-clash="FIELD CAMP DAY 1 x CLASH CHECK"]');
  await page.getByRole("link", { name: "Conflict Checker" }).click();
  await expect(page.getByRole("heading", { name: "Conflict Checker" })).toBeVisible({ timeout: 30_000 });
  await expect(clash).toHaveCount(0);

  await page.getByRole("link", { name: "Training Programme", exact: true }).click();
  await page.getByRole("button", { name: "New activity" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit activity" });
  await dialog.getByLabel("Title").fill("CLASH CHECK");
  await dialog.getByLabel("Date", { exact: true }).fill(tuesday!);
  await dialog.getByLabel("From period").selectOption("6"); // 1300
  await dialog.getByLabel("To period").selectOption("7");
  await dialog.getByLabel("Location (LOC)").fill("pulau  tekong "); // matched ignoring case and spaces
  await dialog.getByLabel("Archer").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await page.getByRole("link", { name: "Conflict Checker" }).click();
  await expect(clash).toBeVisible();
});
