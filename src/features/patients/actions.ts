"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { normalizeIndianPhone } from "@/lib/domain/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/types/hospital";

const patientSchema = z.object({
  name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(120),
  phone: z.string().trim(),
  dob: z.string().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]),
  bloodGroup: z.string().trim().max(10).optional(),
  address: z.string().trim().max(500).optional(),
  allergies: z.string().trim().max(1000).optional(),
});

export async function createPatient(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("createPatient");
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let phone: string;
  try { phone = normalizeIndianPhone(parsed.data.phone); }
  catch (error) { return { ok: false, fieldErrors: { phone: [(error as Error).message] } }; }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("patients").insert({
    name: parsed.data.name,
    phone_normalized: phone,
    dob: parsed.data.dob || null,
    gender: parsed.data.gender,
    blood_group: parsed.data.bloodGroup || null,
    address: parsed.data.address || null,
    allergies: parsed.data.allergies || null,
  }).select("id").single();

  if (error?.code === "23505") return { ok: false, message: "A patient with this phone number already exists." };
  if (error || !data) return { ok: false, message: "Patient could not be created. Please try again." };
  revalidatePath("/patients");
  return { ok: true, message: "Patient created.", data: { patientId: data.id } };
}

const patientUpdateSchema = patientSchema.extend({ patientId: z.uuid(), status: z.enum(["active", "archived"]) });
export async function updatePatient(_: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("createPatient"); const parsed = patientUpdateSchema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let phone: string; try { phone = normalizeIndianPhone(parsed.data.phone); } catch (error) { return { ok: false, fieldErrors: { phone: [(error as Error).message] } }; }
  const supabase = await createSupabaseServerClient(); const { error } = await supabase.from("patients").update({ name: parsed.data.name, phone_normalized: phone, dob: parsed.data.dob || null, gender: parsed.data.gender, blood_group: parsed.data.bloodGroup || null, address: parsed.data.address || null, allergies: parsed.data.allergies || null, status: parsed.data.status }).eq("id", parsed.data.patientId);
  if (error) return { ok: false, message: error.code === "23505" ? "That phone Patient ID already belongs to another patient." : "Patient could not be updated." };
  await createSupabaseAdminClient().from("audit_logs").insert({ actor_user_id: actor.id, action: parsed.data.status === "archived" ? "PATIENT_ARCHIVED" : "PATIENT_UPDATED", entity_type: "patient", entity_id: parsed.data.patientId });
  revalidatePath(`/patients/${parsed.data.patientId}`); revalidatePath("/patients"); return { ok: true, message: "Patient updated." };
}
