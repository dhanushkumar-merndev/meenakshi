import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";
import { lookupOpenVisit } from "./support/fixtures";

test.skip(!credentialsConfigured, missingCredentials);

test("admin keeps the direct admission override", async ({ page }) => {
  const visitId = await lookupOpenVisit();
  test.skip(!visitId, "This database has no open visit.");
  await signIn(page, "admin");
  const response = await page.goto(`/visits/${visitId}`);
  test.skip(response?.status() !== 200, "Visit no longer in this database.");
  await expect(page.getByRole("button", { name: "Convert to IP" })).toBeVisible();
});

test("a doctor refers instead of admitting", async ({ page }) => {
  const visitId = await lookupOpenVisit();
  test.skip(!visitId, "This database has no open visit.");
  await signIn(page, "doctor");
  const response = await page.goto(`/visits/${visitId}`);
  test.skip(response?.status() !== 200, "Visit not visible to this doctor.");
  await expect(page.getByRole("button", { name: "Convert to IP" })).toHaveCount(0);
});
