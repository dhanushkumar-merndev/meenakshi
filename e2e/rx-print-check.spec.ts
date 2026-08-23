import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";

test.skip(!credentialsConfigured, missingCredentials);

test("pharmacy can print an IP and an OP prescription", async ({ page }) => {
  await signIn(page, "pharmacy");
  for (const id of [
    "ff4a9a64-e71a-471d-b1e6-1f74fbfae250",
    "04eb2bc1-673f-4ad3-9dce-f5d13aa5bdf5",
  ]) {
    const response = await page.goto(`/print/prescription/${id}`);
    expect(response?.status(), `status for ${id}`).toBe(200);
    await expect(page.getByText(/Prescription No/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Print Prescription/i })).toBeVisible();
  }
});
