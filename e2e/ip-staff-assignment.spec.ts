import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";

test.skip(!credentialsConfigured, missingCredentials);

test("IP staff get a My Patients filter and can assign a ticket", async ({ page }) => {
  await signIn(page, "ip");
  await page.goto("/ip");
  const mine = page.getByRole("link", { name: "My Patients" });
  await expect(mine).toBeVisible();
  await mine.click();
  await expect(page).toHaveURL(/status=mine/);
  // Every open ticket shows an owner (a name, or "Unassigned") and an Assign
  // control -- that is what makes the filter meaningful.
  await page.goto("/ip");
  await expect(page.getByRole("columnheader", { name: "IP Staff" })).toBeVisible();
  const assign = page.getByRole("button", { name: "Assign" }).first();
  test.skip(!(await assign.count()), "No open IP ticket in this database.");
  await assign.click();
  await expect(page.getByRole("combobox", { name: "IP staff" })).toBeVisible();
  await page.getByRole("combobox", { name: "IP staff" }).click();
  await expect(page.getByRole("option", { name: /Unassigned/ })).toBeVisible();
});

test("reception can name the IP staff member when converting a visit", async ({ page }) => {
  await signIn(page, "reception");
  const response = await page.goto("/visits/6a83b71f-2410-481c-ace4-c6bc5090458d");
  test.skip(response?.status() !== 200, "Visit no longer in this database.");
  await page.getByRole("button", { name: "Convert to IP" }).click();
  await expect(page.getByRole("combobox", { name: "IP staff" })).toBeVisible();
});

test("assigning a ticket makes it show up under My Patients", async ({ page }) => {
  await signIn(page, "ip");
  await page.goto("/ip");
  const assign = page.getByRole("button", { name: "Assign" }).first();
  test.skip(!(await assign.count()), "No open IP ticket in this database.");
  const ticketNumber = await page
    .getByRole("row")
    .filter({ has: assign })
    .locator("td")
    .first()
    .innerText();

  await assign.click();
  await page.getByRole("combobox", { name: "IP staff" }).click();
  // The option's accessible name includes its load hint ("IP Staff free").
  await page.getByRole("option", { name: /^IP Staff/ }).click();
  await page.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/ip?status=mine");
  await expect(page.getByText(ticketNumber)).toBeVisible();

  // Put it back so the ward data is left as it was found.
  await page.goto("/ip");
  await page.getByRole("row").filter({ hasText: ticketNumber })
    .getByRole("button", { name: "Assign" }).click();
  await page.getByRole("combobox", { name: "IP staff" }).click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  await page.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 });
});
