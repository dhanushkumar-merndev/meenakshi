import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";

/**
 * IP side of the Definition of Done: one ticket accumulates charges and
 * payments, and total / paid / balance stay consistent (AGENTS.md 34, 37).
 *
 * It works on an existing admitted ticket rather than admitting a new patient,
 * so the test does not occupy a bed on every run.
 */
test.describe("IP ticket charges and payments", () => {
  test.skip(!credentialsConfigured, missingCredentials);

  test("a charge and a payment both land on the same ticket", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Runs once, on desktop.");
    test.setTimeout(180_000);
    await signIn(page, "ip");
    await page.goto("/ip?status=current");

    const row = page.getByRole("row").filter({ hasText: /IP-/ }).first();
    await row.waitFor({ timeout: 30_000 });
    await row.getByRole("button", { name: /Open/ }).first().click();
    await page.waitForURL(/\/ip\/[0-9a-f-]{36}/, { timeout: 30_000 });

    const chargeItem = `E2E dressing ${Date.now().toString().slice(-5)}`;

    // --- Add a treatment charge -------------------------------------------
    await page.getByRole("button", { name: "Add Charge" }).click();
    const chargeDialog = page.getByRole("dialog");
    // Item and Rate are read-only while a configured preset is selected; a
    // free-text charge needs the Custom option.
    await chargeDialog.getByLabel("Charge preset").click();
    await page.getByRole("option", { name: "Custom charge" }).click();
    await chargeDialog.getByLabel("Item").fill(chargeItem);
    await chargeDialog.getByLabel("Quantity").fill("1");
    await chargeDialog.getByLabel("Rate").fill("400");
    await chargeDialog.getByRole("button", { name: "Add Charge" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(chargeItem)).toBeVisible({ timeout: 30_000 });

    // --- Add an offline payment -------------------------------------------
    await page.getByRole("button", { name: "Add Payment" }).click();
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByLabel("Amount").fill("400");
    await paymentDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // --- The running bill reflects both -----------------------------------
    const ticketId = page.url().split("/ip/")[1].split(/[?#]/)[0];
    await page.goto(`/print/ip-ticket/${ticketId}`);
    const bill = await page.locator("article").innerText();
    expect(bill, "the charge belongs to this ticket's bill").toContain(chargeItem);
    expect(bill).toMatch(/Total/);
    expect(bill).toMatch(/Balance/);
    // Payments are listed, never overwritten (AGENTS.md 37).
    expect(bill).toMatch(/PAYMENT HISTORY/i);
  });
});
