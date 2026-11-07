/**
 * Hospital Software Feature Checklist — Google Form builder.
 *
 * How to use (one time, about 1 minute):
 *   1. Open https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file, and click Save.
 *   3. Choose the function "createFeatureChecklistForm" and click Run.
 *   4. Allow the permissions Google asks for (it creates a Form and a Sheet in your Drive).
 *   5. Open View > Logs (or Execution log): it prints the form's edit link,
 *      the link to send to hospitals, and the responses sheet link.
 *
 * Feature list generated from docs/hospital-feature-checklist.html.
 */
const MODULES = [
 {
  "name": "Core platform",
  "blurb": "Included with every installation.",
  "core": true,
  "items": [
   {
    "t": "c",
    "text": "Staff login with email + password — Admin creates staff accounts. No public sign-up"
   },
   {
    "t": "c",
    "text": "Role-based access — Admin, Reception (with OP desk), Doctor, IP, Pharmacy. Each role sees only its own screens"
   },
   {
    "t": "c",
    "text": "Database-level security — Every rule is enforced on the server and in the database, not only by hiding buttons"
   },
   {
    "t": "c",
    "text": "Audit log — Who created, changed, printed, dispensed or exported what, and when"
   },
   {
    "t": "c",
    "text": "Works on phone, tablet and desktop — Same screens from 375 px phones to wide monitors"
   },
   {
    "t": "c",
    "text": "Live updates between desks — Queues and pharmacy lists refresh as other staff work"
   },
   {
    "t": "c",
    "text": "Offline screen when the internet drops — Visited pages stay cached; staff see a clear retry screen"
   },
   {
    "t": "c",
    "text": "Hospital letterhead on all prints — Name, logo, address and footer set once in Settings"
   }
  ]
 },
 {
  "name": "Patients",
  "blurb": "One patient record holds all visits, admissions, reports and payments.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "UHID patient number — Unique hospital ID printed on tokens and prescriptions. Families can share one phone number"
   },
   {
    "t": "r",
    "text": "Fast search by phone, name or UHID — Results while typing, even with lakhs of patients"
   },
   {
    "t": "r",
    "text": "Patient profile with full history — Visits, IP admissions, reports and payments in tabs"
   },
   {
    "t": "r",
    "text": "Known allergies on the patient — Shown to doctors during consultation"
   },
   {
    "t": "r",
    "text": "Bulk import patients from Excel — Bring old patient lists in one upload with error checking"
   }
  ]
 },
 {
  "name": "Reception, tokens and OP desk",
  "blurb": "From walk-in to the doctor's queue.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Create OP and follow-up visits — Doctor, department and fee filled automatically"
   },
   {
    "t": "r",
    "text": "Register a new patient and create the visit in one step"
   },
   {
    "t": "r",
    "text": "Doctor's current load shown while choosing a doctor — Live OP queue and IP patients per doctor, to spread the load"
   },
   {
    "t": "r",
    "text": "Separate token series per doctor, reset daily — Two desks can never issue the same token"
   },
   {
    "t": "r",
    "text": "One visit with more than one consultant"
   },
   {
    "t": "r",
    "text": "Move a patient to another doctor"
   },
   {
    "t": "r",
    "text": "Token print with no money on it — Thermal or A4"
   },
   {
    "t": "r",
    "text": "Cash, UPI, card and bank transfer recorded — Part payments allowed; balance tracked"
   },
   {
    "t": "r",
    "text": "Payment receipt print"
   },
   {
    "t": "r",
    "text": "Vitals entry — Weight, height, temperature (°F), BP, pulse, SpO₂, respiratory rate"
   },
   {
    "t": "r",
    "text": "Follow-up list and “report ready” alerts — Reception sees who should come back"
   },
   {
    "t": "r",
    "text": "Old waiting visits closed automatically at day end"
   },
   {
    "t": "r",
    "text": "Patient Assist screen — Guides consulted patients to pharmacy or the next counter. Shows no money"
   },
   {
    "t": "r",
    "text": "Edit consultation fee and collect pending fees later"
   },
   {
    "t": "r",
    "text": "Drug stock lookup for reception, doctors and IP staff — Read-only, no purchase prices"
   },
   {
    "t": "s",
    "text": "[On request] Online appointment booking — Patients book a slot from a link"
   },
   {
    "t": "s",
    "text": "[On request] SMS / WhatsApp token and follow-up reminders"
   }
  ]
 },
 {
  "name": "Doctor consultation",
  "blurb": "A fast single screen for the doctor.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "My Queue with waiting time and vitals"
   },
   {
    "t": "r",
    "text": "Previous visits, diagnoses, prescriptions and reports"
   },
   {
    "t": "r",
    "text": "Type-ahead for symptoms, diagnoses and tests — Local directory; works without internet search"
   },
   {
    "t": "r",
    "text": "ICD-10 diagnosis search — WHO ICD-10 list with saved local results; SNOMED-ready terms"
   },
   {
    "t": "r",
    "text": "Prescription table with 1-0-1 style presets — Dose, frequency, duration, route and notes per line"
   },
   {
    "t": "r",
    "text": "See pharmacy stock while prescribing — Prescribing never reduces stock"
   },
   {
    "t": "r",
    "text": "Order tests and investigations"
   },
   {
    "t": "r",
    "text": "Follow-up: after report, on a date, or after N days"
   },
   {
    "t": "r",
    "text": "Save draft, then complete"
   },
   {
    "t": "r",
    "text": "A4 prescription print on hospital letterhead, with reprint"
   },
   {
    "t": "r",
    "text": "Prescription number and validity date"
   },
   {
    "t": "r",
    "text": "Recommend admission to IP"
   },
   {
    "t": "s",
    "text": "[On request] Prescription in Tamil or another regional language"
   },
   {
    "t": "s",
    "text": "[On request] Voice dictation for notes"
   }
  ]
 },
 {
  "name": "Reports and documents",
  "blurb": "Lab reports, X-rays, scans and photos stored privately.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Upload PDF or photo reports linked to visit or IP stay"
   },
   {
    "t": "r",
    "text": "Camera upload from mobile"
   },
   {
    "t": "r",
    "text": "Images compressed on the phone before upload — Keeps files under 1 MB, readable"
   },
   {
    "t": "r",
    "text": "Private storage with time-limited viewing links"
   },
   {
    "t": "r",
    "text": "Report status: pending, ready, reviewed"
   },
   {
    "t": "s",
    "text": "[On request] Full lab module (sample collection, results entry, machine interface)"
   }
  ]
 },
 {
  "name": "Pharmacy and stock",
  "blurb": "Stock goes down only when medicine is actually handed over.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Medicine list kept separate from actual stock"
   },
   {
    "t": "r",
    "text": "Batches with expiry, pack size and price"
   },
   {
    "t": "r",
    "text": "Earliest-expiry batch suggested first (FEFO)"
   },
   {
    "t": "r",
    "text": "Pending prescriptions from doctors"
   },
   {
    "t": "r",
    "text": "Full, partial and “not available” dispensing — Only the quantity given is deducted"
   },
   {
    "t": "r",
    "text": "Walk-in / manual prescription sales"
   },
   {
    "t": "r",
    "text": "Collect the doctor fee at the pharmacy counter"
   },
   {
    "t": "r",
    "text": "Sales list and pharmacy receipt"
   },
   {
    "t": "r",
    "text": "Outside-purchase slip for items not in stock"
   },
   {
    "t": "r",
    "text": "Low stock, out of stock and expiry alerts — Expiry alert for batches expiring within 30 days"
   },
   {
    "t": "r",
    "text": "Stock movement ledger — Every in and out is traceable"
   },
   {
    "t": "r",
    "text": "Medicine form learns new values — A new dosage form or strength typed once is offered in the list next time"
   },
   {
    "t": "r",
    "text": "Archive and restore medicines — Medicines with history are never hard-deleted"
   },
   {
    "t": "r",
    "text": "Bulk import medicines from Excel / CSV — Up to 1,000 rows per file, template, preview and error rows"
   },
   {
    "t": "s",
    "text": "[On request] Purchase orders and supplier management"
   },
   {
    "t": "s",
    "text": "[On request] GST tax invoice format"
   }
  ]
 },
 {
  "name": "General inventory and procedures",
  "blurb": "Consumables and procedures billed at the counter or to an IP bill.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Inventory items (gloves, syringes, dressings…)"
   },
   {
    "t": "r",
    "text": "Procedure billing with receipt"
   },
   {
    "t": "r",
    "text": "IP ward item requests to pharmacy / store"
   },
   {
    "t": "r",
    "text": "Shortage print for unavailable items"
   }
  ]
 },
 {
  "name": "In-patient (IP)",
  "blurb": "One IP ticket holds every charge and payment for the stay.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Admission from doctor referral, direct or emergency"
   },
   {
    "t": "r",
    "text": "Rooms and beds management"
   },
   {
    "t": "r",
    "text": "Charges: doctor, room, bed, ward, treatment, test, pharmacy, other"
   },
   {
    "t": "r",
    "text": "Charge master with fixed rates; custom charges allowed"
   },
   {
    "t": "r",
    "text": "Add many charges at once"
   },
   {
    "t": "r",
    "text": "Pharmacy issues added to the IP bill automatically"
   },
   {
    "t": "r",
    "text": "Doctor progress notes; visit fee added once"
   },
   {
    "t": "r",
    "text": "Advance and part payments"
   },
   {
    "t": "r",
    "text": "Assign IP staff to patients"
   },
   {
    "t": "r",
    "text": "Discharge workflow with balance check"
   },
   {
    "t": "r",
    "text": "Prints: running bill, final bill, discharge summary, items issued"
   },
   {
    "t": "s",
    "text": "[On request] Insurance / TPA claim tracking"
   },
   {
    "t": "s",
    "text": "[On request] Nursing charts (medication rounds, intake-output)"
   },
   {
    "t": "s",
    "text": "[On request] Operation theatre scheduling"
   }
  ]
 },
 {
  "name": "Discounts",
  "blurb": "Discounts are tracked separately from cash collected.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Discount in ₹ or % on 5 bill types — Visit fee, pharmacy sale, procedure bill, IP bill and IP item counter bill"
   },
   {
    "t": "r",
    "text": "Reason required — Senior citizen, staff, doctor advised, charity, round-off, or other with a note"
   },
   {
    "t": "r",
    "text": "Maximum discount limit for staff; admin has no limit — Limit counts the whole bill, not each payment"
   },
   {
    "t": "r",
    "text": "Admin can void a visit or open IP bill discount — The original entry is kept; the balance reopens"
   },
   {
    "t": "r",
    "text": "Discount register, reports and Subtotal / Discount / Net on receipts — Collections always show cash received; discounts are reported separately"
   }
  ]
 },
 {
  "name": "Dashboards and reports",
  "blurb": "Each role gets its own dashboard; admin sees everything.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Role dashboards with live counts"
   },
   {
    "t": "r",
    "text": "Admin analytics: OP, doctors, IP, pharmacy, collections, patients"
   },
   {
    "t": "r",
    "text": "Date filters: today, 7 days, 30 days, month, custom"
   },
   {
    "t": "r",
    "text": "Click a number to see the patient list behind it"
   },
   {
    "t": "r",
    "text": "Staff activity report — Who registered, collected or dispensed what"
   },
   {
    "t": "r",
    "text": "Doctor workload"
   },
   {
    "t": "r",
    "text": "Storage and database usage meter"
   },
   {
    "t": "s",
    "text": "[On request] Daily summary sent to owner on WhatsApp / email"
   }
  ]
 },
 {
  "name": "Administration and data",
  "blurb": "Set up once; change without a developer.",
  "core": false,
  "items": [
   {
    "t": "r",
    "text": "Users: add, edit, activate, deactivate, set a new password"
   },
   {
    "t": "r",
    "text": "Doctors with OP, follow-up and IP visit fees"
   },
   {
    "t": "r",
    "text": "Masters: departments, charges, rooms and beds, report categories — Archive and restore instead of delete"
   },
   {
    "t": "r",
    "text": "Audit log retention setting"
   },
   {
    "t": "r",
    "text": "Clinical and medicine directory editor with bulk import"
   },
   {
    "t": "r",
    "text": "Settings: hospital details, print footers, presets"
   },
   {
    "t": "r",
    "text": "Monthly data export ZIP (CSV), optionally with documents"
   },
   {
    "t": "r",
    "text": "Notifications inside the app"
   },
   {
    "t": "s",
    "text": "[On request] Multiple branches under one login"
   },
   {
    "t": "s",
    "text": "[On request] Tamil / regional language screens"
   }
  ]
 }
];

