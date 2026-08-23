import { expect, test, type Page } from "@playwright/test";
import { credentialsConfigured, missingCredentials, signIn, type Role } from "./support/auth";

test.skip(!credentialsConfigured, missingCredentials);
// Six simultaneous role crawls can saturate a development server and turn a
// capacity artifact into random navigation failures. The production surface
// is still fully covered, one authenticated role at a time.
test.describe.configure({ mode: "serial" });

/**
 * Every role against every page, every print document and every API route.
 *
 * Feature-by-feature testing kept missing whole-surface breakage -- a print
 * route 404ing because an RPC was never deployed, a page erroring only for one
 * role. This walks the entire surface for each role and reports everything at
 * once instead of failing on the first problem.
 */
const IDS = {
  visit: "6cc9c5fd-b993-4425-b2f4-f3565e260e5e",
  patient: "d49e3008-16fc-48aa-93a9-f21ec4174564",
  ipTicket: "e30eb994-04a9-4377-8bb8-6d2c03b94570",
  prescription: "d3c08624-1ba7-456e-956f-4bc8bbb9e34f",
  sale: "19beabaf-8461-46dc-ab76-80a92c383952",
  procedureSale: "525a0e98-15d7-4f4b-bfd6-0474614f0747",
  inventoryRequest: "13ef2e5a-a434-4754-96c0-5dedb1c66683",
};

