"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import { CHARGE_MASTER_CATEGORIES } from "@/lib/domain/charge-categories";
import { validateClinicalImportRows } from "./clinical-import-schema";
import type { ActionState } from "@/types/hospital";

const optionalId = z.string().uuid().optional().or(z.literal(""));
async function adminActor() {
  const actor = await requirePermission("manageUsers");
  return { actor, admin: createSupabaseAdminClient() };
}

export async function saveDepartment(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional(), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  const values = { name: parsed.data.name, description: parsed.data.description || null, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("departments").update(values).eq("id", parsed.data.id) : admin.from("departments").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This department already exists." : "Department could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "DEPARTMENT_SAVED", entity_type: "department", entity_id: parsed.data.id || null });
  revalidatePath("/admin/masters");
  return { ok: true, message: "Department saved." };
}

export async function saveCharge(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, category: z.enum(CHARGE_MASTER_CATEGORIES), name: z.string().trim().min(2).max(120), amount: z.string(), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let amount: number;
  try { amount = rupeesToPaise(parsed.data.amount); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const { actor, admin } = await adminActor();
  const values = { category: parsed.data.category, charge_name: parsed.data.name, amount_paise: amount, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("charges").update(values).eq("id", parsed.data.id) : admin.from("charges").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This charge already exists." : "Charge could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "CHARGE_SAVED", entity_type: "charge", entity_id: parsed.data.id || null });
  revalidatePath("/admin/masters");
  return { ok: true, message: "Charge saved." };
}

export async function saveReportCategory(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, name: z.string().trim().min(2).max(100), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  const values = { name: parsed.data.name, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("report_categories").update(values).eq("id", parsed.data.id) : admin.from("report_categories").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This category already exists." : "Category could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "REPORT_CATEGORY_SAVED", entity_type: "report_category", entity_id: parsed.data.id || null });
  revalidatePath("/admin/masters");
  return { ok: true, message: "Report category saved." };
}

export async function saveClinicalTerm(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, type: z.string().trim().min(2).max(50), displayText: z.string().trim().min(2).max(300), aliases: z.string().trim().max(1000).optional(), source: z.string().trim().min(2).max(120), code: z.string().trim().max(50).optional(), codeSystem: z.string().trim().max(50).optional(), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  // A code without its system (or vice versa) is meaningless, so both are
  // dropped together rather than storing a code nobody can attribute --
  // this is how a hospital adds its own SNOMED-CT (or any other) coded terms
  // one at a time, the same code_system column the bulk import already writes.
  const values = { term_type: parsed.data.type, display_text: parsed.data.displayText, search_aliases: (parsed.data.aliases ?? "").split(",").map((item) => item.trim()).filter(Boolean), source: parsed.data.source, code: parsed.data.code && parsed.data.codeSystem ? parsed.data.code : null, code_system: parsed.data.code && parsed.data.codeSystem ? parsed.data.codeSystem : null, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("clinical_terms").update(values).eq("id", parsed.data.id) : admin.from("clinical_terms").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This clinical term already exists." : "Clinical term could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "CLINICAL_TERM_SAVED", entity_type: "clinical_term", entity_id: parsed.data.id || null });
  revalidatePath("/admin/clinical-directory");
  return { ok: true, message: "Clinical term saved." };
}

const deletableMasterSchema = z.object({
  entity: z.enum(["department", "charge", "report_category", "clinical_term", "room_bed", "medicine", "medicine_batch"]),
  id: z.string().uuid(),
});

const deletePaths = {
  department: "/admin/masters",
  charge: "/admin/masters",
  report_category: "/admin/masters",
  clinical_term: "/admin/clinical-directory",
  room_bed: "/admin/masters",
  medicine: "/pharmacy/medicines",
  medicine_batch: "/pharmacy/stock",
} as const;

export async function deleteMasterRecord(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deletableMasterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid delete request." };
  const { actor, admin } = await adminActor();
  const { entity, id } = parsed.data;
  let error: { code?: string } | null = null;

  if (entity === "department") ({ error } = await admin.from("departments").delete().eq("id", id));
  if (entity === "charge") ({ error } = await admin.from("charges").delete().eq("id", id));
  if (entity === "report_category") ({ error } = await admin.from("report_categories").delete().eq("id", id));
  if (entity === "clinical_term") ({ error } = await admin.from("clinical_terms").delete().eq("id", id));
  if (entity === "room_bed") ({ error } = await admin.from("room_beds").delete().eq("id", id));
  if (entity === "medicine") ({ error } = await admin.from("medicine_directory").delete().eq("id", id));
  if (entity === "medicine_batch") ({ error } = await admin.from("medicine_batches").delete().eq("id", id));

  if (error) {
    return {
      ok: false,
      message: error.code === "23503"
        ? "This item is already used by hospital history. Deactivate it instead of deleting it."
        : "This item could not be deleted.",
    };
  }
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "MASTER_RECORD_DELETED", entity_type: entity, entity_id: id });
  revalidatePath(deletePaths[entity]);
  if (entity === "medicine" || entity === "medicine_batch") revalidatePath("/dashboard");
  return { ok: true, message: "Item permanently deleted." };
}

export async function saveHospitalSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ hospitalName: z.string().trim().min(2).max(150), tagline: z.string().trim().max(120).optional(), address: z.string().trim().max(1000).optional(), phone: z.string().trim().max(30).optional(), email: z.string().trim().email().optional().or(z.literal("")), prescriptionFooter: z.string().trim().max(1000).optional(), tokenFooter: z.string().trim().max(500).optional(), digitalText: z.string().trim().max(1000).optional(), printFeeOnPrescription: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  const { error } = await admin.from("hospital_settings").upsert({ id: true, hospital_name: parsed.data.hospitalName, tagline: parsed.data.tagline || null, address: parsed.data.address || null, phone: parsed.data.phone || null, email: parsed.data.email || null, prescription_footer: parsed.data.prescriptionFooter || null, token_footer: parsed.data.tokenFooter || null, digital_prescription_text: parsed.data.digitalText || null, print_fee_on_prescription: parsed.data.printFeeOnPrescription === "on" });
  if (error) return { ok: false, message: "Hospital settings could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "SETTINGS_UPDATED", entity_type: "hospital_settings" });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Hospital settings saved." };
}


/**
 * One chunk of a clinical directory import. Re-validated server-side, then
 * handed to a single transactional RPC. Admin only.
 */
export async function importClinicalTerms(
  rows: unknown[],
  fileName: string,
  idempotencyKey: string,
): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
  // Permission check here, plus the RPC's own admin guard in the database.
  await requirePermission("manageUsers");
  const parsed = z
    .object({ fileName: z.string().min(1).max(255), idempotencyKey: databaseIdSchema })
    .safeParse({ fileName, idempotencyKey });
  if (!parsed.success) return { ok: false, message: "Import payload is invalid." };

  const checked = validateClinicalImportRows(rows);
  if (checked.invalid.length || checked.valid.length === 0)
    return { ok: false, message: "Resolve all validation errors before importing." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("bulk_import_clinical_terms", {
    p_rows: checked.valid,
    p_file_name: fileName,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, message: "The transaction failed; no rows in this batch were saved." };

  revalidatePath("/admin/clinical-directory");
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}
