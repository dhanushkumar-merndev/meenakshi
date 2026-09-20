import { expect, test, type Page } from "@playwright/test";
import { credentialsConfigured, doctorDisplayName, missingCredentials, signIn } from "./support/auth";

/**
 * One patient's whole journey, driven by the role that really does each step.
 *
 *   pharmacy stocks a medicine -> reception registers and takes vitals ->
 *   doctor consults, diagnoses and prescribes -> pharmacy dispenses and the
 *   stock falls by exactly what was handed over -> reception admits to a ward
 *   -> IP requests items and pharmacy supplies them -> IP bills and collects
 *   -> IP discharges -> admin reads the whole thing back
 *
 * It stocks its own medicine rather than borrowing one off the shelf, so the
 * arithmetic is exact: 100 pieces in, a known quantity out, and the number on
 * screen has to match. Written serially because each step consumes the row the
 * previous one produced.
 *
 * Everything it creates carries a teardown marker ("E2E Patient …", "ZZ E2E
 * …"), so `node scripts/e2e-teardown.mjs --yes` removes the patient and all
 * their records afterwards and puts the dispensed stock back.
 */
test.describe.configure({ mode: "serial" });

const OPENING_PACKS = 10;
const UNITS_PER_PACK = 10;
const OPENING_UNITS = OPENING_PACKS * UNITS_PER_PACK;
const PRESCRIBED = 6;