const PAGES: Array<{ path: string; roles: Role[] }> = [
  { path: "/dashboard", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  { path: "/notifications", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  { path: "/admin/analytics", roles: ["admin"] },
  { path: "/admin/clinical-directory", roles: ["admin"] },
  { path: "/admin/clinical-directory/import", roles: ["admin"] },
  { path: "/admin/doctors", roles: ["admin"] },
  { path: "/admin/exports", roles: ["admin"] },
  { path: "/admin/masters", roles: ["admin"] },
  { path: "/admin/settings", roles: ["admin"] },
  { path: "/admin/users", roles: ["admin"] },
  { path: "/audit", roles: ["admin"] },
  { path: "/patients", roles: ["admin", "reception", "op", "doctor", "ip"] },
  { path: `/patients/${IDS.patient}`, roles: ["admin", "reception", "op", "doctor", "ip"] },
  { path: "/patients/import", roles: ["admin", "reception"] },
  { path: "/reception", roles: ["admin", "reception"] },
  { path: "/reception/follow-ups", roles: ["admin", "reception"] },
  { path: "/reception/payments", roles: ["admin", "reception"] },
  { path: "/op", roles: ["admin", "op"] },
  { path: "/op/assist", roles: ["admin", "op"] },
  { path: "/doctor", roles: ["admin", "doctor"] },
  { path: "/doctor/follow-ups", roles: ["admin", "doctor"] },
  { path: "/drug-stock", roles: ["admin", "doctor", "op", "ip"] },
  // Admin and doctor retain the combined IP page. IP staff use dedicated
  // sidebar pages for each operational queue.
  { path: "/ip", roles: ["admin", "doctor"] },
  { path: "/ip/current", roles: ["ip"] },
  { path: "/ip/my-patients", roles: ["ip"] },
  { path: "/ip/pending-discharge", roles: ["ip"] },
  { path: "/ip/discharged", roles: ["ip"] },
  { path: "/ip/all-tickets", roles: ["ip"] },
  // Not "doctor": this ticket belongs to another consultant, and a doctor
  // only sees their own IP patients.
  { path: `/ip/${IDS.ipTicket}`, roles: ["admin", "ip"] },
  { path: "/pharmacy", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/import", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/inventory", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/ip-requests", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/medicines", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/sales", roles: ["admin", "pharmacy"] },
  { path: "/pharmacy/stock", roles: ["admin", "pharmacy"] },
  { path: "/reports", roles: ["admin", "reception", "op", "ip", "doctor"] },
  { path: `/visits/${IDS.visit}`, roles: ["admin", "reception", "op", "doctor", "pharmacy"] },
  // Print documents: reachable by whoever has a button for them.
  { path: `/print/token/${IDS.visit}`, roles: ["admin", "reception", "op"] },
  // Not "doctor": a doctor sees only their OWN IP patients, and this ticket
  // belongs to another consultant -- the 404 is the RLS policy working.
  { path: `/print/prescription/${IDS.prescription}`, roles: ["admin", "pharmacy"] },
  { path: `/print/outside-purchase/${IDS.prescription}`, roles: ["admin", "pharmacy"] },
  { path: `/print/receipt/${IDS.sale}`, roles: ["admin", "pharmacy", "reception"] },
  { path: `/print/procedure-bill/${IDS.procedureSale}`, roles: ["admin", "pharmacy"] },
  { path: `/print/ip-ticket/${IDS.ipTicket}`, roles: ["admin", "ip"] },
  { path: `/print/ip-bill/${IDS.ipTicket}`, roles: ["admin", "ip"] },
  { path: `/print/discharge/${IDS.ipTicket}`, roles: ["admin", "ip"] },
  { path: `/print/ip-shortage/${IDS.inventoryRequest}`, roles: ["admin", "ip", "pharmacy"] },
];

// `restricted: true` means a role outside the list must be refused (403), not
// merely unable to see rows. The reference lookups are deliberately open to
// any signed-in staff member -- a locality list or an allergy name is not
// patient data -- so for those the audit only insists on "not a 5xx".
const APIS: Array<{ path: string; roles: Role[]; restricted?: boolean }> = [
  { path: "/api/live/version", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  { path: "/api/notifications?scope=unread&page=1&pageSize=10", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  // The metric RPC enforces its own (stricter, money-aware) role guard.
  { path: "/api/dashboard/metric?metric=today_visits", roles: ["admin"], restricted: true },
  { path: "/api/search/patients?q=a", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  { path: "/api/search/medicines?q=pa", roles: ["admin", "doctor", "op", "pharmacy", "ip"], restricted: true },
  { path: "/api/search/clinical-terms?q=fev", roles: ["admin", "doctor", "op", "ip"], restricted: true },
  // Geoapify address autocomplete: answers 503 with no API key configured,
  // which is a deployment setting rather than a fault, so it is not asserted
  // as available -- only as never a 5xx for a role that should be refused.
  { path: "/api/search/locations?q=che", roles: [] },
  { path: "/api/search/allergies?q=pen", roles: ["admin", "reception", "op", "doctor", "ip", "pharmacy"] },
  // Restricted: these carry patient-identifying counter queues and exports.
  { path: "/api/search/ip-tickets-admitted?q=a", roles: ["admin", "pharmacy"], restricted: true },
  { path: "/api/search/op-visits-today?q=a", roles: ["admin", "pharmacy"], restricted: true },
  { path: "/api/patients/import/template", roles: ["admin", "reception"], restricted: true },
  { path: "/api/pharmacy/import/template", roles: ["admin", "pharmacy"], restricted: true },
  { path: "/api/admin/clinical/import/template", roles: ["admin"], restricted: true },
];

const ROLES: Role[] = ["admin", "reception", "op", "doctor", "ip", "pharmacy"];

async function auditRole(page: Page, role: Role) {
  const failures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Browser-level noise that is not the application failing.
    if (/favicon|manifest|Download the React DevTools/i.test(text)) return;
    consoleErrors.push(text.slice(0, 200));
  });

  await signIn(page, role);

  for (const entry of PAGES) {
    if (!entry.roles.includes(role)) continue;
    consoleErrors.length = 0;
    const response = await page.goto(entry.path, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status !== 200) {
      failures.push(`${entry.path} -> HTTP ${status}`);
      continue;
    }
    if (/forbidden=1/.test(page.url())) {
      failures.push(`${entry.path} -> redirected to forbidden`);
      continue;
    }
    const body = await page.locator("body").innerText().catch(() => "");
    // Next's own 404 copy is deliberately NOT treated as a failure here: a
    // streamed page that calls notFound() after the shell has flushed answers
    // 200 with that body, which is how RLS correctly refuses a record.
    if (/We could not load this page|Application error/i.test(body))
      failures.push(`${entry.path} -> error boundary rendered`);
    if (/You're offline|This page hasn't been saved yet/i.test(body))
      failures.push(`${entry.path} -> offline fallback rendered`);
    if (/could not be found/i.test(body))
      failures.push(`${entry.path} -> rendered Next 404 body`);
    if (consoleErrors.length)
      failures.push(`${entry.path} -> console: ${consoleErrors[0]}`);
  }

  for (const api of APIS) {
    const allowed = api.roles.includes(role);
    // Playwright's request context shares this page's authenticated cookies but
    // is not intercepted by a browser service worker, so this measures the API
    // route itself instead of CacheStorage behavior.
    const result = (await page.request.get(api.path)).status();
    if (allowed && result >= 400) {
      failures.push(`${api.path} -> HTTP ${result}`);
    } else if (!allowed && api.restricted && result !== 403) {
      // Refused, and refused as 403: a thrown guard used to surface as a 500,
      // which reads as an outage rather than a permission decision.
      failures.push(`${api.path} -> expected 403 for ${role}, got ${result}`);
    } else if (!allowed && result >= 500 && result !== 503) {
      failures.push(`${api.path} -> HTTP ${result}`);
    }
  }
  return failures;
}

for (const role of ROLES) {
  test(`${role}: every page, print and API responds`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Surface audit runs once, on desktop.");
    test.setTimeout(300_000);
    const failures = await auditRole(page, role);
    // Report the whole list, not just the first one.
    expect(failures, `${role} failures:\n${failures.join("\n")}`).toEqual([]);
  });
}
