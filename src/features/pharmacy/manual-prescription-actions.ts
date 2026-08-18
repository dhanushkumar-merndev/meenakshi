"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rupeesToPaise } from "@/lib/domain/money";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const lineSchema = z
  .array(
    z.object({
      medicine_id: databaseIdSchema.optional().or(z.literal("")),
      medicine_name: z.string().trim().min(1).max(300),
      dose: z.string().max(100).optional(),
      frequency: z.string().max(100).optional(),
      duration: z.string().max(100).optional(),
      route: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
      quantity: z.number().int().positive().max(100_000),
    }),
  )
  .min(1)
  .max(30);

const schema = z.object({
  visitId: databaseIdSchema.optional().or(z.literal("")),
  ipTicketId: databaseIdSchema.optional().or(z.literal("")),
  doctorId: databaseIdSchema.optional().or(z.literal("")),
  fee: z.string().optional(),
  lines: z.string(),
  idempotencyKey: databaseIdSchema,
});

/**
 * "Dispense as Per Rx": the consultant prescribed on paper, so pharmacy
 * enters the medicines digitally against the patient's visit or IP ticket.
 * It then shows up in the ordinary pending-prescriptions queue and is
 * dispensed with the same DispenseDialog as any doctor-entered one.
 */
export async function createManualPrescription(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("dispenseAsPerRx");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  if (!parsed.data.visitId && !parsed.data.ipTicketId)
    return { ok: false, message: "Pick a patient's visit or IP ticket first." };
  let lines: z.infer<typeof lineSchema>;
  try {
    lines = lineSchema.parse(JSON.parse(parsed.data.lines));
  } catch {
    return { ok: false, message: "Add at least one medicine with a valid quantity." };
  }
  let feePaise: number | null = null;
  if (parsed.data.visitId && parsed.data.fee?.trim()) {
    try {
      feePaise = rupeesToPaise(parsed.data.fee);
    } catch (error) {
      return { ok: false, fieldErrors: { fee: [(error as Error).message] } };
    }
    if (feePaise < 0) return { ok: false, fieldErrors: { fee: ["Fee cannot be negative."] } };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_manual_prescription", {
    p_visit_id: parsed.data.visitId || null,
    p_ip_ticket_id: parsed.data.ipTicketId || null,
    p_doctor_id: parsed.data.doctorId || null,
    p_fee_paise: feePaise,
    p_lines: lines,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const message = error.message.toLowerCase();
    return {
      ok: false,
      message: message.includes("already completed digitally")
        ? "This patient's consultation was already entered digitally by the doctor; use the pending prescription instead."
        : message.includes("not active")
          ? "This IP ticket is not currently admitted."
          : message.includes("visit is cancelled")
            ? "This visit was cancelled and cannot take a prescription."
            : message.includes("unavailable")
              ? "That patient's visit or IP ticket could not be found. Refresh and try again."
              : message.includes("at least one medicine")
                ? "Add at least one medicine."
                : `The prescription could not be saved${error.code ? ` (${error.code})` : ""}.`,
    };
  }
  revalidatePath("/pharmacy");
  revalidatePath("/dashboard");
  return { ok: true, message: "Prescription entered. It is now in the pending queue for dispensing." };
}
