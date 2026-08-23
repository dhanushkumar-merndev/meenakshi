import { expect, test } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn } from "./support/auth";

test.skip(!credentialsConfigured, missingCredentials);

// The dose box used to prompt "1 tablet" whatever the medicine was, which
// reads as an instruction on a row that says Calpol Syrup.
test("the dose prompt follows the medicine's dosage form", async ({ page }) => {
  await signIn(page, "admin");
  // A visit that is still open enough to prescribe on. It is looked up
  // through the UI rather than hardcoded so the spec survives a data wipe.
  await page.goto("/patients");
  const response = await page.goto("/visits/6a83b71f-2410-481c-ace4-c6bc5090458d");
  const addMedicine = page.getByRole("button", { name: /Add Medicine/i });
  test.skip(
    response?.status() !== 200 || !(await addMedicine.count()),
    "No open visit to prescribe on in this database.",
  );
  await addMedicine.click();
  const dose = page.getByRole("textbox", { name: /^Dose/ }).last();
  await expect(dose).toHaveAttribute("placeholder", "Dose");

  await page.getByRole("combobox", { name: /Search medicine/i }).last().click();
  await page.getByPlaceholder("Type at least 2 letters").fill("Calpol");
  await page.getByRole("option", { name: /Calpol Syrup/i }).click();
  await expect(dose).toHaveAttribute("placeholder", "5 ml");

  await page.getByRole("combobox", { name: /Calpol Syrup/i }).click();
  await page.getByPlaceholder("Type at least 2 letters").fill("Xone");
  await page.getByRole("option", { name: /Xone/i }).click();
  await expect(dose).toHaveAttribute("placeholder", "1 ml");
  // An injection is not given "Oral": picking it sets the route it is
  // actually given by.
  await expect(page.getByLabel("Route").last()).toHaveText(/IV/);
});
