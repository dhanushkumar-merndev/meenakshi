"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { rupeesToPaise } from "@/lib/domain/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import { discountFormSchema, discountRpcArgs } from "@/lib/discount-policy";
import { discountErrorMessage } from "@/lib/domain/discount";
import type { ActionState } from "@/types/hospital";
import { isIdempotentReplay } from "@/lib/domain/idempotency";
const admission = z.object({
  patientId: databaseIdSchema.optional().or(z.literal("")),
  isEmergency: z.enum(["true", "false"]),
  doctorId: databaseIdSchema,
  sourceVisitId: z.string().optional(),
  roomBedId: databaseIdSchema.optional().or(z.literal("")),
  room: z.string().max(50).optional(),
  bed: z.string().max(50).optional(),
  reason: z.string().min(2).max(1000),
  deposit: z.string(),
  paymentMode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
  idempotencyKey: databaseIdSchema,
  // Optional: an unclaimed ticket is a real state, not an error.
  assignedIpStaffId: databaseIdSchema.optional().or(z.literal("")),
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
  await requirePermission("admitIp");
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
    p_room_bed_id: parsed.data.roomBedId || null,
    p_assigned_ip_staff_id: parsed.data.assignedIpStaffId || null,
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result) {
    // Every branch below already tells the user what went wrong, and the
    // database code is on the audit trail, so nothing is logged here.
    const message = error?.message.toLowerCase() ?? "";
    if (message.includes("occupied") || message.includes("unavailable"))
      return { ok: false, message: "That room/bed is no longer available. Select another." };
    if (error?.code === "PGRST202" || error?.code === "PGRST203")
      return { ok: false, message: "The admission database function is being updated. Refresh and retry." };
    if (message.includes("already admitted") || error?.code === "23505")
      return { ok: false, message: "This patient or room already has an active admission." };
    if (message.includes("not ip staff"))
      return { ok: false, message: "That staff member is no longer IP staff. Pick another." };
    if (message.includes("outstanding op consultation fee"))
      return {
        ok: false,
        message: "This patient's OP consultation fee is still outstanding. Collect it at the pharmacy/reception counter, then admit.",
      };
    return { ok: false, message: `Admission could not be created${error?.code ? ` (${error.code})` : ""}.` };
  }
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
const chargeLineBase = z.object({
  quantity: z.coerce.number().int().positive().max(100_000),
  idempotencyKey: databaseIdSchema,
});
const chargeLine = z.discriminatedUnion("chargeMode", [
  chargeLineBase.extend({
    chargeMode: z.literal("preset"),
    chargePresetId: databaseIdSchema,
  }),
  chargeLineBase.extend({
    chargeMode: z.literal("custom"),
    chargePresetId: z.string().optional(),
    item: z
      .string()
      .trim()
      .min(1, "Enter the charge item name.")
      .max(200, "Item name cannot exceed 200 characters."),
    rate: z.string().trim().min(1, "Enter the fee.").max(15),
  }),
]);
const chargeBatch = z.object({
  ticketId: databaseIdSchema,
  charges: z.string().min(2),
});
export async function addIpCharge(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("manageIp");
  const parsedBatch = chargeBatch.safeParse(Object.fromEntries(formData));
  if (!parsedBatch.success)
    return {
      ok: false,
      message: "Enter at least one valid charge.",
      fieldErrors: parsedBatch.error.flatten().fieldErrors,
    };

  let parsedLines: z.infer<typeof chargeLine>[];
  try {
    parsedLines = z.array(chargeLine).min(1).max(25).parse(
      JSON.parse(parsedBatch.data.charges),
    );
  } catch {
    return { ok: false, message: "Check every charge item, quantity, and fee." };
  }

  const lines: Array<Record<string, string | number | null>> = [];
  for (const line of parsedLines) {
    if (line.chargeMode === "preset") {
      lines.push({
        charge_mode: "preset",
        charge_preset_id: line.chargePresetId,
        item: null,
        quantity: line.quantity,
        rate_paise: null,
        idempotency_key: line.idempotencyKey,
      });
      continue;
    }

    let ratePaise: number;
    try {
      ratePaise = rupeesToPaise(line.rate);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
    if (ratePaise <= 0)
      return { ok: false, message: "Every custom fee must be greater than zero." };
    lines.push({
      charge_mode: "custom",
      charge_preset_id: null,
      item: line.item,
      quantity: line.quantity,
      rate_paise: ratePaise,
      idempotency_key: line.idempotencyKey,
    });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_ip_charges", {
    p_ticket_id: parsedBatch.data.ticketId,
    p_lines: lines,
  });
  if (isIdempotentReplay(error))
    return { ok: true, message: "Charges already recorded." };
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("no longer active"))
      return { ok: false, message: "That configured charge is no longer available." };
    if (message.includes("ticket is not open"))
      return { ok: false, message: "Charges can only be added to an open IP ticket." };
    if (message.includes("idempotency key was reused"))
      return { ok: false, message: "Start a new charge entry and try again." };
    return { ok: false, message: "Charges could not be added. No charge was recorded." };
  }
  revalidatePath(`/ip/${parsedBatch.data.ticketId}`);
  return {
    ok: true,
    message: `${parsedLines.length} ${parsedLines.length === 1 ? "charge" : "charges"} added.`,
    data: { count: parsedLines.length },
  };
}
const payment = z
  .object({
    ticketId: databaseIdSchema,
    amount: z.string(),
    mode: z.enum(["cash", "upi", "card", "bank_transfer", "other"]),
    reference: z.string().max(100).optional(),
    idempotencyKey: databaseIdSchema,
  })
  .merge(discountFormSchema);
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
    amount = parsed.data.amount.trim() ? rupeesToPaise(parsed.data.amount) : 0;
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  if (amount + parsed.data.discountPaise <= 0)
    return { ok: false, message: "Enter a payment amount or a discount." };
  const supabase = await createSupabaseServerClient();
  // Payment and discount are recorded together; add_ip_payment re-checks the
  // balance, the discount limit and the ticket status under a row lock.
  const { error } = await supabase.rpc("add_ip_payment", {
    p_ticket_id: parsed.data.ticketId,
    p_amount_paise: amount,
    p_mode: parsed.data.mode,
    p_reference: parsed.data.reference || null,
    p_idempotency_key: parsed.data.idempotencyKey,
    ...discountRpcArgs(parsed.data),
  });
  if (error)
    return {
      ok: false,
      message:
        discountErrorMessage(error.message) ??
        (error.message.toLowerCase().includes("exceeds outstanding")
          ? "Payment exceeds the current pending balance. Refresh and enter a smaller amount."
          : error.message.includes("not active")
            ? "Payments can only be recorded on an open IP ticket."
            : "Payment could not be added."),
    };
  revalidatePath(`/ip/${parsed.data.ticketId}`);
  return {
    ok: true,
    message:
      amount === 0
        ? "Discount recorded."
        : parsed.data.discountPaise > 0
          ? "Payment and discount recorded."
          : "Payment recorded.",
  };
}

