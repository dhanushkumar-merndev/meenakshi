import { defineConfig, devices } from "@playwright/test";

// Next loads .env for the app, but the Playwright process does not, so the
// staff sign-in credentials would be missing and every authenticated spec
// would silently skip.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env (CI passes real environment variables instead).
}

// PLAYWRIGHT_BASE_URL wins so the suite can be pointed at an already-running
// dev server on another port (next dev moves off 3000 when it is taken).
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
