# Meenakshi HMS — working status

_Last updated: 23 Aug 2026, from the working session. Everything below is
uncommitted unless stated otherwise._

## Right now

Nothing in progress — handing over.

Last changes: every type-ahead and table search now shares a **500 ms**
debounce. This covers diagnosis, clinical terms, medicines, patients,
allergies, reception registration, manual-prescription patient lookup,
location autocomplete, and the shared `DebouncedSearchInput`. In-flight stale
requests are aborted when the query changes. IP staff now also have the same
read-only Drug Stock availability page as OP staff. API callers were audited as a
whole: closed controls no longer issue hidden searches, duplicate notification
work is removed, and the service worker caches only public static assets—not
private pages, RSC payloads, API responses, stock, or patient data. The timing
tests were updated; 78/78 unit tests, lint, `tsc`, the production build, the IP
billing flow, and the complete six-role surface audit all pass.

## Done and verified this session

**The big one — the database was 10 migrations behind the code.**
`supabase_migrations.schema_migrations` jumped from `20260818250000` straight
to today, so ten migration files had never been applied. Three RPCs the app
calls did not exist in the database at all, which is why
`/print/procedure-bill/…` returned 404. All ten are now applied and every one
of the 55 RPCs the code calls is present.

| Fixed | Detail |
|---|---|
| Prescription prints 404 for pharmacy | Pharmacy could read `prescriptions` but not the tables it points at, so the patient embed was null and the page 404'd — for OP and IP alike |
| Pharmacy IP access + reprints | Kept the narrow, time-bound access model and closed two gaps: IP tickets (no visit at all) and reprinting a sale already dispensed. Pharmacy sees **19 of 100,670** patients |
| Procedure bill / shortage note 404 | Caused by the unapplied migrations above |
| Dose prompted "1 tablet" for a syrup | Dose box, quantity unit and default route now follow the medicine's dosage form (syrup → `5 ml`, injection → `1 ml` + IV, inhaler → `2 puffs`) |
| Add-medicine dialog | Generic name, strength, dosage form and manufacturer are type-or-pick and **learn** whatever is typed, via a trigger-maintained options table (not a `select distinct` over the directory) |
| Batch dialog order | "Number of packs" now comes before "Units per pack" |
| Unsupplied medicines | Receipt names what was not handed over (not charged), plus a new **Outside Purchase Prescription** print with prescriber and registration number for an outside chemist |
| Doctors admitting directly | Removed — doctors refer, IP staff admit. Admin keeps the override. A doctor now sees `Referred for admission · awaiting IP staff` or `Admitted · IP-…` |
| IP staff assignment | Reception names the IP staff member when converting; IP staff can **Take & Admit** a referral; **My Patients** filter; reassignment for handover, audited |
| Consultant load | Reception's doctor dropdown shows today's OP queue and current IP load per doctor (`OP 4` / `IP 2` / `free`) |
| API returned 500 for "not allowed" | Unauthorized API calls now answer **403**, not an unhandled 500 |
| `startConsultation` fired twice | Effect now runs once per visit instead of twice per open |
| Realtime never delivered | The socket authenticated as `anon`, so RLS filtered every row. Now authenticated as the signed-in user; an external `UPDATE` reaches an open screen |
| Print size | All documents are full A4 except the token and the payment receipt. Print padding removed so the sheet starts at the page margin |
| Add IP charge policy | Removed the custom/manual option. UI and server now accept active Charge-master entries only; direct `ip_charges` inserts are blocked and the controlled RPC re-checks the charge, ticket status, and idempotency in the database |
| IP ticket E2E | Updated the test to select a configured charge and use its rate; the charge/payment/running-bill flow now passes |
| Search request bursts | All API-backed search inputs and server-filter inputs now wait 500 ms; stale requests are cancelled |
| API traffic + cache safety | Removed mount-time medicine/patient/allergy calls, duplicate notification-page polling, and abandoned KPI requests. Dynamic/private APIs remain fresh and non-cacheable; only non-patient clinical reference searches get a short private cache |
| Service-worker data cache | It previously cached `/api`, RSC, patient, stock, and authenticated page responses. V2 deletes those old caches and stores only the offline shell plus public versioned assets |
| IP role navigation | IP staff now have separate Current Patients, My Patients, Pending Discharge, Discharged, and All Tickets sidebar pages. Admin and doctor retain the combined tabbed IP page |
| IP drug stock | IP staff now have the same read-only Drug Stock lookup as OP staff, showing availability without prices, batch costs, editing, dispensing, or stock reduction |

**Full surface audit** (`e2e/full-surface-audit.spec.ts`): all 6 roles × every
page, every print document and every API route — **passing**. This is new; it
exists because feature-by-feature testing kept missing whole-surface breakage.

## Should do soon

1. **Commit.** Nothing from this working tree is committed. The
   `20260823170000_configured_ip_charges.sql` migration is applied to the
   configured Supabase project, so the database is ahead of git until the
   repository changes are committed.
2. **Deploy.** Still localhost only.
3. **Passwords.** All six role accounts share `Meenakshi@2026`. Must change
   before handover.
4. **Import the real medicine list.** The directory holds ~29 demo entries.
5. Print QA on real paper, and one restore-from-backup drill.

## Known, not bugs

- `/api/search/locations` answers **503** — the Geoapify address autocomplete
  key is not configured. Deployment setting, not a fault.
- A doctor gets a 404 on another consultant's IP ticket, discharge summary or
  prescription. That is the RLS policy working as designed.
