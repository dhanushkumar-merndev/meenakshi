# Meenakshi Hospital Management System

Next.js 16, shadcn/ui, and Supabase foundation for Meenakshi Hospital. Authentication is email/password only, patient identity is an internal UUID with the normalized phone shown to staff, payments are append-only offline records, and pharmacy stock changes only through the transactional dispense RPC.

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.local`.
3. Start Supabase: `pnpm db:start`
4. Copy the local URL, anon key, and service-role key printed by the CLI into `.env.local`.
5. Rebuild the database: `pnpm db:reset`
6. Create the first admin as described in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
7. Start the app: `pnpm dev`

Useful checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, or all four with `pnpm verify`. Database tests run with `pnpm db:test`.

### Browser tests

`pnpm exec playwright install chromium` once, then `pnpm test:e2e`.

The suite signs in as real staff accounts, so it needs credentials in `.env`:

```
E2E_PASSWORD=            # shared password for the five account types
E2E_ADMIN_EMAIL=         # defaults to admin@meenakshihospital.com
E2E_DOCTOR_NAME=         # display name of the doctor the doctor account is linked to
```

Each role signs in as `<role>@meenakshihospital.com` unless `E2E_<ROLE>_EMAIL` overrides it. Without `E2E_PASSWORD` the authenticated specs skip rather than fail. Point the suite at an already-running dev server with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e`.

The specs write to whatever database `.env` points at — registering a patient, completing a consultation, dispensing stock, adding an IP charge. Run them against a test project, never production.

Coverage: the full reception/OP→pharmacy flow, IP charges and payments, role isolation for all five account types, printed-document letterheads, the money-free token, and mobile layout at 390px.

Hosted migrations use `supabase link --project-ref <ref>` followed by `pnpm db:push`. Never place a service-role key in a public variable.

## SNOMED CT terminology

SNOMED CT is not committed to this repository. It is licensed terminology and
must be obtained by the hospital from SNOMED International or its national
release centre. After applying migrations, import an extracted International
RF2 Snapshot package with:

```bash
pnpm db:import-snomed -- /absolute/path/to/SnomedCT_InternationalRF2_PRODUCTION_<date> \
  --project <SUPABASE_PROJECT_ID> --yes
```

Without `--yes`, the command is a dry run. It verifies the release and reports
counts without changing the database. A real import requires the project ref to
match `.env`, replaces the prior active terminology in one transaction, stores
the package version and licence statement, and rolls back completely on error.
Only current active English concepts, preferred terms and synonyms are retained;
RF2 Full history, OWL and relationship files stay outside the operational HMS.
The original release ZIP is the recovery copy and should be stored privately.
