import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const fullName = process.env.FIRST_ADMIN_NAME?.trim();
const email = process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.FIRST_ADMIN_PASSWORD;

if (!url || !serviceKey || !fullName || !email || !password) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRST_ADMIN_NAME, " +
      "FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD are required.",
  );
}
if (fullName.length < 2) throw new Error("FIRST_ADMIN_NAME must contain at least two characters.");
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("FIRST_ADMIN_EMAIL is invalid.");
if (
  password.length < 12 ||
  !/[a-z]/.test(password) ||
  !/[A-Z]/.test(password) ||
  !/[0-9]/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error(
    "FIRST_ADMIN_PASSWORD must be at least 12 characters and include upper-case, " +
      "lower-case, numeric and symbol characters.",
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: existingError } = await admin
  .from("profiles")
  .select("id")
  .eq("role", "admin")
  .limit(1);
if (existingError) throw new Error(`Could not inspect profiles: ${existingError.message}`);
if (existing?.length) {
  throw new Error("An admin profile already exists. Create or reactivate later users from Admin -> Users.");
}

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, role: "admin" },
});
if (error || !data.user) throw new Error(`Could not create the first admin: ${error?.message ?? "unknown error"}`);

const userId = data.user.id;
const { data: profile, error: profileError } = await admin
  .from("profiles")
  .select("id, role, status")
  .eq("id", userId)
  .maybeSingle();

if (profileError || profile?.role !== "admin" || profile.status !== "active") {
  const { error: rollbackError } = await admin.auth.admin.deleteUser(userId);
  throw new Error(
    `Auth user was created but the admin profile was not verified.${
      rollbackError ? ` Automatic rollback also failed: ${rollbackError.message}` : " The auth user was rolled back."
    }`,
  );
}

const { error: auditError } = await admin.from("audit_logs").insert({
  actor_user_id: userId,
  action: "FIRST_ADMIN_CREATED",
  entity_type: "profile",
  entity_id: userId,
  metadata: { source: "create-first-admin" },
});
if (auditError) console.warn(`Admin created, but the bootstrap audit entry failed: ${auditError.message}`);

console.log(`First admin created successfully for ${email}. Remove FIRST_ADMIN_PASSWORD from the environment now.`);
