import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";

test.skip(!credentialsConfigured, missingCredentials);

const visitId = "6a83b71f-2410-481c-ace4-c6bc5090458d";

test("admin keeps the direct admission override", async ({ page }) => {
  await signIn(page, "admin");
  const response = await page.goto(`/visits/${visitId}`);
  test.skip(response?.status() !== 200, "Visit no longer in this database.");
  await expect(page.getByRole("button", { name: "Convert to IP" })).toBeVisible();
});

test("a doctor refers instead of admitting", async ({ page }) => {
  await signIn(page, "doctor");
  const response = await page.goto(`/visits/${visitId}`);
  test.skip(response?.status() !== 200, "Visit not visible to this doctor.");
  await expect(page.getByRole("button", { name: "Convert to IP" })).toHaveCount(0);
});