function createFeatureChecklistForm() {
  const form = FormApp.create("Hospital Software – Feature Checklist");
  form.setDescription(
    "This list comes from a hospital management system already running in production " +
    "(OP, doctor consultation, pharmacy, IP billing, discounts and reports).\n\n" +
    "Tick the features your hospital needs.\n" +
    "• Core platform features are always included.\n" +
    "• Items marked [On request] are not built yet and can be added as custom work."
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage("Thank you. We have received your feature selection and will contact you soon.");

  // Part A — hospital details
  form.addSectionHeaderItem().setTitle("Part A · About your hospital");
  form.addTextItem().setTitle("Hospital name").setRequired(true);
  form.addTextItem().setTitle("City / district").setRequired(true);
  form.addTextItem().setTitle("Contact person").setRequired(true);
  const phone = form.addTextItem().setTitle("Phone / WhatsApp number").setRequired(true);
  phone.setValidation(FormApp.createTextValidation().requireTextMatchesPattern("^[0-9+ ]{10,15}$").setHelpText("Enter a 10-digit mobile number").build());
  form.addTextItem().setTitle("Email").setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem().setTitle("Hospital type").setRequired(true)
    .setChoiceValues(["Clinic (OP only)", "Nursing home (OP + small IP)", "Multi-speciality hospital", "Speciality centre"]).showOtherOption(true);
  ["Number of doctors", "Number of beds", "OP patients per day (approx.)", "Staff who will log in"].forEach(t => {
    form.addTextItem().setTitle(t).setValidation(FormApp.createTextValidation().requireNumberGreaterThanOrEqualTo(0).setHelpText("Enter a number").build());
  });
  form.addTextItem().setTitle("Software used today").setHelpText("Paper, Excel, another software…");
  form.addDateItem().setTitle("Wanted go-live date");
  form.addMultipleChoiceItem().setTitle("Do you have a pharmacy inside the hospital?").setChoiceValues(["Yes", "No", "Planned"]);
  form.addMultipleChoiceItem().setTitle("Old patient data to bring in?").setChoiceValues(["None", "Excel / CSV", "Another software", "Paper only"]);

  // Part B — one page per module
  MODULES.forEach((mod, i) => {
    form.addPageBreakItem().setTitle("Part B · " + (i + 1) + " of " + MODULES.length + " · " + mod.name).setHelpText(mod.blurb);
    if (mod.core) {
      form.addSectionHeaderItem().setTitle("Always included")
        .setHelpText(mod.items.map(it => "✓ " + it.text).join("\n"));
      return;
    }
    const q = form.addCheckboxItem().setTitle(mod.name + " — select the features you need")
      .setHelpText("Tick all that apply. Leave blank if you don't need this area.");
    q.setChoices(mod.items.map(it => q.createChoice(it.text)));
    q.showOtherOption(true);
  });

  // Part C — notes
  form.addPageBreakItem().setTitle("Part C · Anything else?");
  form.addParagraphTextItem().setTitle("Notes")
    .setHelpText("Your own workflow, reports you print today, or problems you want solved.");

  const sheet = SpreadsheetApp.create("Hospital Software – Feature Checklist (Responses)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log("Edit the form:     " + form.getEditUrl());
  Logger.log("Send to hospitals: " + form.getPublishedUrl());
  Logger.log("Responses sheet:   " + sheet.getUrl());
}
