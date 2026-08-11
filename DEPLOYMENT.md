# Deployment

1. Provision Supabase and apply migrations with `pnpm db:push`.
2. Configure all values from `.env.example` in the hosting platform. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. Set Supabase Auth Site URL/redirect allow-list to the production HTTPS origin.
4. Run `pnpm verify` in CI and deploy with `pnpm build` / `pnpm start`.
5. Confirm private buckets, RLS tests, login, role isolation, token print, and dispense concurrency in staging.

Monthly exports and patient documents contain sensitive data; signed URLs must be short-lived and logs must not contain clinical payloads.
