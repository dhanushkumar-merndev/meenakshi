"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  revalidatePath("/admin/departments");
  return { ok: true, message: "Department saved." };
}

export async function saveCharge(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, category: z.string().trim().min(2).max(50), name: z.string().trim().min(2).max(120), amount: z.string(), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let amount: number;
  try { amount = rupeesToPaise(parsed.data.amount); } catch (error) { return { ok: false, message: (error as Error).message }; }
  const { actor, admin } = await adminActor();
  const values = { category: parsed.data.category, charge_name: parsed.data.name, amount_paise: amount, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("charges").update(values).eq("id", parsed.data.id) : admin.from("charges").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This charge already exists." : "Charge could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "CHARGE_SAVED", entity_type: "charge", entity_id: parsed.data.id || null });
  revalidatePath("/admin/charges");
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
  revalidatePath("/admin/report-categories");
  return { ok: true, message: "Report category saved." };
}

export async function saveClinicalTerm(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ id: optionalId, type: z.string().trim().min(2).max(50), displayText: z.string().trim().min(2).max(300), aliases: z.string().trim().max(1000).optional(), source: z.string().trim().min(2).max(120), active: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  const values = { term_type: parsed.data.type, display_text: parsed.data.displayText, search_aliases: (parsed.data.aliases ?? "").split(",").map((item) => item.trim()).filter(Boolean), source: parsed.data.source, active: parsed.data.active === "on" };
  const query = parsed.data.id ? admin.from("clinical_terms").update(values).eq("id", parsed.data.id) : admin.from("clinical_terms").insert(values);
  const { error } = await query;
  if (error) return { ok: false, message: error.code === "23505" ? "This clinical term already exists." : "Clinical term could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "CLINICAL_TERM_SAVED", entity_type: "clinical_term", entity_id: parsed.data.id || null });
  revalidatePath("/admin/clinical-directory");
  return { ok: true, message: "Clinical term saved." };
}

export async function saveHospitalSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ hospitalName: z.string().trim().min(2).max(150), address: z.string().trim().max(1000).optional(), phone: z.string().trim().max(30).optional(), email: z.string().trim().email().optional().or(z.literal("")), prescriptionFooter: z.string().trim().max(1000).optional(), tokenFooter: z.string().trim().max(500).optional(), digitalText: z.string().trim().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { actor, admin } = await adminActor();
  const { error } = await admin.from("hospital_settings").upsert({ id: true, hospital_name: parsed.data.hospitalName, address: parsed.data.address || null, phone: parsed.data.phone || null, email: parsed.data.email || null, prescription_footer: parsed.data.prescriptionFooter || null, token_footer: parsed.data.tokenFooter || null, digital_prescription_text: parsed.data.digitalText || null });
  if (error) return { ok: false, message: "Hospital settings could not be saved." };
  await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "SETTINGS_UPDATED", entity_type: "hospital_settings" });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Hospital settings saved." };
}