const noteSchema=z.object({ticketId:databaseIdSchema,note:z.string().max(10000).optional(),chargeable:z.string().optional(),fee:z.string().trim().optional(),idempotencyKey:databaseIdSchema,
  pulse:z.string().max(20).optional(),bp:z.string().max(20).optional(),spo2:z.string().max(20).optional(),respiratoryRate:z.string().max(20).optional(),
  chiefComplaint:z.string().max(2000).optional(),issues:z.string().max(2000).optional(),examination:z.string().max(2000).optional(),plan:z.string().max(2000).optional()});
export async function addProgressNote(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("writeConsultation");const parsed=noteSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};
  // Looks like a consultation, so it needs at least one clinical field --
  // an empty round with nothing recorded is not a note.
  const fields=[parsed.data.note,parsed.data.chiefComplaint,parsed.data.issues,parsed.data.examination,parsed.data.plan,parsed.data.pulse,parsed.data.bp,parsed.data.spo2,parsed.data.respiratoryRate];
  if(!fields.some((f)=>f&&f.trim().length>0))return{ok:false,message:"Record at least a vital, a clinical field, or a note."};
  // The doctor types what this visit is worth. Blank falls back to their
  // configured IP visit fee; 0 is a deliberate waiver and must be kept.
  const chargeable=parsed.data.chargeable==="on";let feePaise:number|null=null;
  if(chargeable&&parsed.data.fee){try{feePaise=rupeesToPaise(parsed.data.fee);}catch(error){return{ok:false,fieldErrors:{fee:[(error as Error).message]}};}
    if(feePaise<0)return{ok:false,fieldErrors:{fee:["Fee cannot be negative."]}};}
  const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("add_ip_progress_note",{p_ticket_id:parsed.data.ticketId,p_note:parsed.data.note||null,p_chargeable:chargeable,p_idempotency_key:parsed.data.idempotencyKey,p_fee_paise:feePaise,
    p_pulse:parsed.data.pulse||null,p_bp:parsed.data.bp||null,p_spo2:parsed.data.spo2||null,p_respiratory_rate:parsed.data.respiratoryRate||null,
    p_chief_complaint:parsed.data.chiefComplaint||null,p_issues:parsed.data.issues||null,p_examination:parsed.data.examination||null,p_plan:parsed.data.plan||null});if(error)return{ok:false,message:"Progress note could not be saved."};revalidatePath(`/ip/${parsed.data.ticketId}`);return{ok:true,message:"Progress note saved."}}
