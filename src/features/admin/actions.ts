"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";
const userSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.email().trim().toLowerCase(),
  password: z
    .string()
    .min(10)
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[0-9]/, "Include a number."),
  role: z.enum(["admin", "reception", "op", "ip", "pharmacy"]),
});
export async function createStaffUser(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageUsers");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, role: parsed.data.role },
  });
  if (error || !data.user)
    return {
      ok: false,
      message: error?.message.includes("registered")
        ? "An account with this email already exists."
        : "Staff account could not be created.",
    };
  await admin
    .from("audit_logs")
    .insert({
      action: "USER_CREATED",
      entity_type: "profile",
      entity_id: data.user.id,
      metadata: { role: parsed.data.role },
    });
  revalidatePath("/admin/users");
  return { ok: true, message: "Staff account created." };
}
const doctorSchema = userSchema
  .extend({
    departmentId: databaseIdSchema,
    specialization: z.string().max(150).optional(),
    qualification: z.string().max(150).optional(),
    registrationNumber: z.string().min(2).max(100),
    opFee: z.string(),
    followUpFee: z.string(),
    ipFee: z.string(),
  })
  .omit({ role: true });
export async function createDoctor(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageDoctors");
  const parsed = doctorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let op: number, follow: number, ip: number;
  try {
    op = rupeesToPaise(parsed.data.opFee);
    follow = rupeesToPaise(parsed.data.followUpFee);
    ip = rupeesToPaise(parsed.data.ipFee);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const admin = createSupabaseAdminClient();
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName, role: "doctor" },
    });
  if (authError || !authData.user)
    return { ok: false, message: "Doctor login could not be created." };
  const userId = authData.user.id;
  const { data: doctor, error: doctorError } = await admin
    .from("doctors")
    .insert({
      profile_id: userId,
      display_name: parsed.data.fullName,
      department_id: parsed.data.departmentId,
      specialization: parsed.data.specialization || null,
      qualification: parsed.data.qualification || null,
      registration_number: parsed.data.registrationNumber,
      op_fee_paise: op,
      follow_up_fee_paise: follow,
      ip_visit_fee_paise: ip,
    })
    .select("id")
    .single();
  if (doctorError || !doctor) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return {
      ok: false,
      message:
        "Doctor profile could not be created; the login was rolled back.",
    };
  }
  const { error: linkError } = await admin
    .from("profiles")
    .update({ doctor_id: doctor.id })
    .eq("id", userId);
  if (linkError) {
    await admin.from("doctors").delete().eq("id", doctor.id);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return {
      ok: false,
      message: "Doctor linking failed; all partial records were rolled back.",
    };
  }
  await admin
    .from("audit_logs")
    .insert({
      action: "DOCTOR_CREATED",
      entity_type: "doctor",
      entity_id: doctor.id,
    });
  revalidatePath("/admin/doctors");
  return { ok: true, message: "Doctor and login created." };
}

const staffUpdateSchema = z.object({
  userId: databaseIdSchema,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "reception", "op", "ip", "pharmacy"]),
  status: z.enum(["active", "inactive"]),
  password: z.string().min(10).optional().or(z.literal("")),
});
export async function updateStaffUser(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("manageUsers");
  const parsed = staffUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  if (actor.id === parsed.data.userId && (parsed.data.status !== "active" || parsed.data.role !== "admin"))
    return { ok: false, message: "You cannot deactivate or remove the admin role from your own account." };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({
    full_name: parsed.data.fullName,
    role: parsed.data.role,
    status: parsed.data.status,
  }).eq("id", parsed.data.userId).neq("role", "doctor");
  if (error) return { ok: false, message: "Staff account could not be updated." };
  if (parsed.data.password) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: parsed.data.password });
    if (passwordError) return { ok: false, message: "Profile updated, but the password reset failed." };
  }
  await admin.from("audit_logs").insert({
    actor_user_id: actor.id,
    action: parsed.data.status === "inactive" ? "USER_DEACTIVATED" : "USER_UPDATED",
    entity_type: "profile",
    entity_id: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: "Staff account updated." };
}

const doctorUpdateSchema = z.object({
  doctorId: databaseIdSchema,
  departmentId: databaseIdSchema,
  displayName: z.string().trim().min(2).max(120),
  specialization: z.string().trim().max(150).optional(),
  qualification: z.string().trim().max(150).optional(),
  registrationNumber: z.string().trim().min(2).max(100),
  opFee: z.string(),
  followUpFee: z.string(),
  ipFee: z.string(),
  active: z.string().optional(),
});
export async function updateDoctor(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("manageDoctors");
  const parsed = doctorUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let op: number, follow: number, ip: number;
  try {
    op = rupeesToPaise(parsed.data.opFee);
    follow = rupeesToPaise(parsed.data.followUpFee);
    ip = rupeesToPaise(parsed.data.ipFee);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("doctors").update({
    display_name: parsed.data.displayName,
    department_id: parsed.data.departmentId,
    specialization: parsed.data.specialization || null,
    qualification: parsed.data.qualification || null,
    registration_number: parsed.data.registrationNumber,
    op_fee_paise: op,
    follow_up_fee_paise: follow,
    ip_visit_fee_paise: ip,
    active: parsed.data.active === "on",
  }).eq("id", parsed.data.doctorId);
  if (error) return { ok: false, message: "Doctor details could not be updated." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "DOCTOR_UPDATED", entity_type: "doctor", entity_id: parsed.data.doctorId });
  revalidatePath("/admin/doctors");
  return { ok: true, message: "Doctor updated." };
}
