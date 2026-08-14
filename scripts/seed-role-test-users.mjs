import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_STAFF_PASSWORD;
if (!url || !serviceKey || !password) throw new Error("Supabase URL, service key, and DEMO_STAFF_PASSWORD are required.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const accounts = [
  ["admin", "Test Admin", "test.admin@meenakshihospital.com"],
  ["reception", "Test Reception", "test.reception@meenakshihospital.com"],
  ["op", "Test OP Staff", "test.op@meenakshihospital.com"],
  ["doctor", "Dr Test Doctor", "test.doctor@meenakshihospital.com"],
  ["ip", "Test IP Staff", "test.ip@meenakshihospital.com"],
  ["pharmacy", "Test Pharmacy", "test.pharmacy@meenakshihospital.com"],
];

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const byEmail = new Map(listed.users.map((user) => [user.email?.toLowerCase(), user]));
const results = [];

for (const [role, fullName, email] of accounts) {
  let user = byEmail.get(email);
  let operation = "updated";
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { full_name: fullName, role } });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role } });
    if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
    user = data.user;
    operation = "created";
  }

  const { error: profileError } = await admin.from("profiles").upsert({ id: user.id, full_name: fullName, email, role, status: "active" }, { onConflict: "id" });
  if (profileError) throw profileError;

  if (role === "doctor") {
    const { data: department, error: departmentError } = await admin.from("departments").select("id").eq("active", true).order("created_at").limit(1).single();
    if (departmentError || !department) throw new Error("Create an active department before seeding the doctor test account.");
    const { data: existingDoctor } = await admin.from("doctors").select("id").eq("profile_id", user.id).maybeSingle();
    let doctorId = existingDoctor?.id;
    if (doctorId) {
      const { error } = await admin.from("doctors").update({ display_name: fullName, department_id: department.id, specialization: "General Medicine", qualification: "MBBS", registration_number: "TEST-DOCTOR-001", op_fee_paise: 50000, follow_up_fee_paise: 30000, ip_visit_fee_paise: 50000, active: true }).eq("id", doctorId);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("doctors").insert({ profile_id: user.id, display_name: fullName, department_id: department.id, specialization: "General Medicine", qualification: "MBBS", registration_number: "TEST-DOCTOR-001", op_fee_paise: 50000, follow_up_fee_paise: 30000, ip_visit_fee_paise: 50000, active: true }).select("id").single();
      if (error || !data) throw error ?? new Error("Doctor record could not be created.");
      doctorId = data.id;
    }
    const { error: linkError } = await admin.from("profiles").update({ doctor_id: doctorId }).eq("id", user.id);
    if (linkError) throw linkError;
  }
  results.push({ role, email, operation });
}

console.log(JSON.stringify(results, null, 2));
