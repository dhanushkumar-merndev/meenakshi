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
  previousVisitId: z.string().optional(), notes: z.string().max(500).optional(), idempotencyKey: databaseIdSchema,
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
  const { data, error } = await supabase.rpc("create_visit_with_token", {
    p_patient_id: parsed.data.patientId, p_doctor_id: parsed.data.doctorId, p_visit_type: parsed.data.visitType,
    p_fee_paise: fee, p_collected_paise: collected, p_payment_mode: parsed.data.paymentMode,
    p_previous_visit_id: parsed.data.previousVisitId || null, p_notes: parsed.data.notes || null, p_idempotency_key: parsed.data.idempotencyKey,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) return { ok: false, message: "Visit could not be created. Please retry with the same form." };
  revalidatePath(`/patients/${parsed.data.patientId}`); revalidatePath("/dashboard");
  return { ok: true, message: "Visit created.", data: { visitId: result.visit_id, token: result.token_number } };
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
