import { expect, type Page } from "@playwright/test";

export type Role = "admin" | "reception" | "op" | "doctor" | "ip" | "pharmacy";

/**
 * Staff sign-in for E2E. All six accounts share one password in the test
 * project; each email can be overridden with E2E_<ROLE>_EMAIL.
 */
const password = process.env.E2E_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD;

export const credentialsConfigured = Boolean(password);
export const missingCredentials =
  "Set E2E_PASSWORD (and the role emails, if they differ from the defaults) to run authenticated tests.";

export function emailFor(role: Role) {
  const override = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
  if (override) return override;
  if (role === "admin" && process.env.E2E_ADMIN_EMAIL) return process.env.E2E_ADMIN_EMAIL;
  return `${role}@meenakshihospital.com`;
}

export async function signIn(page: Page, role: Role) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(emailFor(role));
  // exact: the show/hide toggle button's own aria-label ("Show password")
  // otherwise also matches this substring search.
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 });
}

/**
 * Display name of the doctor the "doctor" account is linked to. Reception must
 * route the E2E visit to this consultant for it to reach that doctor's queue.
 */
export const doctorDisplayName = process.env.E2E_DOCTOR_NAME ?? "Dr Dharsan";
