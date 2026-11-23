import { expect, test } from "@playwright/test";
import { card, signIn } from "./helpers";

test("two activities booked into the same place at the same time show in the Conflict Checker", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Conflict Checker" }).click();
  await expect(page.locator('[data-clash="FIELD CAMP DAY 1 x IPPT"]')).toHaveCount(0);

  await page.getByRole("link", { name: "Training Programme", exact: true }).click();
  await card(page, "IPPT").click(); // Tuesday 1300, during FIELD CAMP DAY 1 at PULAU TEKONG
  const dialog = page.getByRole("dialog", { name: "Edit activity" });
  await dialog.getByLabel("Location (LOC)").fill("pulau  tekong ");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Conflict Checker" }).click();
  await expect(page.locator('[data-clash="FIELD CAMP DAY 1 x IPPT"]')).toBeVisible();
});