const summarySchema=z.object({ticketId:databaseIdSchema,finalDiagnosis:z.string().min(2).max(5000),chiefComplaint:z.string().max(2000).optional(),procedureDone:z.string().max(2000).optional(),operativeNotes:z.string().max(10000).optional(),hospitalCourse:z.string().min(2).max(10000),treatmentSummary:z.string().max(10000).optional(),dischargeMedicines:z.string().max(10000).optional(),dischargeAdvice:z.string().min(2).max(10000),followUp:z.string().max(2000).optional()});
export async function saveDischargeSummary(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("prepareDischarge");const parsed=summarySchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("save_ip_discharge_summary",{p_ticket_id:parsed.data.ticketId,p_final_diagnosis:parsed.data.finalDiagnosis,p_hospital_course:parsed.data.hospitalCourse,p_treatment_summary:parsed.data.treatmentSummary||null,p_discharge_medicines:parsed.data.dischargeMedicines||null,p_discharge_advice:parsed.data.dischargeAdvice,p_follow_up:parsed.data.followUp||null,p_chief_complaint:parsed.data.chiefComplaint||null,p_procedure_done:parsed.data.procedureDone||null,p_operative_notes:parsed.data.operativeNotes||null});if(error)return{ok:false,message:"Discharge summary could not be saved."};revalidatePath(`/ip/${parsed.data.ticketId}`);revalidatePath("/ip");return{ok:true,message:"Clinical discharge summary saved; IP staff may complete discharge."}}
const completeSchema=z.object({ticketId:databaseIdSchema});
export async function completeDischarge(_:ActionState,formData:FormData):Promise<ActionState>{await requirePermission("manageIp");const parsed=completeSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{ok:false,message:"Invalid IP ticket."};const supabase=await createSupabaseServerClient();const{error}=await supabase.rpc("complete_ip_discharge",{p_ticket_id:parsed.data.ticketId});if(error)return{ok:false,message:error.message.includes("patient assignment")?"Assign the emergency IP ticket to a patient before discharge.":error.message.includes("outstanding")?"Collect the outstanding balance before discharge.":error.message.includes("summary")?"Doctor must complete the clinical discharge summary first.":"Discharge could not be completed."};revalidatePath(`/ip/${parsed.data.ticketId}`);revalidatePath("/ip");return{ok:true,message:"Patient discharged successfully."}}

/**
 * Hands an open ticket to an IP staff member -- a shift handover, or an IP
 * staff member claiming one nobody took. Passing an empty id unassigns it.
 */
export async function assignIpTicket(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admitIp");
  const parsed = z
    .object({
      ticketId: databaseIdSchema,
      staffId: databaseIdSchema.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_ip_ticket", {
    p_ticket_id: parsed.data.ticketId,
    p_staff_id: parsed.data.staffId || null,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not ip staff"))
      return { ok: false, message: "That staff member is no longer IP staff." };
    if (message.includes("ticket is not open"))
      return { ok: false, message: "This ticket is already discharged or cancelled." };
    return { ok: false, message: "The assignment could not be saved." };
  }
  revalidatePath("/ip");
  return { ok: true, message: "Assignment updated." };
}
