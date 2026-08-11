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

Useful checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, or all four with `pnpm verify`. Database tests run with `pnpm db:test`. Browser tests run with `pnpm test:e2e` after `pnpm exec playwright install chromium`.

Hosted migrations use `supabase link --project-ref <ref>` followed by `pnpm db:push`. Never place a service-role key in a public variable.
