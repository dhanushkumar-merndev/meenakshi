"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const visitSchema = z.object({
  patientId: databaseIdSchema, doctorId: databaseIdSchema, visitType: z.enum(["op", "follow_up"]),
  fee: z.string(), collected: z.string().default("0"), paymentMode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  previousVisitId: z.string().optional(), notes: z.string().max(500).optional(), idempotencyKey: databaseIdSchema, consultants: z.string().optional(),
});

export async function createVisit(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("createVisit");
  const parsed = visitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let fee: number, collected: number;
  try { fee = rupeesToPaise(parsed.data.fee); collected = rupeesToPaise(parsed.data.collected || "0"); }
  catch (error) { return { ok: false, message: (error as Error).message }; }
  if (collected > fee) return { ok: false, fieldErrors: { collected: ["Collected amount cannot exceed the visit fee."] } };
  if (parsed.data.visitType === "follow_up" && !parsed.data.previousVisitId) return { ok: false, fieldErrors: { previousVisitId: ["Select the related previous visit."] } };
  const supabase = await createSupabaseServerClient();
  let consultants: Array<{ doctor_id: string; collected_paise: number }> = [];
  if (parsed.data.consultants) {
    try {
      const raw = JSON.parse(parsed.data.consultants) as Array<{ doctorId?: string; collected?: string }>;
      consultants = raw.map((item) => ({ doctor_id: databaseIdSchema.parse(item.doctorId), collected_paise: rupeesToPaise(item.collected || "0") }));
      if (!consultants.length || new Set(consultants.map((item) => item.doctor_id)).size !== consultants.length) return { ok: false, message: "Select each consultant only once." };
    } catch { return { ok: false, message: "Consultant details are invalid." }; }
  }
  if (consultants.length > 1) {
    const { data, error } = await supabase.rpc("create_multi_consultant_visit", { p_patient_id: parsed.data.patientId, p_visit_type: parsed.data.visitType, p_payment_mode: parsed.data.paymentMode, p_previous_visit_id: parsed.data.previousVisitId || null, p_notes: parsed.data.notes || null, p_idempotency_key: parsed.data.idempotencyKey, p_consultants: consultants });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) return { ok: false, message: error?.message.includes("duplicate") ? "Select each consultant only once." : "Multi-doctor visit could not be created." };
    revalidatePath(`/patients/${parsed.data.patientId}`); revalidatePath("/reception"); revalidatePath("/op"); revalidatePath("/dashboard");
    return { ok: true, message: "Visit created for all consultants with one token.", data: { visitId: result.visit_id, token: result.token_number } };
  }
  const { data, error } = await supabase.rpc("create_visit_with_token", {
    p_patient_id: parsed.data.patientId, p_doctor_id: parsed.data.doctorId, p_visit_type: parsed.data.visitType,
    p_fee_paise: fee, p_collected_paise: collected, p_payment_mode: parsed.data.paymentMode,
    p_previous_visit_id: parsed.data.previousVisitId || null, p_notes: parsed.data.notes || null, p_idempotency_key: parsed.data.idempotencyKey,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) return { ok: false, message: "Visit could not be created. Please retry with the same form." };
  revalidatePath(`/patients/${parsed.data.patientId}`); revalidatePath("/reception"); revalidatePath("/dashboard");
  return { ok: true, message: "Visit created.", data: { visitId: result.visit_id, token: result.token_number } };
}

const reassignSchema=z.object({visitId:databaseIdSchema,doctorId:databaseIdSchema,reason:z.string().trim().min(3,"Enter a short reason.").max(500)});
export async function reassignVisitConsultant(_:ActionState,formData:FormData):Promise<ActionState>{
  await requirePermission("createVisit");const parsed=reassignSchema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};
  const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("reassign_visit_consultant",{p_visit_id:parsed.data.visitId,p_doctor_id:parsed.data.doctorId,p_reason:parsed.data.reason});
  if(error){const message=error.message.includes("different consultant")?"Select a different consultant.":error.message.includes("clinical work")||error.message.includes("no longer")?"Consultant cannot be changed because clinical work has started or the visit is closed.":error.message.includes("unavailable")?"The selected consultant is unavailable.":"Consultant could not be changed.";return{ok:false,message};}
  revalidatePath("/reception");revalidatePath(`/visits/${parsed.data.visitId}`);revalidatePath("/dashboard");return{ok:true,message:"Consultant changed. The daily token number is unchanged."};
}

const addConsultantSchema = reassignSchema.extend({ idempotencyKey: databaseIdSchema });
export async function addConsultantToToken(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("createVisit");
  const parsed = addConsultantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_consultant_to_token", {
    p_source_visit_id: parsed.data.visitId,
    p_doctor_id: parsed.data.doctorId,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const message = error.message.includes("already assigned") ? "This doctor is already assigned to this token."
      : error.message.includes("no longer") ? "Another consultant cannot be added after clinical work starts or the visit closes."
      : error.message.includes("unavailable") ? "The selected consultant is unavailable."
      : "Consultant could not be added.";
    return { ok: false, message };
  }
  revalidatePath("/reception"); revalidatePath("/op"); revalidatePath("/dashboard");
  return { ok: true, message: "Consultant added with the same token number." };
}

const paymentSchema = z.object({ visitId: databaseIdSchema, patientId: databaseIdSchema, amount: z.string(), mode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]), reference: z.string().max(100).optional(), idempotencyKey: databaseIdSchema });
export async function addVisitPayment(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("viewVisitFinance");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let amount: number; try { amount = rupeesToPaise(parsed.data.amount); } catch (error) { return { ok: false, message: (error as Error).message }; }
  if (amount <= 0) return { ok: false, fieldErrors: { amount: ["Amount must be greater than zero."] } };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("visit_payments").insert({ visit_id: parsed.data.visitId, amount_paise: amount, mode: parsed.data.mode, reference: parsed.data.reference || null, idempotency_key: parsed.data.idempotencyKey });
  if (error?.code === "23505") return { ok: true, message: "Payment was already recorded." };
  if (error) return { ok: false, message: "Payment could not be recorded." };
  revalidatePath(`/patients/${parsed.data.patientId}`); return { ok: true, message: "Payment recorded." };
}