/** Quantity of our batch as the pharmacist sees it on the stock screen. */
async function batchQuantity(page: Page, brand: string) {
  await page.goto(`/pharmacy/stock?q=${encodeURIComponent(brand)}`);
  const row = page.getByRole("row").filter({ hasText: brand }).first();
  await row.waitFor({ timeout: 20_000 });
  // Medicine | Generic | Batch | Expiry | Qty | ...
  // The Qty cell holds the piece count AND a pack-breakdown sub-label
  // ("10 packs x 10"), so reading the whole cell and stripping non-digits
  // splices all three numbers into one: 100 became "1001010". Take the first
  // span, which is the quantity on its own.
  const cell = await row.getByRole("cell").nth(4).locator("span").first().innerText();
  const digits = cell.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

test.describe("every role, one patient, end to end", () => {
  test.skip(!credentialsConfigured, missingCredentials);

  test("stock-in, registration, consultation, dispensing, admission, ward supply, billing and discharge", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The flow runs once, on desktop.");
    test.setTimeout(600_000);

    const stamp = Date.now().toString().slice(-9);
    const phone = `9${stamp}`;
    const patientName = `E2E Patient Flow ${stamp.slice(-4)}`;
    const brand = `ZZ E2E Flow Tablet ${stamp.slice(-4)}`;

    // === PHARMACY: put a medicine in the library and stock it ============
    // Each staff member needs an isolated auth session. Browser pages in the
    // same context share Supabase's auth cookie, so using `browser.newPage()`
    // here would silently turn an already-open IP page into the last role
    // that signed in (for example Pharmacy) before its next server action.
    const pharmacyContext = await browser.newContext();
    const pharmacy = await pharmacyContext.newPage();
    await signIn(pharmacy, "pharmacy");
    await pharmacy.goto("/pharmacy/medicines");
    await pharmacy.getByRole("button", { name: "Add Medicine" }).click();
    await pharmacy.getByLabel("Medicine name").fill(brand);
    await pharmacy.getByLabel("Generic name").fill("E2E test generic");
    await pharmacy.getByLabel("Strength").fill("500 mg");
    await pharmacy.getByLabel("Dosage form", { exact: true }).fill("Tablet");
    await pharmacy.getByRole("button", { name: "Save Medicine" }).click();
    await expect(pharmacy.getByText("Medicine saved.")).toBeVisible({ timeout: 30_000 });

    await pharmacy.goto("/pharmacy/stock");
    await pharmacy.getByRole("button", { name: "Add Batch" }).first().click();
    const batchDialog = pharmacy.getByRole("dialog");
    await batchDialog.getByRole("combobox").first().click();
    await pharmacy.getByRole("option", { name: new RegExp(brand) }).click();
    await batchDialog.getByLabel("Batch number").fill(`E2E-${stamp.slice(-5)}`);
    await batchDialog.getByLabel("Expiry date").fill("2027-12-31");
    await batchDialog.getByLabel("Purchase price per pack (₹)").fill("30");
    await batchDialog.getByLabel("Selling price per pack (₹)").fill("50");
    await batchDialog.getByLabel("Low stock threshold").fill("5");
    await batchDialog.getByLabel("Number of packs").fill(String(OPENING_PACKS));
    await batchDialog.getByLabel("Units per pack", { exact: true }).fill(String(UNITS_PER_PACK));
    await batchDialog.getByLabel("Loose units").fill("0");
    // The dialog shows what it is about to take in, in pieces.
    await expect(batchDialog).toContainText(`${OPENING_UNITS} individual units`);
    await batchDialog.getByRole("button", { name: "Save Batch" }).click();
    await expect(pharmacy.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    expect(await batchQuantity(pharmacy, brand), "opening stock lands in full").toBe(OPENING_UNITS);

    // === RECEPTION: register the patient and open a visit =================
    const receptionContext = await browser.newContext();
    const reception = await receptionContext.newPage();
    await signIn(reception, "reception");
    await reception.goto("/reception");
    await reception.getByRole("button", { name: "Find or Add Patient" }).click();
    await reception.getByPlaceholder("UHID, mobile number or patient name").fill(phone);
    await reception.getByRole("button", { name: "Add new patient" }).click();
    await reception.getByLabel("Patient name *").fill(patientName);
    await reception.getByLabel("Mobile number *").fill(phone);
    await reception.getByLabel("Doctor").click();
    await reception.getByRole("option", { name: doctorDisplayName }).click();
    // Registration takes no money: the doctor sets the fee (AGENTS.md 50).
    await expect(reception.getByLabel("Amount collected offline")).toHaveCount(0);
    await reception.getByRole("button", { name: "Register & Create Visit" }).click();
    await expect(reception.getByRole("heading", { name: "Visit created" })).toBeVisible({ timeout: 30_000 });
    const token = (await reception.locator("p.text-6xl").innerText()).trim();
    expect(Number(token), "the visit gets a real token number").toBeGreaterThan(0);

    // === RECEPTION: vitals, which marks the patient ready for the doctor ==
    await reception.goto("/op");
    const opRow = reception.getByRole("row").filter({ hasText: patientName });
    await expect(opRow).toBeVisible({ timeout: 30_000 });
    await opRow.getByRole("button", { name: "Record Vitals" }).click();
    await reception.getByLabel("Weight (kg)").fill("71");
    await reception.getByLabel("Temperature (°F)").fill("101.2");
    await reception.getByLabel("BP systolic").fill("124");
    await reception.getByLabel("BP diastolic").fill("82");
    await reception.getByLabel("Pulse / min").fill("88");
    await reception.getByRole("button", { name: /Save/ }).click();
    await expect(reception.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // === DOCTOR: consult, diagnose, prescribe, set the fee ================
    const doctorContext = await browser.newContext();
    const doctor = await doctorContext.newPage();
    await signIn(doctor, "doctor");
    await doctor.goto("/doctor");
    const doctorRow = doctor.getByRole("row").filter({ hasText: patientName });
    await expect(doctorRow).toBeVisible({ timeout: 30_000 });
    await doctorRow.getByRole("button", { name: /Open|Consult/ }).first().click();

    await doctor.getByLabel("Symptoms / Chief Complaint").fill("Fever and body ache for three days");
    await doctor.getByLabel("Examination").fill("Throat congested, chest clear");

    // The picker opens on ICD-10 and searches the local directory. The "+"
    // beside the box only adds free text and is disabled until something is
    // typed, so it is not the way in -- the search button is.
    await doctor.getByRole("button", { name: /^Search ICD-10$/ }).click();
    await doctor.getByPlaceholder("Search ICD-10").fill("fever");
    const diagnosis = doctor.getByRole("option").first();
    await diagnosis.waitFor({ timeout: 20_000 });
    const diagnosisText = (await diagnosis.innerText()).split("\n")[0].trim();
    await diagnosis.click();
    // Not a text match: the added chip packs the name, ICD code and status
    // into one element ("Fever of other and unknown origin (R50) provisional"),
    // so an exact match on the name alone can never succeed even though the
    // diagnosis was added correctly. The remove button's label is the one
    // place the name appears on its own.
    await expect(doctor.getByRole("button", { name: `Remove ${diagnosisText}` })).toBeVisible();

    await doctor.getByRole("button", { name: "Add Medicine" }).click();
    await doctor.getByRole("combobox", { name: "Search medicine" }).first().click();
    await doctor.getByPlaceholder("Type at least 2 letters").fill(brand);
    const suggestion = doctor.getByRole("option").filter({ hasText: brand }).first();
    await suggestion.waitFor({ timeout: 20_000 });
    await suggestion.click();
    await doctor.getByRole("textbox", { name: /^Dose/ }).first().fill("1 tablet");
    // Quantity is the last numeric cell on the prescription line ("Qty").
    const qty = doctor.locator('input[type="number"]').last();
    await qty.fill(String(PRESCRIBED));

    await doctor.locator("#consultation-fee").fill("500");
    await doctor.getByRole("button", { name: "Complete Consultation" }).click();
    await expect(doctor.getByText(/completed/i).first()).toBeVisible({ timeout: 30_000 });

    // Prescribing alone must not move stock (AGENTS.md 28A).
    expect(await batchQuantity(pharmacy, brand), "prescribing must not reduce stock").toBe(OPENING_UNITS);

    // === PHARMACY: dispense, and the shelf falls by exactly that much =====
    await pharmacy.goto("/pharmacy");
    const rxRow = pharmacy.getByRole("row").filter({ hasText: patientName });
    await expect(rxRow).toBeVisible({ timeout: 30_000 });
    await expect(rxRow, "the counter is told what the doctor charged").toContainText("500");
    await rxRow.getByRole("button", { name: "Dispense" }).click();
    const dispenseDialog = pharmacy.getByRole("dialog");
    await expect(dispenseDialog).toContainText(brand);
    await expect(pharmacy.getByLabel(/Consultation fee collected/)).toHaveValue("500.00");
    await pharmacy.getByRole("button", {
      name: /^(Confirm (Full )?Dispense(?: With Extra)?|Dispense Available Quantity)$/,
    }).click();
    await expect(dispenseDialog).toHaveCount(0, { timeout: 30_000 });

    const afterDispense = await batchQuantity(pharmacy, brand);
    expect(afterDispense, "stock falls by exactly what was handed over").toBe(OPENING_UNITS - PRESCRIBED);
    await pharmacy.goto("/pharmacy/sales");
    await expect(pharmacy.getByRole("row").filter({ hasText: patientName })).toBeVisible({ timeout: 30_000 });

    // === RECEPTION: admit the same patient, creating an IP ticket =========
    await reception.goto(`/patients?q=${phone}`);
    const patientRow = reception.getByRole("row").filter({ hasText: patientName }).first();
    await patientRow.waitFor({ timeout: 30_000 });
    await patientRow.getByRole("link").or(patientRow.getByRole("button")).first().click();
    await reception.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: 30_000 });
    // The profile owns a separate Open action for its visit. Base UI can
    // expose a Button rendered as a Link under either semantic role, so take
    // the labelled action from the current page rather than the old row.
    await reception
      .getByRole("link", { name: "Open" })
      .or(reception.getByRole("button", { name: "Open" }))
      .first()
      .click();
    await reception.waitForURL(/\/visits\/[0-9a-f-]{36}/, { timeout: 30_000 });

    await reception.getByRole("button", { name: "Convert to IP" }).click();
    await reception.getByLabel("Admission reason *").fill("E2E flow: observation overnight");
    await reception.getByRole("button", { name: "Admit", exact: true }).click();
    await expect(reception.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // === IP: open the ticket and ask pharmacy for the same medicine ======
    const ipContext = await browser.newContext();
    const ip = await ipContext.newPage();
    await signIn(ip, "ip");
    await ip.goto("/ip/current");
    const ticketRow = ip.getByRole("row").filter({ hasText: patientName }).first();
    await ticketRow.waitFor({ timeout: 30_000 });
    // Reception can create an unassigned admission. The IP clinician claims
    // it before recording clinical or financial work; this also proves the
    // ownership guard on discharge is exercised under the real IP account.
    await ticketRow.getByRole("button", { name: "Assign" }).click();
    const assignDialog = ip.getByRole("dialog");
    await assignDialog.getByRole("button", { name: "Assign to me" }).click();
    await assignDialog.getByRole("button", { name: "Save Assignment" }).click();
    await expect(assignDialog).toHaveCount(0, { timeout: 30_000 });
    await ticketRow.getByRole("button", { name: /Open/ }).first().click();
    await ip.waitForURL(/\/ip\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const ticketId = ip.url().split("/ip/")[1].split(/[?#]/)[0];

    await ip.getByRole("button", { name: "Request Items" }).click();
    const requestDialog = ip.getByRole("dialog");
    await requestDialog.getByRole("combobox", { name: "Search medicine" }).click();
    await ip.getByPlaceholder("Type at least 2 letters").fill(brand);
    await ip.getByRole("option").filter({ hasText: brand }).first().click();
    await requestDialog.getByRole("button", { name: "Send Request" }).click();
    await expect(ip.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // === PHARMACY: supply the ward request; stock falls again ============
    await pharmacy.goto("/pharmacy/ip-requests");
    const fulfillRow = pharmacy.getByRole("row").filter({ hasText: patientName }).first();
    await fulfillRow.waitFor({ timeout: 30_000 });
    await fulfillRow.getByRole("button", { name: "Fulfill" }).click();
    const fulfillDialog = pharmacy.getByRole("dialog");
    await expect(fulfillDialog).toContainText(brand);
    await fulfillDialog.getByRole("button", { name: /Fulfill|Supply|Confirm/ }).last().click();
    await expect(pharmacy.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
    expect(
      await batchQuantity(pharmacy, brand),
      "supplying the ward takes more off the same shelf",
    ).toBeLessThan(afterDispense);

    // === IP: bill the ticket and collect against it =======================
    await ip.goto(`/ip/${ticketId}`);
    await ip.getByRole("button", { name: "Add Charge" }).click();
    const chargeDialog = ip.getByRole("dialog");
    const firstCharge = chargeDialog.locator("[data-charge-row]").nth(0);
    const chargeItem = await firstCharge.getByLabel("Item").inputValue();
    const chargeRate = await firstCharge.getByLabel("Rate").inputValue();
    expect(chargeItem, "a configured IP charge must exist").not.toBe("");
    await firstCharge.getByLabel("Quantity").fill("1");
    await chargeDialog.getByRole("button", { name: /^Add Charge$/ }).click();
    await expect(ip.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    await ip.getByRole("button", { name: "Add Payment" }).click();
    const paymentDialog = ip.getByRole("dialog");
    await paymentDialog.getByLabel("Amount").fill(chargeRate);
    await paymentDialog.getByRole("button", { name: "Record Payment" }).click();
    await expect(ip.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // The running bill carries the charge, the ward supply and the payment.
    // Payments are listed, never overwritten (AGENTS.md 37).
    await ip.goto(`/print/ip-ticket/${ticketId}`);
    const bill = await ip.locator("article").innerText();
    expect(bill).toContain(patientName);
    expect(bill).toContain(chargeItem);
    expect(bill).toMatch(/PAYMENT HISTORY/i);

    // === IP: discharge ====================================================
    await ip.goto(`/ip/${ticketId}`);
    await ip.getByRole("button", { name: "Prepare Discharge" }).click();
    const dischargeDialog = ip.getByRole("dialog");
    await dischargeDialog.getByLabel("Final Diagnosis *").fill("Recovered after observation");
    await dischargeDialog.getByLabel("Course in the Hospital *").fill("Observed overnight; symptoms resolved and vitals remained stable.");
    await dischargeDialog.getByLabel("Discharge Advise *").fill("Return if symptoms recur.");
    await dischargeDialog.getByRole("button", { name: "Save Summary" }).click();
    await expect(ip.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

    // === ADMIN: the whole journey reads back ==============================
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, "admin");
    await admin.goto(`/print/ip-bill/${ticketId}`);
    expect(await admin.locator("article").innerText()).toContain(patientName);
    await admin.goto("/audit");
    await expect(admin.locator("h1:visible").first()).toHaveText("Audit Logs");
    // The medicine this flow created is in the library it can be removed from.
    await admin.goto(`/pharmacy/medicines?q=${encodeURIComponent(brand)}`);
    await expect(admin.getByRole("row").filter({ hasText: brand })).toBeVisible({ timeout: 30_000 });

    for (const context of [adminContext, ipContext, doctorContext, pharmacyContext, receptionContext]) {
      await context.close();
    }
  });
});
