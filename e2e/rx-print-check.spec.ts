import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";
import { lookupPrescriptions } from "./support/fixtures";

test.skip(!credentialsConfigured, missingCredentials);

/**
 * Both prescription shapes print: one raised on an IP ticket, one on an OP
 * visit. The ids are looked up rather than hardcoded -- the previous pair of
 * literal UUIDs turned into two 404s as soon as those rows were cleared, which
 * looked like the print route had broken.
 */
test("pharmacy can print an IP and an OP prescription", async ({ page }) => {
  const { ip, op } = await lookupPrescriptions();
  const targets = [
    { label: "IP", id: ip },
    { label: "OP", id: op },
  ].filter((t): t is { label: string; id: string } => Boolean(t.id));
  test.skip(targets.length === 0, "This database has no prescriptions to print.");

  await signIn(page, "pharmacy");
  for (const { label, id } of targets) {
    const response = await page.goto(`/print/prescription/${id}`);
    expect(response?.status(), `${label} prescription ${id} prints`).toBe(200);
    await expect(page.getByText(/Prescription No/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Print Prescription/i })).toBeVisible();
  }
});
