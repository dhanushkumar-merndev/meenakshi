import { expect, test } from "@playwright/test";
import {
  credentialsConfigured,
  missingCredentials,
  signIn,
} from "./support/auth";

test.describe("IP role navigation", () => {
  test.skip(!credentialsConfigured, missingCredentials);

  test("IP staff get one sidebar page per ticket queue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop sidebar assertion.");
    await signIn(page, "ip");
    await page.goto("/ip");
    await page.waitForURL(/\/ip\/current$/);

    const expectedLinks = [
      ["Current Patients", "/ip/current"],
      ["My Patients", "/ip/my-patients"],
      ["Pending Discharge", "/ip/pending-discharge"],
      ["Discharged", "/ip/discharged"],
      ["All Tickets", "/ip/all-tickets"],
      ["Drug Stock", "/drug-stock"],
    ] as const;
    for (const [name, href] of expectedLinks) {
      await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        href,
      );
    }

    await expect(
      page.getByRole("navigation", { name: "Filter IP tickets by status" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Discharged", exact: true }).click();
    await expect(page).toHaveURL(/\/ip\/discharged$/);
    await expect(
      page.getByRole("heading", { name: "Discharged Patients" }),
    ).toBeVisible();
  });

  test("admin keeps the combined IP status page", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop sidebar assertion.");
    await signIn(page, "admin");
    await page.goto("/ip");

    await expect(page).toHaveURL(/\/ip$/);
    await expect(
      page.getByRole("navigation", { name: "Filter IP tickets by status" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Current Patients", exact: true }),
    ).toHaveCount(0);
  });
});
