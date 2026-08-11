import { expect, test } from "@playwright/test";

test("setup state is responsive and explains configuration", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Connect Meenakshi Hospital" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("login has no public signup", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
});
