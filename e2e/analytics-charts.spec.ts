import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const tabs = ["OP", "Doctors", "IP", "Pharmacy", "Collections", "Patients"];

test.describe("admin analytics charts", () => {
  test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for authenticated tests.");
  test("every analytics tab renders its own echarts canvas", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Desktop project only");
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/login"); await page.getByLabel("Email").fill(email!); await page.getByLabel("Password", { exact: true }).fill(password!); await page.getByRole("button", { name: "Sign In" }).click(); await expect(page).toHaveURL(/dashboard/);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("img", { name: "Patient visits per day" }).locator("canvas")).toBeVisible();
    await expect(page.getByRole("img", { name: "Daily collections by source" }).locator("canvas")).toBeVisible();
    for (const tab of tabs) { await page.getByRole("tab", { name: tab, exact: true }).click(); await expect(page.locator("[role=tabpanel]:visible canvas").first()).toBeVisible(); }
    expect(errors).toEqual([]);
  });
});
