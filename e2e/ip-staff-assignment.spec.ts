import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";
import { lookupOpenVisit } from "./support/fixtures";

test.skip(!credentialsConfigured, missingCredentials);

test("IP staff get a My Patients filter and can assign a ticket", async ({ page }) => {
  await signIn(page, "ip");
  // The IP landing route deliberately redirects staff to Current Patients.
  // Their filtered workload is the dedicated route, which also works in the
  // mobile sidebar where desktop-only tabs are not rendered.
  await page.goto("/ip/my-patients");
  await expect(page).toHaveURL(/\/ip\/my-patients/);
  // Every open ticket shows an owner (a name, or "Unassigned") and an Assign
  // control -- that is what makes the filter meaningful.
  await page.goto("/ip/current");
  await expect(page.getByRole("columnheader", { name: "IP Staff" })).toBeVisible();
  const assign = page.getByRole("button", { name: "Assign" }).first();
  test.skip(!(await assign.count()), "No open IP ticket in this database.");
  await assign.click();
  await expect(page.getByRole("combobox", { name: "IP staff" })).toBeVisible();
  await page.getByRole("combobox", { name: "IP staff" }).click();
  await expect(page.getByRole("option", { name: /Unassigned/ })).toBeVisible();
});

test("reception can name the IP staff member when converting a visit", async ({ page }) => {
  // The conversion control only belongs to an open visit. Looking up the
  // newest visit regardless of state can select a closed record and make the
  // route wait behind unrelated historical data.
  const visit = await lookupOpenVisit();
  test.skip(!visit, "This database has no visits.");

  await signIn(page, "reception");
  const response = await page.goto(`/visits/${visit}`);
  test.skip(response?.status() !== 200, "Visit no longer in this database.");
  const convert = page.getByRole("button", { name: "Convert to IP" });
  // Already-admitted and closed visits have no Convert control; that is not a
  // failure of the dialog this test is about.
  test.skip(!(await convert.count()), "Newest visit is not convertible to IP.");
  await convert.click();
  await expect(page.getByRole("combobox", { name: "IP staff" })).toBeVisible();
});

test("assigning a ticket makes it show up under My Patients", async ({ page }) => {
  await signIn(page, "ip");
  await page.goto("/ip/current");
  const assign = page.getByRole("button", { name: "Assign" }).first();
  test.skip(!(await assign.count()), "No open IP ticket in this database.");
  const ticketNumber = await page
    .getByRole("row")
    .filter({ has: assign })
    .locator("td")
    .first()
    .innerText();

  await assign.click();
  // The account claims the ticket itself. This is independent of a hospital's
  // chosen staff display name (for example, "IP Desk").
  await page.getByRole("button", { name: "Assign to me" }).click();
  await page.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/ip/my-patients");
  await expect(page.getByText(ticketNumber)).toBeVisible();

  // Put it back so the ward data is left as it was found.
  await page.goto("/ip/current");
  await page.getByRole("row").filter({ hasText: ticketNumber })
    .getByRole("button", { name: "Assign" }).click();
  await page.getByRole("combobox", { name: "IP staff" }).click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  await page.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
});
