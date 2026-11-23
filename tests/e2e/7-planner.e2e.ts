import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { card, signIn } from "./helpers";

test("a planner adds trainings, optimises them into the window, sees a clash explained, and exports", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Training Planner" }).click();
  await expect(page.getByRole("heading", { name: "Training Planner" })).toBeVisible({ timeout: 60_000 }); // first dev compile loads the solver

  const dialog = page.getByRole("dialog", { name: "Edit training" });
  for (const [id, rules] of [["IMT", ""], ["VOC1", "after:IMT+1d"]]) {
    await page.getByRole("button", { name: "New training" }).click();
    await dialog.getByLabel("Training id").fill(id);
    await dialog.getByLabel("Location (LOC)").fill("RANGE_1");
    await dialog.getByLabel("Rules").fill(rules);
    await dialog.getByRole("button", { name: "Save" }).click();
  }
  await expect(page.getByRole("region", { name: "Unplaced trainings" })).toContainText("Unplaced (2)");

  // Window = the Mon-Fri on screen, so the placed cards are visible.
  const from = await page.getByLabel("From").inputValue();
  const friday = new Date(Date.parse(from) + 4 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("To", { exact: true }).fill(friday);
  await page.getByRole("button", { name: "Optimise", exact: true }).click();
  await expect(page.getByText("Placed 2 trainings.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Unplaced trainings" })).toContainText("Unplaced (0)");

  // Make it impossible: VOC1 must come before IMT as well as after it.
  const voc1 = card(page, "VOC1");
  await voc1.click();
  await dialog.getByLabel("Rules").fill("after:IMT+1d;before:IMT");
  await dialog.getByLabel("Placed on (blank = unplaced)").fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Optimise", exact: true }).click();
  await expect(page.getByText("These clash")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("VOC1 (Archer) must be before IMT")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain("VOC1,VOC1,A,1,FALSE,,RANGE_1,,after:IMT+1d;before:IMT");

  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/^Archer training programme .*\.xlsx$/);
});
