# Supabase setup

Create a Supabase project, disable public signup, and set the Site URL to the deployed application. Link it with `pnpm exec supabase link --project-ref <project-ref>`, preview pending migrations with `pnpm exec supabase migration list`, then run `pnpm db:push`.

The migrations create private `patient-documents` and `hospital-exports` buckets, all core tables, indexes, RLS policies, and transactional visit/dispense functions.

## First admin

Use the Supabase dashboard once, or a temporary server-only script with `auth.admin.createUser`, setting user metadata to `{"full_name":"Hospital Admin","role":"admin"}` and `email_confirm: true`. Delete any temporary script immediately. Never run this from browser code. Subsequent accounts must be created through an authenticated admin server action.

Local Supabase requires a working Docker-compatible socket. If `supabase start` reports a missing `/var/run/docker.sock`, start Docker/Podman and retry.
