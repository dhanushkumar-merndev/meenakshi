"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";
const admission = z.object({
  patientId: databaseIdSchema.optional().or(z.literal("")),
  isEmergency: z.enum(["true", "false"]),
  doctorId: databaseIdSchema,
  sourceVisitId: z.string().optional(),
  room: z.string().max(50).optional(),
  bed: z.string().max(50).optional(),
  reason: z.string().min(2).max(1000),
  deposit: z.string(),
  paymentMode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  idempotencyKey: databaseIdSchema,
}).superRefine((value, context) => {
  if (value.isEmergency === "false" && !value.patientId) {
    context.addIssue({
      code: "custom",
      path: ["patientId"],
      message: "Select a patient or mark this as an emergency admission.",
    });
  }
});
export async function createAdmission(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageIp");
  const parsed = admission.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let deposit: number;
  try {
    deposit = rupeesToPaise(parsed.data.deposit || "0");
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_ip_ticket", {
    p_patient_id: parsed.data.patientId || null,
    p_doctor_id: parsed.data.doctorId,
    p_source_visit_id: parsed.data.sourceVisitId || null,
    p_room: parsed.data.room || null,
    p_bed: parsed.data.bed || null,
    p_reason: parsed.data.reason,
    p_deposit_paise: deposit,
    p_payment_mode: parsed.data.paymentMode,
    p_is_emergency: parsed.data.isEmergency === "true",
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result)
    return { ok: false, message: "Admission could not be created." };
  revalidatePath("/ip");
  return {
    ok: true,
    message: parsed.data.patientId
      ? "Patient admitted."
      : "Emergency IP ticket created; patient assignment is pending.",
    data: { ticketId: result.ticket_id, ticketNumber: result.ticket_number },
  };
}

const assignment = z.object({
  ticketId: databaseIdSchema,
  patientId: databaseIdSchema,
});

export async function assignIpPatient(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageIp");
  const parsed = assignment.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_ip_ticket_patient", {
    p_ticket_id: parsed.data.ticketId,
    p_patient_id: parsed.data.patientId,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("already assigned")
        ? "This IP ticket already has a patient."
        : "Patient could not be assigned to this IP ticket.",
    };
  }
  revalidatePath(`/ip/${parsed.data.ticketId}`);
  revalidatePath("/ip");
  return { ok: true, message: "Patient assigned to the IP ticket." };
}
const charge = z.object({
  ticketId: databaseIdSchema,
  category: z.enum([
    "doctor",
    "ward",
    "room",
    "bed",
    "treatment",
    "test",
    "pharmacy",
    "other",
  ]),
  item: z.string().min(2),
  quantity: z.coerce.number().int().positive(),
  rate: z.string(),
  idempotencyKey: databaseIdSchema,
});
export async function addIpCharge(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageIp");
  const parsed = charge.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let rate: number;
  try {
    rate = rupeesToPaise(parsed.data.rate);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ip_charges")
    .insert({
      ip_ticket_id: parsed.data.ticketId,
      category: parsed.data.category,
      item: parsed.data.item,
      quantity: parsed.data.quantity,
      rate_paise: rate,
      idempotency_key: parsed.data.idempotencyKey,
    });
  if (error?.code === "23505")
    return { ok: true, message: "Charge already recorded." };
  if (error) return { ok: false, message: "Charge could not be added." };
  revalidatePath(`/ip/${parsed.data.ticketId}`);
  return { ok: true, message: "Charge added." };
}
const payment = z.object({
  ticketId: databaseIdSchema,
  amount: z.string(),
  mode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  reference: z.string().max(100).optional(),
  idempotencyKey: databaseIdSchema,
});
export async function addIpPayment(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageIp");
  const parsed = payment.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let amount: number;
  try {
    amount = rupeesToPaise(parsed.data.amount);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("ip_payments")
    .insert({
      ip_ticket_id: parsed.data.ticketId,
      amount_paise: amount,
      mode: parsed.data.mode,
      reference: parsed.data.reference || null,
      idempotency_key: parsed.data.idempotencyKey,
    });
  if (error?.code === "23505")
    return { ok: true, message: "Payment already recorded." };
  if (error) return { ok: false, message: "Payment could not be added." };
  revalidatePath(`/ip/${parsed.data.ticketId}`);
  return { ok: true, message: "Payment recorded." };
}

const noteSchema=z.object({ticketId:databaseIdSchema,note:z.string().min(2).max(10000),chargeable:z.string().optional(),idempotencyKey:databaseIdSchema});
export async function addProgressNote(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("writeConsultation");const parsed=noteSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("add_ip_progress_note",{p_ticket_id:parsed.data.ticketId,p_note:parsed.data.note,p_chargeable:parsed.data.chargeable==="on",p_idempotency_key:parsed.data.idempotencyKey});if(error)return{ok:false,message:"Progress note could not be saved."};revalidatePath(`/ip/${parsed.data.ticketId}`);return{ok:true,message:"Progress note saved."}}
const summarySchema=z.object({ticketId:databaseIdSchema,finalDiagnosis:z.string().min(2).max(5000),hospitalCourse:z.string().min(2).max(10000),treatmentSummary:z.string().max(10000).optional(),dischargeMedicines:z.string().max(10000).optional(),dischargeAdvice:z.string().min(2).max(10000),followUp:z.string().max(2000).optional()});
export async function saveDischargeSummary(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("writeConsultation");const parsed=summarySchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("save_ip_discharge_summary",{p_ticket_id:parsed.data.ticketId,p_final_diagnosis:parsed.data.finalDiagnosis,p_hospital_course:parsed.data.hospitalCourse,p_treatment_summary:parsed.data.treatmentSummary||null,p_discharge_medicines:parsed.data.dischargeMedicines||null,p_discharge_advice:parsed.data.dischargeAdvice,p_follow_up:parsed.data.followUp||null});if(error)return{ok:false,message:"Discharge summary could not be saved."};revalidatePath(`/ip/${parsed.data.ticketId}`);revalidatePath("/ip");return{ok:true,message:"Clinical discharge summary saved; IP staff may complete discharge."}}
const completeSchema=z.object({ticketId:databaseIdSchema});
export async function completeDischarge(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("manageIp");const parsed=completeSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,message:"Invalid IP ticket."};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("complete_ip_discharge",{p_ticket_id:parsed.data.ticketId});if(error)return{ok:false,message:error.message.includes("patient assignment")?"Assign the emergency IP ticket to a patient before discharge.":error.message.includes("outstanding")?"Collect the outstanding balance before discharge.":error.message.includes("summary")?"Doctor must complete the clinical discharge summary first.":"Discharge could not be completed."};revalidatePath(`/ip/${parsed.data.ticketId}`);revalidatePath("/ip");return{ok:true,message:"Patient discharged successfully."}}
