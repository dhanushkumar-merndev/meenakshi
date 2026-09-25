import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  credentialsConfigured,
  emailFor,
  missingCredentials,
  passwordFor,
  signIn,
  type Role,
} from "./support/auth";

/**
 * Discounts end to end, against the real database:
 *
 *   reception discounts a visit fee (limit enforced in the dialog)
 *   pharmacy discounts a counter bill (stock still drops by the full quantity,
 *     the receipt shows the discount)
 *   IP staff discount the IP bill; admin voids it and the balance reopens
 *   admin changes the limit (audited) and sees the discounts in analytics
 *   the database refuses direct writes and over-limit discounts from any role
 *
 * Fixtures are created through the same RPCs staff use, signed in as each
 * role, so they pass the same guards. Everything is named "E2E Discount …" /
 * "ZZ E2E …" so scripts/e2e-teardown.mjs removes it.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function asRole(role: Role) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: emailFor(role),
    password: passwordFor(role)!,
  });
  if (error) throw new Error(`${role} sign-in failed: ${error.message}`);
  return client;
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

type Fixture = {
  patientName: string;
  feeVisitId: string;
  rxPatientName: string;
  rxVisitId: string;
  prescriptionId: string;
  batchId: string;
  ticketId: string;
  ipPatientName: string;
  plainPatientName: string;
  plainVisitId: string;
  plainPrescriptionId: string;
};

const stamp = Date.now().toString().slice(-8);
let service: SupabaseClient;
let fixture: Fixture;
let originalLimit = 10;

async function createPatient(reception: SupabaseClient, name: string, phoneSuffix: string) {
  const phone = `6${stamp}${phoneSuffix}`.slice(0, 10);
  return must(
    await reception.from("patients").insert({ name, phone_normalized: phone }).select("id").single(),
    "create patient",
  ) as { id: string };
}

test.describe("Discounts", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!credentialsConfigured || !serviceKey, missingCredentials);

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "desktop") return;
    test.setTimeout(120_000);
    service = createClient(url, serviceKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const settings = must(
      await service.from("hospital_settings").select("max_discount_percent").eq("id", true).single(),
      "read limit",
    ) as { max_discount_percent: number };
    originalLimit = settings.max_discount_percent;
    must(await service.from("hospital_settings").update({ max_discount_percent: 10 }).eq("id", true).select("id"), "set limit");

    const [reception, pharmacy, ip] = await Promise.all([asRole("reception"), asRole("pharmacy"), asRole("ip")]);
    // Any active consultant: discounts do not depend on who saw the patient,
    // and the doctor account on some databases is linked to a placeholder.
    const [doctor] = must(
      await service.from("doctors").select("id").eq("active", true).order("display_name").limit(1),
      "find doctor",
    ) as Array<{ id: string }>;

    // 1. A visit whose ₹500 fee reception will collect with a discount.
    const patientName = `E2E Discount Fee ${stamp.slice(-4)}`;
    const patient = await createPatient(reception, patientName, "1");
    const [feeVisit] = must(
      await reception.rpc("create_visit_with_token", {
        p_patient_id: patient.id, p_doctor_id: doctor.id, p_visit_type: "op", p_fee_paise: 50000,
        p_collected_paise: 0, p_payment_mode: "cash", p_previous_visit_id: null, p_notes: null,
        p_idempotency_key: crypto.randomUUID(),
      }),
      "fee visit",
    ) as Array<{ visit_id: string }>;

    // 2. A completed visit (fee ₹300) with 4 tablets at ₹10 prescribed.
    const medicineName = `ZZ E2E Discount Tablet ${stamp}`;
    const medicine = must(
      await pharmacy.from("medicine_directory")
        .insert({ brand_name: medicineName, generic_name: "Test", strength: "10 mg", dosage_form: "Tablet", source: "hospital" })
        .select("id").single(),
      "medicine",
    ) as { id: string };
    must(
      await pharmacy.rpc("save_medicine_batch", {
        p_batch_id: null, p_medicine_id: medicine.id, p_batch_number: `E2E-DISC-${stamp}`,
        p_expiry_date: `${new Date().getFullYear() + 2}-12-31`, p_quantity_delta: 50,
        p_purchase_price_paise: 500, p_selling_price_paise: 1000, p_low_stock_threshold: 5,
        p_active: true, p_reason: "E2E discount fixture", p_idempotency_key: crypto.randomUUID(),
        p_units_per_pack: 1,
      }),
      "batch",
    );
    const batch = must(
      await service.from("medicine_batches").select("id").eq("medicine_id", medicine.id).single(),
      "batch id",
    ) as { id: string };
    const rxPatientName = `E2E Discount Rx ${stamp.slice(-4)}`;
    const rxPatient = await createPatient(reception, rxPatientName, "2");
    const [rxVisit] = must(
      await reception.rpc("create_visit_with_token", {
        p_patient_id: rxPatient.id, p_doctor_id: doctor.id, p_visit_type: "op", p_fee_paise: 30000,
        p_collected_paise: 0, p_payment_mode: "cash", p_previous_visit_id: null, p_notes: null,
        p_idempotency_key: crypto.randomUUID(),
      }),
      "rx visit",
    ) as Array<{ visit_id: string }>;
    const prescriptionId = must(
      await pharmacy.rpc("create_manual_prescription", {
        p_visit_id: rxVisit.visit_id, p_ip_ticket_id: null, p_doctor_id: null, p_fee_paise: 30000,
        p_lines: [{ medicine_id: medicine.id, medicine_name: medicineName, dose: "1 tablet", frequency: "1-0-1", duration: "2 days", quantity: 4 }],
        p_idempotency_key: crypto.randomUUID(),
      }),
      "prescription",
    ) as string;

    // 2b. The same shape again, dispensed with no discount (regression check).
    const plainPatientName = `E2E Discount Plain ${stamp.slice(-4)}`;
    const plainPatient = await createPatient(reception, plainPatientName, "4");
    const [plainVisit] = must(
      await reception.rpc("create_visit_with_token", {
        p_patient_id: plainPatient.id, p_doctor_id: doctor.id, p_visit_type: "op", p_fee_paise: 30000,
        p_collected_paise: 0, p_payment_mode: "cash", p_previous_visit_id: null, p_notes: null,
        p_idempotency_key: crypto.randomUUID(),
      }),
      "plain visit",
    ) as Array<{ visit_id: string }>;
    const plainPrescriptionId = must(
      await pharmacy.rpc("create_manual_prescription", {
        p_visit_id: plainVisit.visit_id, p_ip_ticket_id: null, p_doctor_id: null, p_fee_paise: 30000,
        p_lines: [{ medicine_id: medicine.id, medicine_name: medicineName, dose: "1 tablet", frequency: "1-0-1", duration: "2 days", quantity: 4 }],
        p_idempotency_key: crypto.randomUUID(),
      }),
      "plain prescription",
    ) as string;

    // 3. An admitted patient with a ₹1,000 charge on the IP bill.
    const ipPatientName = `E2E Discount IP ${stamp.slice(-4)}`;
    const ipPatient = await createPatient(reception, ipPatientName, "3");
    const [ticket] = must(
      await ip.rpc("create_ip_ticket", {
        p_patient_id: ipPatient.id, p_doctor_id: doctor.id, p_source_visit_id: null, p_room: "E2E",
        p_bed: stamp.slice(-3), p_reason: "Discount test", p_deposit_paise: 0, p_payment_mode: "cash",
        p_is_emergency: false, p_idempotency_key: crypto.randomUUID(),
      }),
      "ip ticket",
    ) as Array<{ ticket_id: string }>;
    must(
      await ip.rpc("add_custom_ip_charge", {
        p_ticket_id: ticket.ticket_id, p_item: "Custom care discount test", p_quantity: 1,
        p_rate_paise: 100000, p_idempotency_key: crypto.randomUUID(),
      }),
      "ip charge",
    );

    fixture = {
      patientName, feeVisitId: feeVisit.visit_id, rxPatientName, rxVisitId: rxVisit.visit_id,
      prescriptionId, batchId: batch.id, ticketId: ticket.ticket_id, ipPatientName,
      plainPatientName, plainVisitId: plainVisit.visit_id, plainPrescriptionId,
    };
  });

  test.afterAll(async () => {
    if (service) await service.from("hospital_settings").update({ max_discount_percent: originalLimit }).eq("id", true);
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Discount flows run once, on desktop.");
  });

  async function openDiscount(page: Page) {
    await page.getByRole("button", { name: "Add discount" }).click();
  }

  test("reception discounts a visit fee within the limit", async ({ page }) => {
    await signIn(page, "reception");
    await page.goto(`/visits/${fixture.feeVisitId}`);
    await page.getByRole("button", { name: "Collect ₹500.00" }).click();
    const dialog = page.getByRole("dialog");
    await openDiscount(page);
    await dialog.getByRole("combobox", { name: "Discount type" }).click();
    await page.getByRole("option", { name: "%" }).click();
    await dialog.getByLabel("Discount", { exact: true }).fill("12");
    await expect(dialog.getByText("Maximum 10% discount allowed.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Record Payment" })).toBeDisabled();

    await dialog.getByLabel("Discount", { exact: true }).fill("10");
    await dialog.getByRole("combobox", { name: "Discount reason" }).click();
    await page.getByRole("option", { name: "Senior citizen" }).click();
    // The amount follows the balance less the discount.
    await expect(dialog.getByLabel("Amount (₹)")).toHaveValue("450.00");
    await dialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });

    await expect(page.getByText("−₹50.00")).toBeVisible({ timeout: 30_000 });
    const visit = must(
      await service.from("visits").select("discount_paise").eq("id", fixture.feeVisitId).single(),
      "visit",
    ) as { discount_paise: number };
    expect(visit.discount_paise).toBe(5000);
  });

  test("pharmacy discounts a counter bill; stock drops by the full quantity", async ({ page }) => {
    const before = must(
      await service.from("medicine_batches").select("quantity").eq("id", fixture.batchId).single(),
      "stock before",
    ) as { quantity: number };

    await signIn(page, "pharmacy");
    await page.goto(`/pharmacy?q=${encodeURIComponent(fixture.rxPatientName)}`);
    const row = page.getByRole("row").filter({ hasText: fixture.rxPatientName });
    await row.getByRole("button", { name: "Dispense" }).click();
    const dialog = page.getByRole("dialog");
    // Medicines ₹40 + doctor fee ₹300.
    await expect(dialog.getByText("₹340.00")).toBeVisible({ timeout: 30_000 });

    await openDiscount(page);
    await dialog.getByLabel("Discount", { exact: true }).fill("35");
    await expect(dialog.getByText("Maximum 10% discount allowed.")).toBeVisible();
    await dialog.getByLabel("Discount", { exact: true }).fill("34");
    await dialog.getByRole("combobox", { name: "Discount reason" }).click();
    await page.getByRole("option", { name: "Staff" }).click();
    await expect(dialog.getByText("₹306.00")).toBeVisible();
    await dialog.getByRole("button", {
      name: /^(Confirm (Full )?Dispense(?: With Extra)?|Dispense Available Quantity)$/,
    }).click();
    // The row refreshes into its dispensed state (with the receipt link).
    await expect(row).toContainText("dispensed", { timeout: 30_000 });

    const after = must(
      await service.from("medicine_batches").select("quantity").eq("id", fixture.batchId).single(),
      "stock after",
    ) as { quantity: number };
    expect(after.quantity, "a discount never changes the stock taken").toBe(before.quantity - 4);
    const sale = must(
      await service.from("pharmacy_sales").select("id,total_paise,discount_paise").eq("prescription_id", fixture.prescriptionId).single(),
      "sale",
    ) as { id: string; total_paise: number; discount_paise: number };
    expect(sale).toMatchObject({ total_paise: 4000, discount_paise: 3400 });

    await page.goto(`/print/receipt/${sale.id}`);
    await expect(page.getByText("Discount (Staff)")).toBeVisible();
    await expect(page.getByText("−₹34.00")).toBeVisible();
    await expect(page.getByText("₹306.00")).toBeVisible();
  });

  test("dispensing without a discount collects exactly as before", async ({ page }) => {
    await signIn(page, "pharmacy");
    await page.goto(`/pharmacy?q=${encodeURIComponent(fixture.plainPatientName)}`);
    const row = page.getByRole("row").filter({ hasText: fixture.plainPatientName });
    await row.getByRole("button", { name: "Dispense" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("₹340.00")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: "Add discount" })).toBeVisible();
    await dialog.getByRole("button", {
      name: /^(Confirm (Full )?Dispense(?: With Extra)?|Dispense Available Quantity)$/,
    }).click();
    await expect(row).toContainText("dispensed", { timeout: 30_000 });

    const sale = must(
      await service.from("pharmacy_sales").select("total_paise,discount_paise").eq("prescription_id", fixture.plainPrescriptionId).single(),
      "plain sale",
    ) as { total_paise: number; discount_paise: number };
    expect(sale).toEqual({ total_paise: 4000, discount_paise: 0 });
    const payments = must(
      await service.from("visit_payments").select("amount_paise").eq("visit_id", fixture.plainVisitId),
      "plain payments",
    ) as Array<{ amount_paise: number }>;
    expect(payments.map((row) => row.amount_paise)).toEqual([30000]);
    const discounts = must(await service.from("discounts").select("id").eq("visit_id", fixture.plainVisitId), "plain discounts") as unknown[];
    expect(discounts).toHaveLength(0);
  });

  test("IP staff discount the IP bill and admin can void it", async ({ browser }) => {
    const ipPage = await browser.newPage();
    await signIn(ipPage, "ip");
    await ipPage.goto(`/ip/${fixture.ticketId}`);
    await ipPage.getByRole("button", { name: "Add Payment" }).click();
    const dialog = ipPage.getByRole("dialog");
    await openDiscount(ipPage);
    await dialog.getByRole("combobox", { name: "Discount type" }).click();
    await ipPage.getByRole("option", { name: "%" }).click();
    await dialog.getByLabel("Discount", { exact: true }).fill("10");
    await dialog.getByRole("combobox", { name: "Discount reason" }).click();
    await ipPage.getByRole("option", { name: "Charity" }).click();
    await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("900.00");
    await dialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(ipPage.getByText("−₹100.00").first()).toBeVisible({ timeout: 30_000 });

    const admin = await browser.newPage();
    await signIn(admin, "admin");
    await admin.goto(`/admin/discounts?source=ip&q=${encodeURIComponent(fixture.ipPatientName)}`);
    const registerRow = admin.getByRole("row").filter({ hasText: fixture.ipPatientName });
    await expect(registerRow).toContainText("Charity");
    await registerRow.getByRole("button", { name: "Void" }).click();
    await admin.getByRole("dialog").getByLabel("Reason").fill("Entered by mistake in E2E");
    await admin.getByRole("button", { name: "Void Discount" }).click();
    await expect(registerRow).toContainText("Voided", { timeout: 30_000 });

    const [summary] = must(
      await (await asRole("ip")).rpc("get_ip_financial_summaries", { p_ticket_ids: [fixture.ticketId] }),
      "ip summary",
    ) as Array<{ balance_paise: number; discount_paise: number }>;
    expect(summary).toMatchObject({ balance_paise: 10000, discount_paise: 0 });
    await ipPage.close();
    await admin.close();
  });

  test("admin changes the limit (audited) and sees discounts in analytics", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/admin/settings");
    await page.getByRole("tab", { name: "Billing" }).click();
    await page.getByLabel("Maximum discount for staff (%)").fill("15");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Hospital settings saved.")).toBeVisible({ timeout: 30_000 });
    const audit = must(
      await service.from("audit_logs").select("metadata").eq("action", "DISCOUNT_LIMIT_CHANGED")
        .order("created_at", { ascending: false }).limit(1).single(),
      "limit audit",
    ) as { metadata: { from_percent: number; to_percent: number } };
    expect(audit.metadata).toMatchObject({ from_percent: 10, to_percent: 15 });

    await page.goto("/admin/analytics");
    await page.getByRole("tab", { name: "Discounts" }).click();
    await expect(page.getByText("Total discount")).toBeVisible();
    await expect(page.getByText("Discounts by reason")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /Discounts Today/ })).toBeVisible();
  });

  test("the database refuses direct writes and over-limit discounts", async () => {
    const [pharmacy, doctor, reception] = await Promise.all([asRole("pharmacy"), asRole("doctor"), asRole("reception")]);

    const insert = await pharmacy.from("discounts").insert({
      visit_id: fixture.rxVisitId, gross_paise: 30000, amount_paise: 100, reason: "staff",
      idempotency_key: crypto.randomUUID(),
    });
    expect(insert.error, "no role may write the ledger directly").not.toBeNull();

    const tamper = await pharmacy.from("pharmacy_sales").update({ discount_paise: 0 }).eq("prescription_id", fixture.prescriptionId).select("id");
    expect(tamper.error?.message ?? "", "sale discount totals are ledger-only").toMatch(/discount ledger/);

    const doctorRead = must(await doctor.from("discounts").select("id"), "doctor read") as unknown[];
    expect(doctorRead, "doctors see no discounts").toHaveLength(0);

    const receptionRead = must(await reception.from("discounts").select("source"), "reception read") as Array<{ source: string }>;
    expect(receptionRead.every((row) => row.source === "op_fee")).toBe(true);

    const voidAttempt = await pharmacy.rpc("void_discount", { p_discount_id: crypto.randomUUID(), p_reason: "not admin" });
    expect(voidAttempt.error?.message).toBe("forbidden");

    // The IP ticket owes ₹100 again after the void. At a 1% limit, ₹100 off a
    // ₹1,000 bill must be refused by the database itself, whatever the page
    // showed. (afterAll restores the hospital's own limit.)
    must(await service.from("hospital_settings").update({ max_discount_percent: 1 }).eq("id", true).select("id"), "set 1%");
    const ip = await asRole("ip");
    const overLimit = await ip.rpc("add_ip_payment", {
      p_ticket_id: fixture.ticketId, p_amount_paise: 0, p_mode: null, p_reference: null,
      p_idempotency_key: crypto.randomUUID(), p_discount_paise: 10000, p_discount_reason: "staff",
    });
    expect(overLimit.error?.message ?? "").toMatch(/discount exceeds limit of 1 percent/);
  });
});
