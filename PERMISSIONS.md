# Permissions

The six V1 roles are `admin`, `reception`, `op`, `doctor`, `ip`, and `pharmacy`. Controls are enforced in navigation, the Next.js DAL/actions, and PostgreSQL RLS.

- Admin: full operational and administration access.
- Reception: demographics, visits, offline visit payments, follow-ups, report-ready workflow.
- OP: queue, vitals, permitted report uploads; no finance.
- Doctor: assigned clinical care, prescriptions, tests, and own IP notes; no finance.
- IP: admissions, operational charges/payments, and discharge; no doctor-note editing.
- Pharmacy: medicine/batch management and transactional dispensing; minimal clinical access.

Server actions are public endpoints from a security perspective and must call `getCurrentProfile`/`requirePermission`. UI hiding is never accepted as authorization.
