"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { validatePatientImportRows } from "./import-schema";
import { normalizeIndianPhone } from "@/lib/domain/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const patientSchema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(120),
  // Blank UHID is allowed: the database trigger issues the next MH-###### code.
  uhid: z.string().trim().max(30).optional(),
  phone: z.string().trim(),
  dob: z.string().optional(),
  age: z.string().trim().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]),
  bloodGroup: z.string().trim().max(10).optional(),
  address: z.string().trim().max(500).optional(),
  allergies: z.string().trim().max(1000).optional(),
  referenceDetail: z.string().trim().max(200).optional(),
});

/**
 * Patients often know their age but not their birth date. An age is converted to
 * a dob of 1 January that year and flagged approximate, so age still displays
 * correctly without inventing a precise birthday.
 */
function resolveDob(dob?: string, age?: string) {
  if (dob) return { dob, approximate: false };
  const years = age ? Number(age) : Number.NaN;
  if (!Number.isFinite(years) || years < 0 || years > 120) return { dob: null, approximate: false };
  return { dob: `${new Date().getFullYear() - Math.floor(years)}-01-01`, approximate: true };
}

export async function createPatient(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("createPatient");
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let phone: string;
  try { phone = normalizeIndianPhone(parsed.data.phone); }
  catch (error) { return { ok: false, fieldErrors: { phone: [(error as Error).message] } }; }

  const { dob, approximate } = resolveDob(parsed.data.dob, parsed.data.age);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("patients").insert({
    name: parsed.data.name,
    uhid: parsed.data.uhid?.toUpperCase() || undefined,
    phone_normalized: phone,
    dob,
    dob_is_approximate: approximate,
    gender: parsed.data.gender,
    blood_group: parsed.data.bloodGroup || null,
    address: parsed.data.address || null,
    allergies: parsed.data.allergies || null,
    reference_detail: parsed.data.referenceDetail || null,
  }).select("id").single();

  // Phone is deliberately no longer unique (families share numbers); only a
  // duplicate UHID can trip this now.
  if (error?.code === "23505") return { ok: false, fieldErrors: { uhid: ["This UHID already belongs to another patient."] } };
  if (error || !data) return { ok: false, message: "Patient could not be created. Please try again." };
  revalidatePath("/patients"); revalidatePath("/reception");
  return { ok: true, message: "Patient created.", data: { patientId: data.id } };
}

const patientUpdateSchema = patientSchema.extend({ patientId: databaseIdSchema, status: z.enum(["active", "archived"]) });
export async function updatePatient(_: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("createPatient"); const parsed = patientUpdateSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let phone: string; try { phone = normalizeIndianPhone(parsed.data.phone); } catch (error) { return { ok: false, fieldErrors: { phone: [(error as Error).message] } }; }
  const { dob, approximate } = resolveDob(parsed.data.dob, parsed.data.age);
  const supabase = await createSupabaseServerClient(); const { error } = await supabase.from("patients").update({ name: parsed.data.name, ...(parsed.data.uhid ? { uhid: parsed.data.uhid.toUpperCase() } : {}), phone_normalized: phone, dob, dob_is_approximate: approximate, gender: parsed.data.gender, blood_group: parsed.data.bloodGroup || null, address: parsed.data.address || null, allergies: parsed.data.allergies || null, reference_detail: parsed.data.referenceDetail || null, status: parsed.data.status }).eq("id", parsed.data.patientId);
  if (error) return { ok: false, message: error.code === "23505" ? "That UHID already belongs to another patient." : "Patient could not be updated." };
  await createSupabaseAdminClient().from("audit_logs").insert({ actor_user_id: actor.id, action: parsed.data.status === "archived" ? "PATIENT_ARCHIVED" : "PATIENT_UPDATED", entity_type: "patient", entity_id: parsed.data.patientId });
  revalidatePath(`/patients/${parsed.data.patientId}`); revalidatePath("/patients"); return { ok: true, message: "Patient updated." };
}

const patientImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  rows: z.string(),
  idempotencyKey: databaseIdSchema,
});

/**
 * One chunk of a bulk patient import. The browser has already validated every
 * row; this re-validates server-side (never trust the client) and hands the
 * chunk to a single transactional RPC.
 */
export async function importPatients(
  rows: unknown[],
  fileName: string,
  idempotencyKey: string,
): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
  await requirePermission("createPatient");
  const parsed = patientImportSchema.safeParse({ fileName, rows: JSON.stringify(rows), idempotencyKey });
  if (!parsed.success) return { ok: false, message: "Import payload is invalid." };

  const checked = validatePatientImportRows(rows);
  if (checked.invalid.length || checked.valid.length === 0)
    return { ok: false, message: "Resolve all validation errors before importing." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("bulk_import_patients", {
    p_rows: checked.valid,
    p_file_name: fileName,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, message: "The transaction failed; no rows in this batch were saved." };

  revalidatePath("/patients");
  revalidatePath("/dashboard");
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}
