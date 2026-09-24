# Cleanup result — A + B

Completed: 2026-09-21T07:08:05.212Z

Scope approved by the owner: A + B. C was excluded.

## Database counts

| Table | Before | Removed | After |
| --- | ---: | ---: | ---: |
| audit_logs | 8,820 | 8,514 | 306 |
| consultation_diagnoses | 45 | 45 | 0 |
| consultations | 45 | 45 | 0 |
| ip_charges | 29 | 29 | 0 |
| ip_inventory_request_items | 15 | 15 | 0 |
| ip_inventory_requests | 15 | 15 | 0 |
| ip_payments | 14 | 14 | 0 |
| ip_progress_notes | 0 | 0 | 0 |
| ip_tickets | 15 | 15 | 0 |
| medicine_batches | 166 | 33 | 133 |
| medicine_directory | 193 | 33 | 160 |
| patient_reports | 11 | 11 | 0 |
| patients | 7,928 | 7,927 | 1 |
| pharmacy_sale_items | 28 | 28 | 0 |
| pharmacy_sales | 28 | 28 | 0 |
| prescription_items | 34 | 34 | 0 |
| prescriptions | 45 | 45 | 0 |
| procedure_sale_items | 0 | 0 | 0 |
| procedure_sales | 0 | 0 | 0 |
| stock_movements | 236 | 76 | 160 |
| test_orders | 11 | 11 | 0 |
| visit_payments | 28 | 28 | 0 |
| visits | 184 | 182 | 2 |
| vitals | 60 | 59 | 1 |

## Verification

- Remaining marked patients: 0.
- Remaining marked medicines: 0.
- All 1 unmarked patient rows and 160 unmarked medicine rows retained identical row fingerprints.
- All 2,527 clinical directory rows retained identical row fingerprints.
- Staff profiles and authentication accounts retained identical row fingerprints.
- All other public tables retained their original row counts.
- Checked 89 foreign key relationships; no new orphan records.
- Removed linked test report files: 11; remaining storage objects for those paths: 0.

## Stock restoration

| Retained batch | Before | Restored | After |
| --- | ---: | ---: | ---: |
| fb69654c-7762-4ab0-b31b-fcaded4e46ec | 6 | 24 | 30 |
| fb533e9b-d065-49fd-9a04-cc11fcd80171 | 8 | 12 | 20 |
| b37b178d-2da0-4249-bea3-c91c9c59ced0 | 0 | 6 | 6 |
| c1eaf396-77ac-49a0-ad26-f396345afe58 | 1 | 6 | 7 |

Test batches were deleted; the retained batches above received exactly the quantities reversed from test stock movements.

The database cleanup committed only after count, protected-row fingerprint, stock, and foreign-key checks passed. Linked test storage files were then removed and checked.

The existing teardown’s attempt to null follow-up links violated the visit-type check constraint. That attempt rolled back. The successful execution omitted this unnecessary update and verified references before committing.

## Follow-up: empty Medicine Master

Completed: 2026-09-21T07:11:22.542Z. Owner separately requested an empty Medicine Master.

Used the existing `delete_medicine` function under the configured active admin account, with its audit trail and reference checks enabled.

| Item | Before | After |
| --- | ---: | ---: |
| Main Medicine Master entries | 159 | 0 |
| Entries in Removed | 1 | 133 |
| Total stored medicine definitions | 160 | 133 |
| Stock batches | 133 | 133 |
| Active stock batches | 131 | 0 |
| Stored stock units | 8549 | 8549 |
| Stock ledger entries | 160 | 160 |
| Audit log entries | 306 | 465 |

Deleted 27 unused definitions and archived 132 definitions. One definition was already archived. All 133 retained definitions are in Removed; their stock batches are inactive. Quantities and stock ledger records remain intact.

Verified the exact Medicine Master listing function returns zero rows. Patient, visit, vitals, clinical directory, prescription item, pharmacy sale item, IP inventory request item, and stock ledger fingerprints were unchanged.
