# Meenakshi Hospital — role workflows and edge-case checklist

Prepared: 24 September 2026. Scope: **admin, reception, OP, doctor, IP, and pharmacy**.

This is the workflow plan requested before implementation/testing. It describes what staff do, what should happen, and where the same change must appear. It includes normal, alternative, failure, retry, concurrent-user, and permission cases. **Every scenario starts as Not run.** Expected results are acceptance targets unless explicitly described as current behavior. Source inspection is not proof that a scenario passes; no live hospital records were changed to prepare this document.

The main example is: **Pharmacy adds stock → edits it → opens an IP request → sees the latest usable quantity and price → supplies items → every affected screen and bill agrees.** “Value reflected” covers quantity, availability, item identity, current selling price, and the correct billed amount.

Start with the [worked stock examples](#3-worked-example-pharmacy-stock--ip--stock-and-billing), then the role tables below. The [edge-case matrix](#13-edge-case-matrix) applies across those tables; [current-code differences](#15-current-code-differences-and-decisions-to-resolve) identify behavior needing verification or a product decision.

## 1. How to use this checklist

- Each ID is a separately traceable scenario. For a row containing several variants, record each variant separately when executing it.
- Follow the steps in order, check the result, then check the named destination screens using a separate permitted user session.
- Run cross-screen checks with the destination already open, after switching back to a hidden tab, after reopening the dialog, and after a full reload. A reload passing does not prove live refresh works.
- Record **Pass / Fail / Blocked / Not applicable**, actual values, evidence, and a defect reference. A missing feature is a gap, not a passed test.
- Use isolated synthetic fixtures in a test database. Destructive cases below are test scenarios, not permission to clean hospital data. The separate cleanup instructions in [CLEAN.md](CLEAN.md) still apply.
- This is a comprehensive V1 baseline, not a claim that every imaginable combination has been enumerated. Apply the shared edge cases to every relevant role flow and add discovered cases under the same IDs.

### Role and workspace map

| Role | Main workspaces to cover | Main handoffs |
| --- | --- | --- |
| Admin | Dashboard; patients; every operational module; users; doctor master; masters; clinical directory; medicine directory; exports; settings; audit | Configuration, access, prices, and master changes reach the appropriate staff screens |
| Reception | Patients; today's visits; OP queue/vitals; patient assist; follow-ups; reports ready; fees/payments; IP patients; drug stock | Registration → OP/doctor; report → follow-up; referral → IP |
| OP | Today OP; patient assist; vitals; reports; drug stock | Ready patient + vitals → doctor; report upload → review |
| Doctor | Today OP; follow-ups; patient search; reports; own IP patients; drug stock | Completed prescription → pharmacy; tests → report workflow; referral → reception/IP |
| IP | Current patients; my patients; all tickets; pending discharge; discharged; drug stock | Item request → pharmacy; charges/payments → bill; discharge → bed release/history |
| Pharmacy | Pending prescriptions; IP item requests; medicine master; stock/batches; inventory; bulk import; sales | Actual supply → stock movement + sale/charge/collection + updated request |

The workspace map reflects routes found in the current repository. Additional privileges in those routes do not override the access requirements in AGENTS.md; conflicts are listed in section 15.

## 2. Rules every flow must preserve

1. A patient's internal UUID connects their history. Correcting a phone/name must not create a second history or move another person's records.
2. Token print contains no fee, collected amount, balance, or payment mode.
3. Prescribing, saving a draft, requesting items, and previewing a bill do not consume or reserve stock.
4. Confirmed supply from tracked hospital stock consumes only the actual supplied quantity. Outside-purchase notes never consume hospital stock. Existing manual/off-catalog supply is a separate, explicitly untracked path to review.
5. Medicine directory, medicine batches, and general inventory are distinct. Names alone must never identify a stock row.
6. Usable stock excludes expired/inactive/unavailable stock according to the agreed expiry rule. Physical stock and usable stock must not be confused.
7. Stock edits and receipts have an attributable movement history. Negative stock and duplicate supply are forbidden.
8. Saved sale/charge prices are historical snapshots. Editing today's selling price must not rewrite yesterday's sale, receipt, or finalized bill.
9. Payments are separate append-only entries. Collection, charge, amount due, and stock value are different measures.
10. Completed clinical records and discharged tickets cannot be silently rewritten. Follow-up and readmission create new linked records.
11. Every mutation rechecks current role, ownership, record status, and current balance/stock on the server/database.
12. Validation or transactional failure must not leave an unreported partial visit, payment, stock movement, charge, or user/doctor link.
13. Financial visibility is role-scoped. Doctor/OP clinical access must not expose purchase cost, margins, payment analytics, or financial print URLs.
14. A visible success message must agree with persisted data after reload and in the other role's session.
15. Money uses exact paise arithmetic; dates, daily tokens, and monthly reports follow Asia/Kolkata boundaries.

## 3. Worked example: pharmacy stock → IP → stock and billing

These are synthetic arithmetic fixtures, not treatment recommendations. Use a new test medicine/item so unrelated transactions cannot change the expected totals. Dates must be in the future relative to execution.

### FLOW-STOCK-01 — medicine batch changes reach IP fulfillment

| Step | User action | Expected persisted result | Verify on other screens |
| --- | --- | --- | --- |
| 1 | Pharmacy creates `QA Medicine A`, then batch A with **10 packs × 10 units = 100 units**, selling price **₹20/pack = ₹2/unit**, low-stock threshold **10**, future expiry | One medicine, one batch, opening stock 100 | Medicine Master confirms identity; Stock & Batches and permitted Drug Stock/IP search confirm quantity |
| 2 | **Stock & Batches → Edit / Adjust**: receive **+50 individual units**, with a reason | Quantity **150**, stock-in adjustment movement **+50** | Reopen the pharmacy IP fulfillment picker: same batch/item resolves to 150 usable units |
| 3 | Edit metadata: selling price **₹30/pack = ₹3/unit**, threshold **20**, quantity adjustment **0**; save | Quantity remains **150**; current piece price is ₹3 | Fresh IP fulfillment selection/quote uses ₹3; stock page agrees |
| 4 | Make a second authorized stock adjustment of **−5 individual units**, with a reason | Quantity **145**, adjustment movement −5; no sale | IP fulfillment availability and read-only stock show 145; reopening the same dialog must not reuse the previous operation as a retry |
| 5 | IP staff/doctor requests **10 units** for an admitted ticket; pharmacy opens the request | Requested 10, supplied 0, usable stock **145** | The IP ticket's request and pharmacy queue identify the same request and medicine |
| 6 | Pharmacy selects the medicine and supplies **6 units**, choosing **charge to IP ticket**; FEFO consumes batch A | Stock **139**; supplied 6; **4 marked not supplied**; request fulfilled; one charge **₹18** | Batch ledger; Drug Stock; IP request; shortage note; ticket charge; running bill; relevant dashboard |
| 7 | Retry the same confirmed transaction after a simulated lost response | Still stock **139**, supplied 6, charge ₹18 | No second movement, charge, sale, or collection |
| 8 | If those 4 units are still needed, IP creates a **new request for 4 on the same ticket**; pharmacy supplies it | Stock **135**; supplied across the two requests 10; total charge **₹30** | First request remains 6 supplied/4 not supplied; new request is 4 supplied; neither history nor first shortage note is silently rewritten. Current model has no explicit previous-request link |
| 9 | Edit batch price to **₹40/pack = ₹4/unit** and reopen history | Current quote becomes ₹4 for a new transaction | Existing six-unit charge stays ₹18; four-unit charge stays ₹12; historical total stays ₹30 |

**Required distinctions:** batch edits use a quantity **delta**; inventory edits use a new **absolute counted quantity**. Updating metadata alone does not change the quantity. A partially fulfilled IP item request closes with a shortage in the current code, whereas a partially dispensed prescription can remain pending. Do not treat those as the same state machine or assume bulk import is a stock-correction tool.

### FLOW-STOCK-02 — general inventory changes reach IP fulfillment

| Step | User action | Expected result |
| --- | --- | --- |
| 1 | Pharmacy adds `QA Consumable A`, unit `piece`, opening stock **40**, price **₹5** | Inventory has 40 pieces; no medicine batch is created |
| 2 | Receive 20 pieces: Inventory → Edit → set **Counted quantity to 60**, price **₹6**, descriptive metadata, and reason | Stock **60**, movement **+20**, current price ₹6, same item identity. Entering 20 would set stock to 20, not add 20 |
| 3 | IP requests **8**; pharmacy opens **IP Item Requests** and supplies **5** with IP-ticket settlement | Availability reads 60 before supply; after supply stock **55**, 3 marked not supplied, request fulfilled, ticket charge **₹30** |
| 4 | Print the outside-purchase/shortage note for those **3** unsupplied units | Document identifies only the unsupplied quantity; hospital stock stays 55 and hospital charge stays ₹30 |
| 5 | Rename/edit the item again | New searches reflect current metadata; old fulfillment/receipt remains attributable and financially unchanged |

### FLOW-STOCK-03 — the same stock on two counters

1. Open **distinct valid pending requests/prescriptions** competing for the same item with **10 usable units** in pharmacy sessions A and B.
2. A supplies 8 units. Persisted remaining stock is **2**.
3. B attempts to supply 5 using its old screen. The server rejects or requests a new valid allocation; it must not deduct to −3 or claim full supply.
4. Refresh/reselect in B, deliberately choose 2 if a partial supply is appropriate, and submit a new operation.
5. Final stock is **0** and total actual supply is **10**. Requests, movements, bills, and alerts agree.
6. Repeat with OP dispensing versus IP fulfillment competing for the same medicine batch, and with an add-stock operation racing a dispense.

### FLOW-STOCK-04 — usable stock, multiple batches, and search

- Batch A: 20 active/unexpired units; batch B: 30 active/unexpired units; batch C: 40 expired units; batch D: 50 inactive units.
- Physical total is **140**; usable medicine total is **50**. Each screen must label which measure it shows.
- Automatic allocation suggests eligible batches by earliest expiry. Supplying 25 from A then B leaves usable stock **25**, physical stock **115**.
- Prescription dispensing allows a valid manual batch override/split; it consumes only chosen eligible batches. IP item-request fulfillment selects a medicine and allocates batches by FEFO, with no manual batch selector. Neither path may substitute another medicine, strength, form, or general-inventory item by name alone.
- Search for the item on page 1 and beyond the first 25 IP stock results. Clear/change the query, fetch more, and reopen the dialog: no skipped/duplicate rows or old query results.

## 4. Shared sign-in, session, and navigation flows

| ID | Steps | Expected result and cross-check |
| --- | --- | --- |
| AUTH-01 | Sign in separately as each of the six roles → dashboard → each allowed navigation item | Correct dashboard, navigation, data scope, actions, and direct routes for that role |
| AUTH-02 | Open an allowed deep link while signed out → sign in | Return to a permitted local destination; external/protocol-relative return URLs are rejected |
| AUTH-03 | Enter wrong/blank/malformed credentials; retry; submit twice | Clear bounded errors, no session on failure, no duplicate redirects or leaked account details |
| AUTH-04 | Sign out → browser Back → reload → open a protected API/print URL | Private pages, APIs, files, and mutations require authentication again |
| AUTH-05 | Let session expire during a form/search/upload/dispense → retry after sign-in | No false success; authorization is rechecked; retry does not duplicate the operation |
| AUTH-06 | Admin deactivates a signed-in user → user navigates/submits from an old tab | New reads/writes are denied; existing attribution remains intact |
| AUTH-07 | Admin changes a staff role → old session attempts its old actions | New role controls server/API/RLS access; sidebar/cache cannot preserve old privileges |
| AUTH-08 | Log out role A → log in role B on the same browser | No previous patient's data, notifications, search results, or financial cache leaks to B |
| AUTH-09 | Open another role's route, API, print, signed-file entry point, and mutation directly | Denied at every applicable layer; hiding navigation is not the only guard |
| AUTH-10 | Open nonexistent/invalid/other-patient IDs and a doctor without a valid doctor link | Safe error or empty scope; never an unrestricted fallback or another patient's record |

## 5. Admin flows

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| ADM-01 | Users → Add User for each permitted non-doctor role → sign in as new user | Auth account and active profile agree; role dashboard/actions match. OP provisioning is a current gap to resolve (section 15) |
| ADM-02 | Doctor Master → Add Doctor with department, credentials, registration, and fees | Auth → profile → doctor → profile link succeeds completely; doctor is selectable in reception and has the correct queue |
| ADM-03 | Create a duplicate-email user/doctor or fail during doctor linking | Clear failure; no silent orphan login/profile/doctor; retry cannot create duplicates |
| ADM-04 | Edit staff name/role → deactivate → reactivate → sign in | Changes persist; historical actor identity remains attributable; deactivation blocks ongoing access; reactivation restores only intended privileges |
| ADM-05 | Edit staff → set a new password → try old/new credentials | Password reset outcome is explicit; profile edits and password failure are not reported as all-or-nothing success |
| ADM-06 | Try self-deactivation/self-demotion/removal or removal of the last admin | Cannot accidentally eliminate administrative access; no partially applied identity changes |
| ADM-07 | Edit doctor name, qualification, registration, department, OP/follow-up/IP fee | New selections/quotes and permitted print identity reflect changes; prior collected payments and posted charges stay unchanged |
| ADM-08 | Deactivate a doctor with waiting visits/active IP patients | No new assignment to an inactive doctor; existing work/history stays accessible through an explicit reassignment policy |
| ADM-09 | Masters → add/edit/deactivate department | Doctor setup and new visit selection update; existing visits retain valid references |
| ADM-10 | Masters → add/edit/deactivate charge and rate | New IP/procedure charge selection reflects the rate; posted historical lines are not repriced |
| ADM-11 | Masters → add/edit/deactivate report category | Upload options refresh; old reports still show their category/history |
| ADM-12 | Masters → add/edit/disable room and bed | Admission/transfer availability reflects valid beds; occupied-bed handling preserves active tickets |
| ADM-13 | Clinical Directory → add/edit aliases/type → search as doctor → deactivate/restore | Local suggestions reflect changes; saved clinical wording and diagnosis references remain readable |
| ADM-14 | Clinical Directory → template/import → preview/validate → commit | Correct type/source/license/version metadata; invalid rows explained; no unreviewed proprietary dataset download |
| ADM-15 | Remove an unused master; remove one referenced by history; restore where supported | Only the approved removal mode applies; referenced records retain history; all dependent searches stop offering inactive entries |
| ADM-16 | Medicine Directory/Stock → add/edit/deactivate via admin → open same lists as pharmacy | One shared catalogue/stock source; same persisted values, no separate admin copy |
| ADM-17 | Settings → change hospital identity/footers → print each document type | Current authorized print settings apply consistently; token remains money-free regardless of other print options |
| ADM-18 | Dashboard/Reports → date range → KPI/chart drill-down → filtered table | Counts/collections reconcile to source rows, dates, and distinct patients versus visits; no duplicate OP/IP revenue |
| ADM-19 | Monthly Export → Data Only → generate → download ZIP | Private complete package, correct month, referenced patients, manifest/counts, audit; all pages of data included |
| ADM-20 | Monthly Export → Data + Documents → download → inspect | Documents match metadata; missing/unreadable files are reported explicitly; bounded resource use |
| ADM-21 | Regenerate/retry export; submit the same month/type twice | One active job or clear duplicate handling; failed jobs are visible; completed ZIPs remain downloadable |
| ADM-22 | Delete a generated export ZIP → inspect original records | Only generated archive is removed; patients/reports/visits/stock/database remain unchanged; default retention is no automatic deletion |
| ADM-23 | Audit Logs → filter by actor/entity/date → inspect a transaction | Actor, target, outcome, and timestamp trace the action without unnecessary medical payloads or secrets |
| ADM-24 | Open every module as admin → perform the same supported role workflow | Full access still obeys business invariants: stock, idempotency, clinical immutability, and audit rules are not bypassed |

## 6. Reception flows

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| REC-01 | Search existing patient by phone/name/current UHID → select correct person | Server results bounded/ranked; identity clear for same names/shared phones; no duplicate registration by accident |
| REC-02 | Quick registration with name/phone → select doctor → issue visit | Patient saved; missing optional demographics visibly pending; visit/token and doctor queue update |
| REC-03 | Expand registration → enter DOB or approximate age, gender, address, blood group, allergies | Correct patient record and age interpretation; profile/clinical header/print agree |
| REC-04 | Patients → Add Patient without visit → find later | One patient master, no token/fee/consultation; later visit uses the same UUID |
| REC-05 | Patient Profile → Edit demographics/phone/allergies → reopen history | Same patient UUID/history; search/display reflect correction; no records migrate to someone with the old phone |
| REC-06 | Archive patient → search/new-visit attempt → inspect old history | New-work policy explicit; old records retained; no silent historical deletion or direct-URL bypass |
| REC-07 | Existing patient → Create Visit → one doctor/type → confirm | One waiting visit in that doctor's daily token series; current registration flow does not collect fee/payment at this step |
| REC-08 | Create visit with multiple consultants → confirm → open each queue/token | One visit per selected doctor; no duplicate consultant; grouping is limited to the intended encounter, not unrelated same-day visits |
| REC-09 | Visit succeeds → Print Token → reprint later | Correct patient, doctor(s), token(s), department/date/time; no money; print does not create another visit |
| REC-10 | Reassign a pre-consultation visit → open old/new doctor queues → reprint | Visit/vitals move consistently; current DB allocates new doctor's token; UI must communicate actual behavior |
| REC-11 | Add consultant after issuance if supported | Correct extra visit/token and explicit encounter grouping; current action exists without a confirmed UI path, so record blocked if unreachable |
| REC-12 | Today's Visits → filter/search/status → open patient/visit | Operational counts and status match OP/doctor screens; completed history remains accessible |
| REC-13 | Reception OP Queue → record vitals/mark ready under current permissions | Same OP workflow checks apply; no duplicate vitals or status regression |
| REC-14 | Patient Assist → direct patient to pharmacy, billing, or IP | Next step reflects actual prescription, outstanding balance, and admission state; already settled work not needlessly repeated |
| REC-15 | Completed consultation → Fees & Payments → collect part → collect remainder later | Fee due/collected/balance correct; separate payment rows; pharmacy fee collection also reflected; no duplicate collection |
| REC-16 | Follow-ups → choose due/report-triggered case → create linked visit | Same patient and previous doctor by default; new visit/token; original completed consultation unchanged |
| REC-17 | Reports Ready → inspect report context → create follow-up where required | Correct previous visit/test/patient; doctor sees new visit and new report; no duplicate follow-up from repeat click |
| REC-18 | Upload permitted report from patient/visit | Private file + valid metadata + ready state; report/doctor/follow-up lists refresh |
| REC-19 | Doctor recommends IP → settle required OP balance → convert/admit under current permissions | One ticket linked to source visit; IP current patients and doctor's admission badge update; no duplicate referral admission |
| REC-20 | Open IP current patients or Drug Stock | Only permitted operational/read-only fields/actions; cannot edit stock or gain IP finances through another URL |
| REC-21 | Patient bulk import → template → preview → validate → confirm | Explicit identity/duplicate policy; row-level result; patient directory gains only valid intended people; no visits automatically invented |
| REC-22 | Quick registration patient save succeeds but visit issuance fails → retry with saved patient | Clear partial outcome; preserve the registered patient and retry only visit creation, not registration again |

## 7. OP staff flows

Retain independent OP scenarios because the requested V1 model has six roles. The current migration merging OP into reception is a decision conflict, not a reason to omit OP coverage.

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| OP-01 | Sign in as OP → today's queue → search token/patient/phone | Correct operational queue and permitted patients; no financial columns/payloads |
| OP-02 | Open waiting patient → confirm identity/doctor/allergies → record supported vitals | Weight, height, temperature unit, BP, pulse, SpO2, optional respiratory rate/notes saved against correct visit |
| OP-03 | Save & Mark Ready → doctor opens queue/visit | Ready status and same vitals visible; token/patient do not change |
| OP-04 | Correct vitals before consultation → reload in doctor session | Latest permitted values reflected with attributable update; no duplicate vitals row |
| OP-05 | Correct vitals while doctor is in consultation | Preserve in-consultation status; do not move active visit backwards to Ready |
| OP-06 | Try vitals edit after completion/cancellation; separately doctor A tries doctor B's visit | Finalized-status guard applies to everyone; assigned-visit restriction applies to doctor authors. Reception/OP may handle eligible OP queue visits across doctors |
| OP-07 | Upload report → view permitted reports → ready notification | Private report is attached to correct patient/visit/test; assigned doctor can review |
| OP-08 | Open Patient Assist after completion → inspect next step | Accurate pharmacy/billing/IP routing without exposing payment analytics |
| OP-09 | Search Drug Stock and clinical patient context | Read-only eligible availability; no cost fields, stock edits, dispensing, or clinical-authoring privileges |

## 8. Doctor flows

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| DOC-01 | My Queue → filter waiting/ready/in consultation/completed → open assigned visit | Only permitted doctor context; opening editor starts consultation once; reception/OP counts agree |
| DOC-02 | Inspect patient header, allergies, vitals, prior visits/prescriptions/reports | Correct patient history with reachable older records; no financial history or another patient's content |
| DOC-03 | Enter symptoms/history/examination/assessment/advice using local suggestions or free text | Exact clinician text/selected terms saved; consultation remains usable without remote lookup. Current exact-code fallback is noted in section 15 |
| DOC-04 | Save Draft → navigate/reopen → continue editing | Supported draft fields retained; current assessment requirement visible; no stock consumption or finalized clinical print misrepresentation |
| DOC-05 | Search medicine by brand/generic/strength/form → view availability → select | Bounded local search; usable quantities and low/out-of-stock warnings; no purchase cost/margin |
| DOC-06 | Select out-of-stock/free-text medicine → continue | Prescribing allowed with clear stock information; stock unchanged; pharmacy handles availability later |
| DOC-07 | Add/edit/remove/reorder prescription lines; use preset/custom dose/frequency/duration/route/notes/quantity | Table preserves each line correctly; manually set quantity is not overwritten by a suggestion |
| DOC-08 | Add tests with category/date/notes and follow-up intention → save | Test orders preserve selected data and link to patient/visit/doctor; report workflow can identify them |
| DOC-09 | Set follow-up: none, specific date, after days, after report | Required date/days/tests validated; correct due/report-ready workflow; no premature completion |
| DOC-10 | Complete with medicines → open pharmacy queue | Visit complete; prescription pending; requested units visible; actual stock unchanged |
| DOC-11 | Complete with tests/advice but no medicines | No actionable empty prescription in pharmacy; clinical document/history still available; legitimate fee workflow remains possible |
| DOC-12 | Finalize fee under the current consultation flow → reception/pharmacy collect | Fee becomes due through the permitted workflow; doctor sees no collection history; zero-fee case remains valid |
| DOC-13 | Print preview then completed prescription | Draft clearly differentiated from issued document; A4 clinical structure, doctor registration, patient identity, tests and medicines correct |
| DOC-14 | Reopen completed consultation → attempt edit | Read-only history; only an explicit amendment flow could change it; no accidental draft overwrite |
| DOC-15 | My Follow-ups → open linked new visit | Previous summary, diagnosis, reason, new reports, and prior prescription available; copying medicines does not alter original |
| DOC-16 | Open new report → review → mark reviewed | Assigned/relevant doctor only; report and test statuses agree; due work/notifications update |
| DOC-17 | Recommend IP admission with ward/reason → complete consultation | Referral appears for reception/IP, preserving source visit and diagnosis; doctor referral is distinct from admission |
| DOC-18 | My IP Patients → open own ticket → record ward round with optional visit charge | Clinical note visible to ward; optional charge exactly once; doctor doesn't receive ticket payment analytics |
| DOC-19 | Prepare discharge summary/follow-up for own IP patient | Structured clinical summary saved; discharge-pending handoff to IP; financial settlement remains IP/admin workflow |
| DOC-20 | Need new IP prescription from doctor ticket | Cover the intended clinician-authoring path; current visible origin is pharmacy paper-Rx entry, so direct doctor control is a gap if absent |
| DOC-21 | Leave started consultation without saving; return later | Explicit abandoned/in-progress recovery policy; no permanently stuck status or claim that unsaved work was saved |

## 9. IP staff flows

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| IP-01 | Dashboard → Current Patients → My Patients → Pending Discharge → Discharged → All Tickets | Correct status and staff filters; dashboard totals agree; admitted and discharge-pending tickets remain current |
| IP-02 | Search by ticket/name/phone → next page → room/floor grid | Stable server pagination; occupancy, patient, doctor, and ticket link agree; pending discharge still occupies the bed |
| IP-03 | Doctor referral → Take & Admit → confirm patient/source visit/doctor/staff/bed | One new ticket linked to the referral; referral disappears from pending only after successful admission |
| IP-04 | New Admission → select existing patient and doctor → optional room/bed → reason/deposit | Ticket and initial payment created safely; Current/My Patients/history/bill update; IP staff does not create duplicate patient demographics |
| IP-05 | New named patient needs admission | Reception/admin registers the patient first; IP selects that same record. Do not invent an IP-owned patient-creation permission |
| IP-06 | Unidentified emergency → emergency admission without patient | Explicit unidentified ticket; care/charges retained under ticket identity; no fabricated patient phone |
| IP-07 | Emergency identity confirmed → select existing active patient → link once | All ticket notes/charges/payments remain intact; correct patient history gains the admission; wrong/repeated linkage rejected |
| IP-08 | Assign free bed during admission | Bed becomes occupied across all ward views; concurrent allocation cannot use it twice |
| IP-09 | Assign to self/another IP staff/unassign → open My Patients in both sessions | Workload/ownership refresh; active staff policy enforced; assignment audit retained |
| IP-10 | Open ticket → clinical notes, charges, payments, pharmacy requests | One central ticket with consistent patient/doctor/status; financial tabs only for permitted roles |
| IP-11 | Treating doctor records ward round with optional charge → IP reads it | Structured note visible; optional single doctor charge appears in bill; IP cannot alter the doctor's note |
| IP-12 | Add configured charge with quantity/rate → inspect total | One charge line with correct source/rate/amount; ticket, list, running bill, and dashboard balance update |
| IP-13 | Add custom charge or several configured/custom rows together | Bounded batch of rows (current action supports 1–25); invalid row cannot silently leave a partial charge batch |
| IP-14 | Retry the same charge/ward-round save | Existing result returned; no second charge; new intentional repeat charge is distinguishable from a retry |
| IP-15 | Add partial payment → add remaining payment later → print | Separate amount/mode/collector/time rows; exact balance; no overwriting the first payment |
| IP-16 | Print running bill while admitted/pending discharge | Clearly marked running bill; current itemized charges and complete payment history |
| IP-17 | Request medicine/consumable/free-text item with quantities and notes | Up to current supported line limit (30); pending request in pharmacy; stock and ticket charges unchanged |
| IP-18 | Pharmacy supplies tracked stock and charges ticket | IP sees requested/supplied/shortage and one linked charge; running bill updates; use FLOW-STOCK-01/02 |
| IP-19 | Pharmacy supplies with counter collection instead | Request shows pharmacy collection; IP balance does not include that amount a second time |
| IP-20 | Pharmacy partially supplies/closes as unavailable → IP reviews outcome/shortage note | Fulfilled request preserves requested/supplied/not-supplied amounts; follow-on need requires a new request in current code |
| IP-21 | Upload permitted IP report → doctor reviews | Correct ticket/patient/category linkage; private access; report appears in relevant history/review list |
| IP-22 | Assigned IP staff/doctor/admin prepares discharge summary | Required diagnosis/course/advice validated; ticket becomes discharge pending; patient stays current and bed remains occupied |
| IP-23 | Review outstanding charges/payments and unresolved requests/prescriptions before finalization | Clear unresolved work; no silent loss of pending pharmacy work; discharge policy resolved explicitly (section 15) |
| IP-24 | Finalize discharge after required summary, patient linkage, and settled bill | Single transition/time; ticket goes to Discharged; bed released; final bill and discharge summary available |
| IP-25 | Retry finalization; try new notes/charges/payments against finalized ticket | No second discharge or prohibited historical mutation; stale dialogs do not bypass status checks |
| IP-26 | Open discharged ticket from patient history → print final documents | Complete original history, items, payments, doctor identity, and summary remain readable with authorized access |
| IP-27 | Same patient returns later → new admission | New independent ticket linked to same patient; prior discharged admission remains unchanged |
| IP-28 | Need room transfer, admission cancellation, correction of identity, or post-discharge amendment | Use only an explicit supported audited workflow. Current source lacks some of these controls; mark blocked/gap instead of editing tables manually |

## 10. Pharmacy flows

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| PHA-01 | Medicine Master → add brand/generic/strength/form/manufacturer → save | Searchable directory identity; zero available stock until a batch is received; doctor may still prescribe |
| PHA-02 | Edit medicine metadata/aliases → search from doctor, IP, and pharmacy | Same medicine ID everywhere; new name/search result updated; historical prescription text is not rewritten |
| PHA-03 | Add batch with expiry, pack size, pack price, packs, loose units, threshold | Opening units = packs × units per pack + loose units; opening movement recorded; availability and picker price agree |
| PHA-04 | Batch → Edit / Adjust → positive delta with reason | Exact units added once; batch, ledger, total availability, and IP picker agree |
| PHA-05 | Batch → Edit / Adjust → negative correction with reason | Exact units removed with audit; cannot go negative; no fabricated sale or payment |
| PHA-06 | Edit batch price/expiry/threshold/active/pack metadata with delta 0 | Quantity unchanged; eligibility/price/status changes propagate; earlier sale/charge amounts remain fixed |
| PHA-07 | Deactivate/reactivate a batch; cross expiry date | Physical row/history remains; only currently eligible stock is offered for supply |
| PHA-08 | Deactivate medicine; admin removes/restores a referenced medicine | New selections exclude inactive/archived medicine; history survives; restored directory does not automatically reactivate its batches |
| PHA-09 | Inventory → add a consumable with opening count, unit, price, expiry | Separate inventory row and opening movement; item appears with the correct stock type in IP fulfillment |
| PHA-10 | Inventory → edit absolute counted quantity and price with reason | Difference is ledgered; latest count/price visible in IP; no medicine batch mutation |
| PHA-11 | Pending OP prescription → open Dispense → inspect current batches | Fresh eligible batches fetched; FEFO suggestion; correct requested/already supplied/remaining quantities |
| PHA-12 | OP prescription → full dispense → collect permitted outstanding consultation fee | Actual stock deduction and one sale; fee collection separately attributable; prescription dispensed; receipt and reception balance reconcile |
| PHA-13 | OP prescription → partial dispense → later dispense remaining | Each sale deducts only actual units; remaining prescription stays pending until resolved; previous sales preserved |
| PHA-14 | Prescription → close remaining items as unavailable/outside purchase | Outside-purchase document lists only unsupplied items; no extra stock, sale, or payment |
| PHA-15 | Prescription dispensing → choose eligible alternative batch or split across batches | Exact per-batch quantities and snapshot prices; total supply and cost reconcile; no substitution of a different medicine |
| PHA-16 | IP prescription → dispense | One stock deduction/sale and one linked IP pharmacy charge; no OP fee/counter collection masquerading as IP payment |
| PHA-17 | Enter Doctor's Prescription → incomplete OP paper consultation → complete | Digital record follows the authorized paper-Rx workflow and normal pending/dispense path; capture entering actor and doctor attribution |
| PHA-18 | Enter Doctor's Prescription → admitted IP ticket → add medicines → save | IP prescription linked to correct ticket/doctor; stock unchanged until dispense |
| PHA-19 | Visit without medicines but an outstanding fee → collect fee | Only fee payment recorded; reception balance updates; no medicine sale or stock movement invented |
| PHA-20 | IP Item Requests → open pending request → match exact medicine or inventory item | Source type, identity, current eligible quantity, unit, and price clear; ambiguous names require explicit choice |
| PHA-21 | IP request → supply medicine from eligible batches | FEFO batch deductions + medicine movement ledger + saved request outcome; use FLOW-STOCK-01 |
| PHA-22 | IP request → supply inventory item | Inventory count/movement + saved request outcome; use FLOW-STOCK-02 |
| PHA-23 | IP request → mixed medicine/inventory/manual/unavailable lines → confirm | Every line resolved explicitly; only tracked supplied lines reduce stock; receipt distinguishes manual/untracked supply and shortage |
| PHA-24 | IP request → Add to IP ticket settlement | One IP pharmacy charge; no pharmacy counter cash collected; sales source/settlement label and ticket bill agree |
| PHA-25 | IP request → Collect at pharmacy now → mode/reference | Exact supplied total collected once at pharmacy; IP balance unchanged; no duplicate IP charge/payment; correct receipt and dashboard attribution |
| PHA-26 | IP request → some or all lines not supplied | Current code closes request with shortage; zero supply means no stock/charge/collection; use no-collection settlement for zero value |
| PHA-27 | Revisit completed IP request and print Bill/Receipt/Outside Note | Stored outcome and prices preserved; Current can retain a newly fulfilled row for 10 minutes, then Completed provides history |
| PHA-28 | Inventory → New Procedure Bill for outpatient → confirm | Consumable deduction and procedure sale/receipt; correct patient/mode and historical line prices |
| PHA-29 | Procedure Bill for currently admitted patient | Routed once to the active IP ticket as a treatment charge; no second counter collection |
| PHA-30 | Sales → text-search prescription/IP-request history → print; Inventory → Procedure Bills → inspect procedure history | Correct patient/source/settlement in the appropriate ledger; totals match actual transactions; no duplicate counted IP revenue |
| PHA-31 | Dashboard → low/out/expiring stock → affected table | Correct threshold/expiry boundaries and units; links preserve the intended filter |
| PHA-32 | Repeat stock adjustment from same row; repeat fulfillment/dispense after lost response | New deliberate action gets a new operation identity; retry of old action remains exactly once |

### Medicine bulk import

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| IMP-01 | Download official XLSX template → inspect sample/instructions; prepare XLSX or CSV upload | No manual header invention; required columns, date format, boolean, units, quantity and price basis explicit |
| IMP-02 | Upload a valid 1,000-row file → preview → confirm | Responsive UI, accurate preview counts, bounded bulk requests; resulting stock appears in pharmacy and doctor/IP search |
| IMP-03 | Upload mixed valid/invalid rows → inspect errors → download error rows | Invalid rows never silently enter database; accepted-row policy explicit; cancel before confirmation writes nothing |
| IMP-04 | Include normalized matching medicine and existing batch | Reuse intended medicine/batch; desired preview explicitly identifies new/reused/topped-up rows. Current preview only says Valid, and existing batch quantity is added; this is a preview gap |
| IMP-05 | Fail a later chunk → retry Confirm in the same mounted preview | Report committed/failed/not-attempted chunks; same chunk keys skip committed operations. Selecting/re-uploading the file creates a new key and is not this retry path |
| IMP-06 | Re-upload previously imported file | Detect or clearly warn that a fresh import can add stock again; operational retry differs from a new receipt |
| IMP-07 | Import as each non-authorized role or via forged action | Admin/pharmacy only at UI, server, RPC, and database |

### Discounts

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| DISC-01 | Reception → visit → Collect → Add discount 10% "Senior citizen" | Amount pre-fills to balance less discount; visit shows Discount and balance 0; payment row is net cash only |
| DISC-02 | Pharmacy dispenses OP Rx with a discount | Medicines discounted first, then doctor fee; stock drops by the full dispensed quantity; receipt shows Subtotal / Discount (reason) / Total paid |
| DISC-03 | Staff enter more than the Settings limit | Dialog shows "Maximum N% discount allowed." and blocks; the database also refuses a stale page |
| DISC-04 | IP Add Payment with discount; later Complete Discharge | Balance nets the discount; discharge is allowed once paid + discount covers charges; final bill lists the discount |
| DISC-05 | Admin voids an OP-fee or open IP-bill discount in Discount Register | Row stays as Voided with reason; balance reopens; counter (pharmacy/IP items/procedure) discounts cannot be voided |
| DISC-06 | Admin changes the limit in Settings → Billing | Next discount uses the new limit immediately; audit DISCOUNT_LIMIT_CHANGED records from/to |
| DISC-07 | Reports → Discounts, dashboard Discounts Today, Staff tab, monthly export | Same totals everywhere; Collected figures exclude discounts |

## 11. Reports, follow-up, and patient history

| ID | Steps | Expected result and where it reflects |
| --- | --- | --- |
| REP-01 | Doctor orders test → reception/OP opens upload → selects that order | Correct patient/visit/category/test; pending test becomes report-ready only after successful upload |
| REP-02 | Upload PDF/JPG/JPEG/PNG/WEBP with name/date/notes | Valid private UUID-based file path, metadata, size/type; patient Reports and doctor/reception relevant lists update |
| REP-03 | Upload ad hoc report without test order, or permitted IP document | Correct optional visit/ticket context; no artificial test/follow-up created unless intended |
| REP-04 | Open/view/download report with each relevant role | Authenticated/private short-lived access and audit; unauthorized patient access denied |
| REP-05 | Doctor marks report Reviewed → revisit test/order/list | Both statuses agree; repeat review cannot create duplicate care/payment events |
| REP-06 | After-report recommendation → upload result → reception creates follow-up → doctor reviews in new visit | One linked follow-up; old visit stays completed; new reports and previous consultation context accessible |
| REP-07 | Specific-date/after-days recommendation → date becomes due → create follow-up | Due/overdue labels accurate in hospital timezone; future work not falsely presented as overdue |
| REP-08 | Patient profile → Visits/IP Admissions/Reports/Payments → old and recent records | Correct cross-module timeline and role-appropriate finance; histories beyond initial page/limit remain reachable |
| REP-09 | Change patient phone/name → revisit report/visit/ticket links | Same UUID links throughout; no missing or cross-patient history; reprint identity behavior explicit |
| REP-10 | Resave a draft after a report has already been linked to one of its tests | Linked report/order preserved once; no duplicate ordered test generated by replacing draft rows |

## 12. Cross-role reconciliation journeys

| ID | Complete journey | Reconcile at the end |
| --- | --- | --- |
| CROSS-01 | Admin creates doctor/department → reception registers patient and visit → OP vitals → doctor completes → pharmacy dispenses → payment/print | Same patient/visit/doctor chain; token/clinical statuses; no stock change before supply; one set of charges/collections |
| CROSS-02 | Pharmacy add/edit batch → IP requests → pharmacy supplies → IP checks bill | Exact FLOW-STOCK-01 quantities/prices; movement, request, sale display, charge, and bill agree |
| CROSS-03 | Pharmacy add/edit inventory → IP requests → partial supply + outside note | Exact FLOW-STOCK-02 count and price; shortage unbilled; no medicine-batch change |
| CROSS-04 | Doctor prescribes 10 → pharmacy supplies 6 → patient returns for 4 | Two actual supply transactions totaling 10; stock decreases 6 then 4; pending/partially-dispensed/dispensed status correct |
| CROSS-05 | Doctor orders test + after-report follow-up → OP uploads → reception creates follow-up → doctor reviews | Distinct linked visits; one report/order relationship; old clinical record untouched |
| CROSS-06 | OP consultation recommends admission → fee collected → referral admitted → ward care → discharge | Source visit/ticket link, OP fee gate, IP charges/deposits, released bed, and two preserved clinical histories |
| CROSS-07 | Emergency admission without identity → care/payment → reception registers → IP links patient → discharge | No lost notes/charges/payments, no duplicate patient merge; final document identifies correct patient |
| CROSS-08 | IP request supplied → choose IP-ticket settlement versus pharmacy-counter settlement on separate fixtures | Each amount enters exactly one settlement route and the appropriate collection dashboard; never both |
| CROSS-09 | Admin changes doctor/charge/medicine rate → create new transaction → reprint old transaction | New rate used only where intended; old sale/charge/payment totals remain fixed |
| CROSS-10 | Admin disables doctor/staff/medicine/category → another role uses already-open form | Server enforces current eligibility; usable choices refresh; existing history preserved |
| CROSS-11 | Two reception desks issue tokens for same doctor; two pharmacy desks consume same batch | Unique doctor/day tokens; stock never negative; one result per operation; both queues refresh |
| CROSS-12 | Two collectors settle OP/IP balance while another user adds charge | Current transactional totals; no silent overcollection; no falsely finalized bill |
| CROSS-13 | Reassign visit/staff → old and new owners open their work lists | No lost patient; correct ownership/actions and audit; no permissions inherited from stale UI |
| CROSS-14 | Month end → export → compare detailed OP/IP/pharmacy ledgers and dashboard | Actual cash versus charges distinguished; late payments/ongoing admissions and linked patient records included |
| CROSS-15 | Desktop starts workflow → mobile continues → print/reopen later | Same persisted outcome and permissions; no new transaction caused by device switch/reprint |
| CROSS-16 | Medicine archived/restored → doctor/IP stock searches → inspect old prescription/sale | Active visibility consistent; restored batches require intended activation; historical references survive |
| CROSS-17 | Stock changes while pharmacy IP picker and ward Drug Stock are already open/hidden | Test active refresh, focus return, new search, new selection, and reload separately; record freshness delay |
| CROSS-18 | User role changes or account is disabled mid-journey | New access applies across tabs/routes/files/RPCs; unfinished work has a clear recoverable owner/status |

### State changes to verify

| Record | Normal transitions | Invalid/exception transition to test |
| --- | --- | --- |
| Visit | Waiting → ready after vitals → in consultation → completed | Ready must not overwrite in-consultation after a vitals correction; completed cannot revert to editable |
| Unfinished visit | Waiting/ready → reassigned or explicitly expired/cancelled under current policy | No hidden cancellation of active consultation; overdue in-progress work needs recovery policy |
| Consultation | Draft → completed | Failed save preserves draft; completed cannot become draft |
| Prescription | Pending → partially dispensed → dispensed, or remaining quantity closed unavailable | No stock change at creation; excess supply cannot silently alter clinical instructions; preserve reason for closure |
| Test/report | Ordered/report pending → report ready → reviewed; cancelled only under supported policy | Report from another patient cannot advance state; resaving draft cannot duplicate report-ready order |
| Follow-up | Recommendation → due/report-ready → new linked visit | Original visit stays completed; repeated trigger doesn't create another follow-up automatically |
| IP ticket | Admitted → discharge pending → discharged | Pending discharge still occupies bed; finalization requires current valid data; no silent reopen |
| Emergency IP ticket | Unidentified → linked once to confirmed patient | Cannot finalize as a different patient or reassign identity casually |
| IP item request | Pending → fulfilled with supplied/unavailable line outcomes | Partial supply closes current request; further need uses a new request; retry never resupplies |
| Stock | Opening count → receipts/adjustments → actual supply movements | Prescription/request/print does not reserve or reduce; inactive/expired changes eligibility, not physical count |
| Payment | New positive attributable entry → contributes to derived balance | No overwrite/delete to correct a recorded collection; use only an approved adjustment flow if implemented |
| Export | Generating → ready or failed → manual generated-ZIP deletion | Failed/incomplete archive must not appear ready; deletion leaves source data intact |

## 13. Edge-case matrix

Apply these cases to every relevant create/edit/save/import/dispense/collect/complete operation, not just the screen named in an example.

### A. Authentication, authorization, and record scope

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-A01 | Missing/expired/tampered session; inactive or unknown profile role | No protected data or mutation; recoverable authentication/authorization result |
| EDGE-A02 | Non-admin posts directly to user, doctor, master, settings, audit, or export endpoints | Denied in route/action and database; no side effect |
| EDGE-A03 | Doctor A requests doctor B's unrelated visit, report, prescription, IP ticket, or notification | Assigned/relevant-record policy enforced, including guessed UUIDs and print/download routes |
| EDGE-A04 | OP/doctor inspects API payloads, HTML, print URLs, or search responses for finances | No unauthorized fee/payment analytics, purchase cost, supplier cost, or margin leakage |
| EDGE-A05 | Pharmacy searches a patient without a dispensing need | Only permitted identity/workflow context; no broad medical-history access |
| EDGE-A06 | Change patient/visit/ticket/doctor IDs in a valid form payload | Ownership and relationships revalidated; foreign-patient records cannot be attached |
| EDGE-A07 | Concurrent role revocation/deactivation and pending submission | Authorization rechecked at commit; revoked user cannot complete a privileged write |
| EDGE-A08 | Report/export URL reused by another user or after URL expiry | Private entry point rechecks access; signed-link lifetime and bearer-link behavior documented; no permanent public object |
| EDGE-A09 | Direct browser database/RPC access instead of application action | RLS, column grants, and RPC guards enforce the same boundaries |
| EDGE-A10 | Realtime event/search/cache from another role or patient | No hidden unauthorized records, financial fields, or stale prior-session data |

### B. Input, identity, and search

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-B01 | Empty/whitespace-only required values; very long input; Unicode/local-language names | Clear length/required errors; valid text preserved; no blank display identity |
| EDGE-B02 | Phone with +91/spaces/dashes; invalid/short/long input; duplicate normalized phone | Valid V1 normalization is consistent; invalid formats rejected; duplicate policy explicit |
| EDGE-B03 | Two staff register the same person/identifier concurrently | Duplicate protection follows the approved unique identity; do not create two records for one registration or merge different people merely because their phone matches |
| EDGE-B04 | Phone correction; same name/different people; shared family phone | UUID/history preserved; never auto-merge by name. Shared-phone handling follows an explicit approved identity policy |
| EDGE-B05 | Future DOB, invalid calendar date, leap-day DOB, unknown age, DOB/age conflict | Valid age display; optional unknown values stay unknown; invalid dates do not roll into another date |
| EDGE-B06 | Rapidly type/clear/change a query; responses arrive out of order | Only latest query results show; stale fetches cancelled/ignored; Enter selects the visible result |
| EDGE-B07 | Numeric phone search versus name search; case/spacing/aliases; identical names | Correct ranking, stable ID-based selection, visible disambiguation, limited server results |
| EDGE-B08 | No matches; empty dataset; page beyond last result after deletion/filter change | Useful empty state; pagination recovers; never a blank broken page |
| EDGE-B09 | Search wildcard/filter syntax, HTML/script-like text, CSV formula prefixes | Input treated as data; query remains bounded; no script execution or unintended filter expansion; spreadsheet exports/imports safe |
| EDGE-B10 | Large directory/patient table; item found only after page 1 | Server pagination, deterministic ordering, correct next-page state, no all-record browser download |
| EDGE-B11 | Filter/sort/page/role change combined; browser Back/Forward/deep link | Applied filters and selected record remain clear; incompatible page numbers reset safely |
| EDGE-B12 | Deactivated/renamed item while selection dialog is already open | Submission validates current record; stale selection cannot silently create invalid work |

### C. Failure, retry, concurrency, and refresh

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-C01 | Double-click submit, Enter plus click, two tabs submit same operation | One operation, or a clear conflict; one token/payment/charge/dispense |
| EDGE-C02 | Server commits but client loses response → retry | Resolve original transaction using stable operation identity; no second debit or duplicate record |
| EDGE-C03 | Request fails before commit; database/storage/auth service unavailable | Honest error; no false success; safe retry and form state retained where appropriate |
| EDGE-C04 | Failure halfway through a multi-record transaction | All related database changes roll back; external-side-effect compensation is visible if incomplete |
| EDGE-C05 | Two users edit the same demographics/draft/metadata | Conflict policy prevents silent clinical/stock-data loss; latest persisted values are shown |
| EDGE-C06 | Two workflows consume the same last batch/item units | Transactional validation; never negative; loser sees current remaining quantity |
| EDGE-C07 | Add stock/edit price/deactivate batch while another user dispenses | Locked/validated current stock and price; no lost increment or unauthorized stale allocation |
| EDGE-C08 | Two users collect the same remaining balance | Balance enforced at commit; duplicate/overpayment policy explicit; no accidental excess collection |
| EDGE-C09 | Two admissions/transfers select the same free bed | One succeeds; other gets a recoverable conflict; no double occupancy |
| EDGE-C10 | Complete consultation versus save draft; fulfill request versus discharge | State rechecked inside transaction; finalized records cannot receive forbidden late changes |
| EDGE-C11 | Destination screen open during another role's mutation | Refresh within a measured/accepted interval; count and detail agree; test without manual reload first |
| EDGE-C12 | Hidden tab resumes; websocket drops; reconnect/focus/new navigation | Current values reload; failed sync is not mistaken for a successful latest-stock check |
| EDGE-C13 | Auto-refresh arrives while editing a form or selecting prescription rows | Unsaved work and selected patient context are not silently erased or switched |
| EDGE-C14 | Offline/slow network during critical save/dispense/payment | No offline promise of server success; visible pending/error state; retry follows idempotency rules |
| EDGE-C15 | Browser closes/cancels dialog mid-request | Reopening discovers actual persisted outcome; close is not assumed to cancel a committed transaction |
| EDGE-C16 | Same idempotency key reused with a different payload | Reject/conflict rather than silently treating different quantities/payment as the original request |

### D. Shared money, dates, dashboards, and documents

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-D01 | Negative/zero/NaN/extreme money; more than two decimals; blank required amount | Reject invalid values; zero is allowed only for explicitly free/no-payment cases; exact paise totals |
| EDGE-D02 | Split payment, partial payment, later payment, multiple payment modes | Separate attributable rows; total collected and remaining balance reconcile |
| EDGE-D03 | Edit master fee or selling price after a charge/sale | Historical rate, total, payment, and final bill are unchanged |
| EDGE-D04 | Charge total versus actual collection; IP pharmacy charge versus counter receipt | Never count an unpaid charge as cash received or collect the same amount through two channels |
| EDGE-D05 | Discount retried, double-clicked, larger than the balance, or given on an IP-ticket-billed item at the counter | One ledger row per idempotency key; over-balance refused; IP-billed items are discounted only on the IP bill |
| EDGE-D05 | End of day/month/year, leap day, different browser timezone | Asia/Kolkata business date consistent across tokens, queues, expiry, reports, dashboard, and export |
| EDGE-D06 | Range with no transactions; reversed dates; invalid/very large range | Clear validation/empty results; bounded queries; no misleading stale chart |
| EDGE-D07 | One patient, multiple doctors/visits, partial sales, repeated payments | Patients, visits, tokens, sales, units, and collections use the correct distinct/count/sum definitions |
| EDGE-D08 | Reprint token/prescription/receipt/IP bill multiple times | No new visit, stock movement, charge, or payment; authorized content only |
| EDGE-D09 | Very long prescription/report text; 0/1/many rows; multipage bill | A4 breaks are readable; repeated headers where applicable; no clipped rows or giant unused space |
| EDGE-D10 | Missing optional vitals/logo/address/notes; long doctor/patient names | Document remains readable; missing values not fabricated; nonempty sections only |
| EDGE-D11 | Token printed after fee/print setting changes | Still no money, including hidden print-only text |
| EDGE-D12 | Receipt/financial print route opened by doctor/OP | Denied even when the user can view the corresponding clinical record |
| EDGE-D13 | Browser print cancelled, mobile print unavailable, popup blocked | Original record remains saved; visible way to reopen/print; no accidental resubmission |

### E. Pharmacy, medicines, stock, and IP supply

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-E01 | Zero opening stock; stock exactly at threshold; one above/below threshold | Out/low/in-stock labels are derived consistently; a zero-stock directory medicine can still be prescribed |
| EDGE-E02 | Same brand but different strength/form; identical medicine and consumable names | Stable medicine/item IDs and visible type/unit disambiguation; never auto-substitute clinically different stock |
| EDGE-E03 | Duplicate batch number for same medicine versus different medicine | Correct uniqueness scope; no duplicate same-medicine batch or accidental merge across medicines |
| EDGE-E04 | Expiry yesterday/today/tomorrow; month-only date; missing/invalid expiry | Valid date required where applicable; documented same-day cutoff; no expired allocation; identical rule in search and commit |
| EDGE-E05 | Multiple active/expired/inactive batches | Usable total excludes ineligible units; physical total remains explainable; batch-level deduction reconciles |
| EDGE-E06 | FEFO tie, manual override, one order spanning differently priced batches | Stable selection; only eligible chosen batches; exact per-line arithmetic; explain any estimated picker price versus allocation total |
| EDGE-E07 | Packs/loose units, 0 or fractional pack size, huge count, changed pack size | Unit conversion validated; batch stock remains individual units; pack-price label cannot be confused with piece price |
| EDGE-E08 | Batch delta +20 versus inventory Counted quantity 20 | Batch increments by 20; inventory becomes 20; preview/reason/ledger makes the difference explicit |
| EDGE-E09 | Negative stock correction beyond availability; blank reason | No negative quantity; required reason and actor retained; no silent unledgered direct overwrite |
| EDGE-E10 | Save adjustment → reopen same mounted dialog → perform another adjustment | Second deliberate action executes once with new identity; not silently discarded as a retry of the first |
| EDGE-E11 | Quantity/expiry/active/price edited after IP fulfillment dialog opened | Current values verified before confirmation; stale preview does not silently authorize a higher charge; failures keep request consistent |
| EDGE-E12 | Initial IP stock set misses item beyond 500; Show more beyond 25 results | Remote paginated search reaches it; changing query resets cursor; duplicate display names ordered by ID |
| EDGE-E13 | Requested quantity zero/negative/fractional/too large; supplied exceeds request | Valid unit/quantity rules enforced. IP fulfillment rejects excess supply; prescription dispense currently permits excess and increases stored requested quantity, requiring explicit policy review |
| EDGE-E14 | Prescribed but never collected; draft/reprint/reopen request | No reservation, deduction, sale, or charge |
| EDGE-E15 | Partial Rx versus partial IP item request | Rx remains partially dispensed until completed/closed; current IP request finalizes with a shortage. UI cannot mislabel the latter as pending supply |
| EDGE-E16 | Entire request unavailable; mixed available/unavailable/manual lines | No zero-value collection; unavailable lines unbilled; manual supply explicit and untracked; each line's outcome preserved |
| EDGE-E17 | New receipt imported/added while a previously unavailable request is already closed | Historical shortage stays; new request/transaction required for actual later supply; no retroactive deduction |
| EDGE-E18 | Change settlement IP bill ↔ pharmacy counter; missing/wrong payment mode/amount | One financial destination; counter collection matches supplied value; IP charge not duplicated or also collected |
| EDGE-E19 | Supply same request in two pharmacy sessions | One confirmed result; second cannot deduct/bill again; whole request remains coherent |
| EDGE-E20 | Delete/archive medicine or batch with stock, ledger, sale, or prescription history | Preserve referenced history and physical accountability; inactive stock unavailable; restore does not silently re-enable batches |
| EDGE-E21 | Procedure bill patient becomes admitted/discharged while dialog open | Server resolves correct valid settlement target; cannot silently attach to an unrelated/closed ticket |
| EDGE-E22 | Return/refund/cancel a posted dispense or reverse a correction | If no audited reversal flow exists, show unsupported/manual-resolution status; do not delete sales or fabricate stock receipts to hide history |
| EDGE-E23 | Current IP request remains visible after fulfillment | Completed status/actions clear during its 10-minute grace window; cannot be fulfilled twice; then appears under Completed |
| EDGE-E24 | Late fulfillment after discharge, including counter settlement | Explicit policy for both settlement modes; no late modification of final IP bill; unresolved requests cannot be silently stranded |
| EDGE-E25 | Active but expired inventory item selected in procedure billing | Same eligibility policy as IP fulfillment, or an explicit justified difference; no silent use of expired stock simply because the item is active |

### F. IP admission, care, billing, and discharge

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-F01 | Same patient admitted twice concurrently to different beds | Explicit one-open-admission policy and transactional protection, or visible approved exception; no accidental duplicate ticket |
| EDGE-F02 | Same referral admitted twice; retry after timeout | One ticket/source link/deposit; pending referral disappears only after success |
| EDGE-F03 | No beds available; optional bed omitted; inactive bed; occupied bed disabled/renamed | Clear bedless/admission policy; no false occupancy; history and current placement remain consistent |
| EDGE-F04 | Emergency link points to inactive/wrong/already-admitted patient | Validation and deliberate confirmation; no silent second patient assignment; related history remains with correct identity |
| EDGE-F05 | Inactive/non-IP staff chosen; staff removed during handover | Assignment validates current role/status; My Patients and workload refresh; no disappearing ticket |
| EDGE-F06 | IP staff edits another staff's assigned discharge summary | Owner/role policy enforced at action and database; reading/operational management does not imply authoring clinical content |
| EDGE-F07 | Custom charge unknown category; negative rate; 0/26 batch charge rows; mixed invalid rows | Bounded validated input; safe atomic behavior; correct category/report grouping |
| EDGE-F08 | Add same semantic charge twice with different operation keys | Distinguish intentional repeated service from accidental duplicate; UI review/audit supplements retry idempotency |
| EDGE-F09 | Concurrent payments exceed remaining balance; deposit exceeds eventual charges | Explicit overpayment/credit policy; exact ledger; never hide excess by clamping displayed balance to zero |
| EDGE-F10 | Prepare discharge without diagnosis/course/advice or without identified patient | Required fields/identity policy clear; cannot complete invalid discharge |
| EDGE-F11 | Discharge with balance; charge added after displayed balance; payment and finalization race | Final transaction recalculates totals under appropriate locking; no falsely settled final bill |
| EDGE-F12 | Pending item request or IP prescription at discharge | Resolve/close under explicit policy or block with explanation; no permanently pending operational work |
| EDGE-F13 | Direct final-bill/discharge-summary URL before finalization | Status enforced server-side; cannot label an active ticket FINAL merely because URL was guessed |
| EDGE-F14 | Update/delete finalized ticket or child charges/payments/notes through direct DB/RPC | Historical record protection applies beyond UI, including DELETE as well as UPDATE |
| EDGE-F15 | Discharge twice; revisit old dialog; attempt bed reuse | One finalization; old ticket unchanged; new admission may use released bed without modifying old placement history |
| EDGE-F16 | Cancel admission, transfer bed, reopen wrongly discharged ticket | Explicit supported/audited operation or a documented gap; never invent silent rollback semantics |

### G. Reports, consultation, and follow-up

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-G01 | Save incomplete draft; reload; reopen in another session | Draft retained accurately with correct owner; does not masquerade as a completed prescription or reduce stock |
| EDGE-G02 | Complete twice; Save Draft races Complete; user edits stale completed form | One completion; immutable final clinical record; stale write rejected rather than overwriting final content |
| EDGE-G03 | No medicines; tests only; advice only; very long clinical sections | Valid supported consultation completes without a fake medicine; queue/history and print remain correct |
| EDGE-G04 | Custom/SOS/ambiguous frequency or fractional dose | Preserve exactly what clinician entered; quantity suggestion is optional/overridable, not treatment interpretation |
| EDGE-G05 | Remove/reorder medicine/test lines; duplicate medicine with distinct instructions | Correct line IDs and intended entries saved; no accidental cross-row dose/quantity or silent merging |
| EDGE-G06 | Patient allergy/vitals changed while doctor consultation open | Latest relevant clinical information available; no stale warning silently presented as current |
| EDGE-G07 | Visit reassigned while doctor A has editor open | A cannot finalize as new assigned doctor; queues, visibility, ownership and audit agree |
| EDGE-G08 | Follow-up points to another patient, doctor, future/nonexistent/incomplete/cancelled visit, or itself | Relationship and permitted source state validated; permitted doctor changes explicit; never reopen/overwrite old completed visit |
| EDGE-G09 | After-report trigger with several tests/reports; repeated upload/review events | Agreed readiness rule and no duplicate follow-up notification/task; each report reviewed explicitly |
| EDGE-G10 | Report upload file is empty, corrupt, extension-spoofed, executable, or unsupported | Server validates content/type/size; no usable private report reference to invalid file |
| EDGE-G11 | File exactly **1,048,576 bytes**, one byte over; large PDF; large phone-camera image | Stored max 1 MB enforced server-side; PDF over limit rejected; images compressed locally only if still readable |
| EDGE-G12 | Compression fails/rotates image badly/destroys readability; mobile camera cancelled | Clear recoverable outcome; no blank unreadable clinical document or unintended upload |
| EDGE-G13 | Storage upload succeeds but metadata fails, or metadata exists but object fails | No success with a broken report; cleanup/retry handling reconciles orphan/missing object explicitly |
| EDGE-G14 | Report attached to wrong patient/visit/test/ticket; same test uploaded twice | Cross-record relationship guards; replacement/multiple-report policy explicit; no silent overwritten original |
| EDGE-G15 | Doctor tries to review unrelated/cancelled/missing report | Ownership/status checked; failed review doesn't mark test/follow-up complete |
| EDGE-G16 | Change/disable report category or directory term used by history | Existing report/diagnosis/prescription remains readable and attributable |
| EDGE-G17 | Follow-up due today/overdue/report-ready; IST midnight boundary | Correct queue, due label and default previous doctor/visit; no lost completed history |
| EDGE-G18 | Empty vitals; zero/negative/impossible or extremely high values; Fahrenheit/Celsius confusion | Required-versus-optional fields and units explicit; invalid input rejected. Numeric plausibility limits require clinician-approved rules, not invented medical thresholds |
| EDGE-G19 | More than one follow-up from the same source; after-report without tests; specific date left blank | Clear supported cardinality and trigger validation; duplicate rejection explained; no fictitious due date |
| EDGE-G20 | Previous-day waiting/ready visit versus abandoned in-consultation visit | Verify expiry/cancellation job affects only intended statuses; active work is not cancelled and stranded work has explicit recovery |

### H. Bulk import, export, and administration

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-H01 | Wrong/missing/duplicate headers; CSV BOM/quoted commas/newlines; wrong worksheet; empty file | Clear format errors; correct template supported; no accidental column shift |
| EDGE-H02 | 0/1/999/1,000/1,001 rows; current implementation also offers larger files | V1 per-file limit decision enforced consistently; 1,000 succeeds; limit is not a database-wide cap |
| EDGE-H03 | Invalid dates/Excel serial dates/booleans; decimal whole-unit quantities; negative prices | Deterministic typed validation with row numbers; no date guessing or silent value coercion |
| EDGE-H04 | Duplicate medicine/batch within file, existing record, case/space variants | Identity matching consistent; preview distinguishes new/reused/updated rows; quantity effect explicit |
| EDGE-H05 | One invalid row among valid rows | Chosen policy explicit: fix whole file or explicitly import valid subset; error download accurate; invalid rows never silently committed |
| EDGE-H06 | Cancel at preview, navigate away, network fail after chunk commit | Cancel-before-confirm is no-op; later failure reports actual committed chunks and safe resumption |
| EDGE-H07 | Same file re-uploaded/new operation key versus original chunk retry | Repeated receipt cannot masquerade as a harmless retry; no unintended stock double-add |
| EDGE-H08 | Template price basis differs from UI/server; units_per_pack absent/defaulted | Per-pack versus per-piece values explicit end to end; current template and V1 specification discrepancy resolved |
| EDGE-H09 | New staff email differs only by case; weak password; doctor department invalid | Validation consistent; no orphan login/profile; errors do not expose credentials |
| EDGE-H10 | Doctor provisioning rollback itself fails | Partial state reported for recovery; do not report clean rollback without confirming it |
| EDGE-H11 | Reactivate a staff member previously banned by removal; doctor inactive but linked login active | Auth and profile/doctor status agree; restored account actually can sign in only when intended |
| EDGE-H12 | Remove last admin concurrently; delete used doctor/master; restore conflicting duplicate | Administrative access and historical references preserved; conflict explicit |
| EDGE-H13 | Two admins edit settings/fees; print form tab unmounted during save | Unedited settings not reset accidentally; concurrent edits follow conflict policy; new rates don't change posted records |
| EDGE-H14 | Export empty month, IST month boundary, older patient with current activity | Valid understandable archive; referenced patient masters included; dates scoped correctly |
| EDGE-H15 | Current-month payment for older visit; ongoing IP admitted last month; IP-only Rx/tests | Export includes relevant monthly activity and necessary linked records, not only newly created parent records |
| EDGE-H16 | More than database default result limit; large documents; missing private object | All pages processed; resource limits handled; incomplete documents explicitly listed/failure status, not silent complete success |
| EDGE-H17 | Duplicate export clicks, failed generation/upload/job update, retry | Clear job state; no falsely ready ZIP; retry recoverable; manifest/counts/checksum match content |
| EDGE-H18 | Non-admin download; expired link; deleted ZIP; deletion storage failure | Authorization at entry; safe unavailable result; deletion does not falsely claim success or touch source records |
| EDGE-H19 | Automatic cleanup configured to 0; manual ZIP deletion | No automatic removal by default; only chosen generated ZIP affected, audit retained |
| EDGE-H20 | CSV contains formulas/newlines/quotes; audit holds sensitive input | Export safe and parseable; no unnecessary clinical payload, password, token, or key in generic logs |

### I. Mobile, accessibility, and operational performance

| ID | Edge case | Required outcome |
| --- | --- | --- |
| EDGE-I01 | Each key flow at 375/430/768/1024/1440 px | No page overflow; table horizontal scroll only where needed; actions reachable |
| EDGE-I02 | Long dialog with mobile keyboard; many prescription/request rows | Fields/actions remain visible and scrollable; add/remove/submit uses correct row |
| EDGE-I03 | Keyboard-only navigation through search, table actions, dialog and validation | Logical focus, arrow/Enter selection, labels, focus return, and usable error messages |
| EDGE-I04 | Touch double tap, orientation change, small print buttons, camera permissions | No duplicate mutation; current form retained; controls and recovery reachable |
| EDGE-I05 | Loading/empty/error/retry states for each table/search/dashboard | No stale values presented as fresh success; bounded skeleton/loading and useful next action |
| EDGE-I06 | Large tables/directories; 1,000-row import; ~20 simultaneous staff | Bounded server queries, responsive input, no full-catalog downloads or one network request per imported row |
| EDGE-I07 | Notifications read/unread across roles/tabs, duplicate realtime events | Correct recipient, no duplicate workflow creation; read state persists without hiding unresolved work |
| EDGE-I08 | Browser timezone/font/print differences; screen-reader labels | Consistent clinical/financial meaning, readable documents, semantic accessible controls |

## 14. Execution order and evidence

1. Verify role/session boundaries and synthetic fixture setup.
2. Run the four worked stock examples, including both medicine and general inventory.
3. Run reception → OP → doctor → pharmacy, and report → follow-up.
4. Run referral/direct admission → IP care → request → supply → payments → discharge.
5. Run admin configuration changes and confirm propagation into those same workflows.
6. Repeat critical mutations with concurrency, lost response, stale dialogs, and invalid IDs.
7. Reconcile ledger/charges/payments/dashboard/export/print against the source transactions.
8. Run mobile and keyboard passes at **375, 430, 768, 1024, and 1440 px**.

Use this result format per scenario/variant:

| Flow ID / variant | Role/session | Fixture IDs | Before | Action | Expected | Actual | Other screens checked | Evidence | Status / defect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FLOW-STOCK-01 / step 6 | Pharmacy + IP | Synthetic ticket, request, batch IDs | 145 units, ₹0 request charges | Supply 6 at ₹3 | 139 units, ₹18 charge, 4 remaining | Record during execution | Stock, IP request, ticket bill, dashboard | Screenshot + transaction IDs | Not run |

Database evidence should include relationship IDs, quantities, monetary totals, statuses, and movement counts. Avoid putting passwords, keys, real patient details, or full clinical payloads in QA evidence.

## 15. Current-code differences and decisions to resolve

This section records planning risks found while reading source. These are not runtime-confirmed bug reports and are not permission to implement new policy silently.

| Topic | Observation / decision needed | Relevant source |
| --- | --- | --- |
| Six roles versus OP merge | `op` exists in types/routes, but a later migration converts OP profiles to reception and Add/Edit Staff omits OP. The requested six-role model and combined reception/OP implementation need reconciliation before claiming separate OP coverage | `src/features/admin/actions.ts`, `src/types/hospital.ts`, `supabase/migrations/20260823230000_merge_reception_op_role.sql` |
| Patient identity | AGENTS.md specifies unique phone as visible Patient ID. Current schema/UI use unique UHID and allow shared phones; patient import still has phone-based duplicate behavior. Decide one consistent registration/search/import/print policy without merging histories | `supabase/migrations/20260815190000_uhid_patient_identity.sql`, `supabase/migrations/20260816150000_bulk_import_patients.sql`, `src/features/patients/new-patient-dialog.tsx` |
| Fee collection timing | AGENTS.md describes initial payment at visit creation; current registration defers fee/payment and consultation completion establishes the fee due. Test the current path while recording this requirement difference | `src/features/visits/issue-visit.ts`, `src/features/reception/actions.ts`, `src/features/clinical/actions.ts` |
| Broader operational permissions | Current routes allow reception vitals/IP operations and pharmacy paper-Rx entry/visit-fee collection. Validate these explicitly against hospital policy rather than assuming original role lists cover them | `src/lib/auth/permissions.ts`, `src/components/layout/navigation.ts` |
| Master/staff removal | Current source supports deleting never-used rows and archiving/deactivating used rows. History-bearing records must remain protected; do not apply bulk cleanup through this checklist | `src/features/admin/master-actions.ts`, `CLEAN.md` |
| Refresh timing | Current global sync coalesces realtime changes by 2 seconds and has a 10-minute fallback poll; watched tables vary by role. This does not prove every open stock search/dialog receives fresh values | `src/components/layout/operational-live-sync.tsx` |
| IP stock pagination deployment | Paginated IP stock search has a migration/release dependency. A checked-in route or test alone does not prove the connected database supports it | `IP-SEARCH-RELEASE.md`, `supabase/migrations/20260924120000_paginate_ip_stock_catalog.sql` |
| Stale IP picker/current price | IP fulfillment begins with server-rendered stock retained in dialog state. New search can fetch current values, but merely opening an old dialog may show stale quantity/price. IP-ticket settlement can use a new server price without the old preview being the committed price | `src/features/ip/fulfill-inventory-request-dialog.tsx`, `src/features/ip/inventory-request-actions.ts` |
| Inventory refresh | Global live sync watches medicine batches for pharmacy but omits general inventory items; source signatures need verification too. Test inventory direct edit → open/hidden IP picker separately from medicine stock | `src/components/layout/operational-live-sync.tsx`, `supabase/migrations/20260920130000_realtime_medicine_directory.sql` |
| Repeat adjustment identity | Batch dialog creates an operation key per mount; a second adjustment after reopening may be interpreted as the first retry. Verify legitimate repeated edits, not only double-click prevention | `src/features/pharmacy/medicine-dialogs.tsx`, `supabase/migrations/20260816260000_medicine_pack_size.sql` |
| Pack versus piece price | Batch UI stores pack price and pack size; quantity is individual units. Some stock labels can imply per-unit price while showing pack price. Verify quotes, allocation, imports, and print arithmetic with non-one pack size | `src/features/pharmacy/medicine-dialogs.tsx`, `src/app/(app)/pharmacy/stock/page.tsx`, `src/app/api/pharmacy/import/template/route.ts` |
| Supply beyond prescription | Current dispensing allows excess over requested units and raises the stored requested quantity with an audit. This needs explicit policy review against completed-clinical-record immutability; do not silently adopt it as the desired rule | `src/features/pharmacy/dispense-dialog.tsx`, `supabase/migrations/20260920140000_dispense_stock_ledger_snapshot.sql` |
| IP partial supply | Current IP item request closes after partial fulfillment and labels remainder unavailable. Ordinary prescription partial dispense can stay pending. A later IP supply needs a new request; the worked examples preserve this distinction | `supabase/migrations/20260825100000_ip_pharmacy_counter_settlement.sql`, `src/features/pharmacy/dispense-dialog.tsx` |
| Import limit and failure scope | Latest AGENTS.md sets a 1,000-row file limit; code allows 10,000 with 500-row chunks. Commits are per chunk, not whole file; current client blocks the file when validation has errors rather than importing only valid rows | `src/lib/domain/bulk-import.ts`, `src/features/pharmacy/bulk-import.tsx` |
| Re-import quantity | Matching existing batches adds imported opening quantity and updates metadata. Uploading the same file as a new operation can top up again; preview/retry policy must make this explicit | `supabase/migrations/20260825110000_complete_stock_movement_ledger.sql`, `src/features/pharmacy/import-schema.ts` |
| Procedure inventory expiry | Current procedure-item search checks active status and the sale path checks active/quantity without an equivalent expiry guard. Validate expired inventory through procedure billing as well as IP fulfillment | `supabase/migrations/20260920170000_paginate_inventory_lists.sql`, `supabase/migrations/20260825110000_complete_stock_movement_ledger.sql` |
| Tokens and encounter grouping | Doctor reassignment consumes a new doctor's token despite contrary UI copy. Multi-consultant print/retry grouping can include unrelated visits from the same patient/day; define an explicit encounter grouping expectation | `src/features/visits/reassign-consultant-dialog.tsx`, `src/app/print/token/[id]/page.tsx`, `supabase/migrations/20260815160000_per_doctor_token_series.sql` |
| Vitals during consultation | Current vitals RPC accepts in-consultation visits and writes Ready. All-blank values can also mark Ready; several numeric fields lack upper bounds. Preserve active status and obtain a clear required-field/unit/validation policy | `src/features/op/actions.ts`, `supabase/migrations/20260823230000_merge_reception_op_role.sql` |
| Draft and test-order replacement | Drafts require assessment and replace mutable lines without version checks. Resaving after a linked report may duplicate a surviving report-ready test; selected investigation category also needs persistence verification | `src/features/clinical/actions.ts`, `supabase/migrations/20260819120000_structured_diagnosis_entries.sql` |
| Doctor record scope | Some follow-up/report queries and doctor read policies appear broader than assigned/relevant patients. Route isolation alone is insufficient; test two doctors with distinct patients at list/file/RPC level | `src/app/(app)/doctor/follow-ups/page.tsx`, `src/app/(app)/reports/page.tsx`, `supabase/migrations/20260819090000_pharmacy_visit_read_access.sql` |
| Due work and complete history | Follow-up lists may include future/not-report-ready cases; trigger/source-state validation and the one-linked-follow-up limit need explicit coverage. Profile histories cap visits/reports at 50 and IP at 30 without older-page navigation | `src/app/(app)/reception/follow-ups/page.tsx`, `src/app/(app)/patients/[id]/page.tsx`, `supabase/migrations/20260811181300_followup_and_report_review.sql` |
| Archived-patient new work | Active autocomplete excludes archived patients, but direct profile/visit creation needs a matching server/database status guard or explicit policy allowing care | `src/features/patients/actions.ts`, `src/app/(app)/patients/[id]/page.tsx`, `src/features/visits/issue-visit.ts` |
| Upload retries/cleanup | Report upload lacks a stable idempotency key; duplicate submission can create additional rows/files. Storage cleanup after metadata failure is attempted without surfacing cleanup failure | `src/features/reports/actions.ts` |
| Prescription preview and fee option | Draft print lacks a distinct preview marker; optional fee lookup passes prescription ID where visit ID is expected. Verify print-status and identifier handling separately from clinical content | `src/app/(app)/visits/[id]/page.tsx`, `src/app/print/prescription/[id]/page.tsx` |
| Clinical lookup fallback | Basic search is local, but an exact-code miss may query/cache WHO ICD. Required local-only runtime behavior and this optional fallback differ; free-text consultation must remain usable when offline | `src/app/api/search/clinical-terms/route.ts`, `src/lib/search/who-icd10.ts` |
| Referral versus manual conversion | Formal referral discovery requires completed recommendation, while visit detail may expose Convert to IP without it. Decide whether this manual operational conversion is intended | `src/app/(app)/visits/[id]/page.tsx`, `supabase/migrations/20260818160000_fix_manual_prescription_and_referrals.sql` |
| Admission and staff validation | Bed uniqueness is guarded; duplicate active admission for the same patient in different beds and assignment to inactive IP staff require separate verification. Referral-list hiding is not a transactional patient guard | `supabase/migrations/20260823140000_ip_staff_assignment.sql`, `supabase/migrations/20260812005200_emergency_ip_patient_assignment.sql` |
| Concurrent IP payment | Current IP action inserts a payment after UI balance validation; this is not equivalent to an atomic database overpayment guard. Test two distinct collectors/operation keys against the same remaining balance | `src/features/ip/actions.ts`, `src/features/ip/ip-dialogs.tsx` |
| Pending supply at discharge | Finalization does not clearly resolve pending requests/IP prescriptions. Later IP-ticket settlement is blocked but counter settlement has different status checks. Agree how pending work closes before discharge | `supabase/migrations/20260812005200_emergency_ip_patient_assignment.sql`, `supabase/migrations/20260825100000_ip_pharmacy_counter_settlement.sql` |
| Final bill and history protection | Direct final-bill URL lacks a clear discharged-status gate; child-row update/delete protection must be checked beyond the ticket update guard. UI-hidden actions do not prove immutable history | `src/app/print/ip-bill/[id]/page.tsx`, `src/features/ip/bill-document.tsx`, `supabase/migrations/20260819130000_discharge_summary_procedure_fields.sql`, `supabase/tests/security.test.sql` |
| Missing operational controls | Direct doctor IP-prescribing, post-admission room transfer, admission cancellation, and formal post-completion amendments/refunds are not established UI flows. Record a gap/decision rather than pretending the test can click them | `src/app/(app)/ip/[id]/page.tsx`, `src/features/ip/actions.ts`, `src/features/pharmacy/manual-prescription-actions.ts` |
| Export retention | Later AGENTS.md clarification sets `EXPORT_RETENTION_DAYS=0`: generated ZIPs stay unless explicitly deleted. Earlier seven-day wording must not be used as the default | `AGENTS.md`, `src/features/exports/actions.ts` |
| Export completeness | Verify late payments on older visits, IP prescriptions/tests, all query pages, and missing document handling. Source export selection is not by itself proof of complete month activity | `src/features/exports/actions.ts` |

## 16. Source and existing-test map

The plan draws from [AGENTS.md](AGENTS.md), current route/action code, migration definitions, and existing test intent. Existing tests are starting points, not evidence that these flows pass in the deployed app.

| Area | Source / existing tests to extend when implementation is requested |
| --- | --- |
| Roles and sessions | `src/lib/auth/permissions.ts`, `src/lib/auth/dal.ts`, `src/components/layout/navigation.ts`, `e2e/role-isolation.spec.ts`, `e2e/role-session-journeys.spec.ts`, `supabase/tests/security.test.sql` |
| Admin/configuration | `src/features/admin/`, `src/features/rooms/`, `e2e/admin-smoke.spec.ts`, `e2e/admin-pagination.spec.ts` |
| Patient/reception/OP | `src/features/patients/`, `src/features/reception/`, `src/features/visits/`, `src/features/op/`, `e2e/reception-quick-registration.spec.ts`, `e2e/reception-visits.spec.ts`, `e2e/multi-consultant-visit.spec.ts` |
| Clinical/reports | `src/features/clinical/`, `src/features/reports/`, `e2e/report-follow-up-flow.spec.ts`, `e2e/op-to-pharmacy-flow.spec.ts` |
| Pharmacy/IP stock | `src/features/pharmacy/`, `src/features/ip/inventory-request-actions.ts`, `e2e/ip-item-request-ui.spec.ts`, `e2e/pharmacy-outside-purchase.spec.ts`, `supabase/tests/pharmacy_dispense_workflow.test.sql`, `supabase/tests/ip_inventory_request_workflow.test.sql`, `supabase/tests/ip_stock_pagination.test.sql` |
| IP operations | `src/features/ip/`, `e2e/ip-ticket-flow.spec.ts`, `e2e/ip-referral-flow.spec.ts`, `e2e/ip-staff-assignment.spec.ts`, `e2e/ip-role-navigation.spec.ts` |
| Import/export | `src/features/pharmacy/import-schema.ts`, `src/features/pharmacy/bulk-import.tsx`, `src/features/exports/`. `e2e/bulk-import.spec.ts` tests patient import; medicine import → stock → IP requires its own browser coverage |
| Reconciliation/print/mobile | `src/features/dashboard/`, `src/app/print/`, `e2e/analytics-charts.spec.ts`, `e2e/print-documents.spec.ts`, `e2e/mobile-critical-flow.spec.ts`, `e2e/full-surface-audit.spec.ts` |
