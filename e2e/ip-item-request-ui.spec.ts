import { expect, test } from "@playwright/test";
import {
  credentialsConfigured,
  missingCredentials,
  signIn,
} from "./support/auth";
import { lookupIpStockSearchFixtures } from "./support/fixtures";

test.describe("unified IP pharmacy item workflow", () => {
  test.skip(!credentialsConfigured, missingCredentials);

  test("reception can find both inventory and medicine stock", async ({ page }) => {
    const { inventory, medicine } = await lookupIpStockSearchFixtures();
    if (!inventory || !medicine) {
      test.skip(true, "This database needs one active inventory item and medicine.");
      return;
    }
    await signIn(page, "reception");
    await page.goto("/ip/current");
    const patient = page.getByRole("row").filter({ hasText: /IP-/ }).first();
    test.skip(!(await patient.count()), "No admitted IP ticket in this database.");
    await patient.getByRole("button", { name: "Open" }).click();
    await page.getByRole("button", { name: "Request Items" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Search medicine" }).click();
    const search = page.getByPlaceholder("Type at least 2 letters");
    await search.fill(inventory);
    const inventoryOption = page.getByRole("option").filter({ hasText: inventory }).first();
    await expect(inventoryOption).toBeVisible({ timeout: 15_000 });
    await expect(inventoryOption).toContainText(/(in stock|out of stock): \d+/i);
    await search.fill(medicine);
    const medicineOption = page.getByRole("option").filter({ hasText: medicine }).first();
    await expect(medicineOption).toBeVisible({ timeout: 15_000 });
    await expect(medicineOption).toContainText(/(in stock|out of stock): \d+/i);
  });

  test("pharmacy auto-matches and auto-prices stocked request lines", async ({
    page,
  }) => {
    await signIn(page, "pharmacy");
    await page.goto("/pharmacy/ip-requests");
    const fulfill = page.getByRole("button", { name: "Fulfill" }).first();
    test.skip((await fulfill.count()) === 0, "No pending IP item request in this database.");
    await fulfill.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Pan 40");
    await expect(dialog).toContainText("Calpol Syrup");
    await expect(dialog).toContainText("₹14.00");
    await expect(dialog).toContainText("₹1.32");
    await expect(dialog).toContainText(/Supplied total/);
    await expect(dialog.getByText("Add to IP ticket", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Collect at pharmacy now", { exact: true })).toBeVisible();
  });
});
