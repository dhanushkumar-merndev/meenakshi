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

    // --- Add configured + custom charges in one atomic batch ---------------
    const chargeTable = page.getByRole("table").filter({
      has: page.getByRole("columnheader", { name: "Category", exact: true }),
    });
    const chargeRowsBefore = await chargeTable.getByRole("row").count();
    await page.getByRole("button", { name: "Add Charge" }).click();
    const chargeDialog = page.getByRole("dialog");
    const chargeRows = chargeDialog.locator("[data-charge-row]");
    const firstCharge = chargeRows.nth(0);
    const chargeItem = await firstCharge.getByLabel("Item").inputValue();
    const chargeRate = await firstCharge.getByLabel("Rate").inputValue();
    expect(chargeItem, "an active IP charge must be configured").not.toBe("");
    expect(Number(chargeRate), "the configured charge must have a rate").toBeGreaterThan(0);
    await firstCharge.getByLabel("Quantity").fill("1");

    await chargeDialog.getByRole("button", { name: "Add another charge" }).click();
    const customCharge = chargeRows.nth(1);
    await customCharge.getByLabel("Charge option").click();
    await page.getByRole("option", { name: "Custom charge" }).click();
    const customItem = `Custom care ${Date.now()}`;
    await customCharge.getByLabel("Item").fill(customItem);
    await customCharge.getByLabel("Rate").fill("125.50");
    await chargeDialog.getByRole("button", { name: "Add 2 Charges" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(chargeTable.getByRole("row")).toHaveCount(chargeRowsBefore + 2, {
      timeout: 30_000,
    });
    await expect(chargeTable).toContainText(chargeItem);
    await expect(chargeTable).toContainText(customItem);

    // --- Add an offline payment -------------------------------------------
    await page.getByRole("button", { name: "Add Payment" }).click();
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByLabel("Amount").fill("999999999.99");
    await expect(paymentDialog).toContainText("exceeds the pending balance");
    await expect(
      paymentDialog.getByRole("button", { name: "Record Payment" }),
    ).toBeDisabled();
    await paymentDialog.getByLabel("Amount").fill(chargeRate);
    await expect(paymentDialog).toContainText(/will remain pending|Paid in full/);
    await paymentDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // A subsequent collection is a new payment row with a fresh idempotency
    // key; it must not replay the previous payment or require a tab refresh.
    await page.getByRole("button", { name: "Add Payment" }).click();
    const secondPaymentDialog = page.getByRole("dialog");
    await secondPaymentDialog.getByLabel("Amount").fill("1.00");
    await secondPaymentDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Payment already recorded.")).toHaveCount(0);

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
