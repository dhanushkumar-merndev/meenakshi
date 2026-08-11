"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const schema = z.object({
  visitId: databaseIdSchema,
  symptoms: z.string().max(5000).optional(),
  history: z.string().max(10000).optional(),
  examination: z.string().max(5000).optional(),
  assessment: z.string().min(1, "Assessment/diagnosis is required.").max(5000),
  advice: z.string().max(5000).optional(),
  followUpType: z.enum(["none", "after_report", "specific_date", "after_days"]),
  followUpDate: z.string().optional(),
  followUpDays: z.string().optional(),
  medicines: z.string(),
  tests: z.string(),
  intent: z.enum(["draft", "complete"]),
});
const medicineSchema = z
  .array(
    z.object({
      medicine_id: z.string().optional(),
      medicine_name: z.string().min(1),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      duration: z.string().optional(),
      route: z.string().optional(),
      notes: z.string().optional(),
      quantity: z.number().int().positive(),
    }),
  )
  .max(30);
const testSchema = z
  .array(
    z.object({ test_name: z.string().min(1), notes: z.string().optional() }),
  )
  .max(30);
export async function saveConsultation(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("writeConsultation");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let medicines: z.infer<typeof medicineSchema>,
    tests: z.infer<typeof testSchema>;
  try {
    medicines = medicineSchema.parse(JSON.parse(parsed.data.medicines));
    tests = testSchema.parse(JSON.parse(parsed.data.tests));
  } catch {
    return { ok: false, message: "Check medicine and investigation rows." };
  }
  const followUpDays = parsed.data.followUpDays
    ? Number(parsed.data.followUpDays)
    : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_visit_consultation", {
    p_visit_id: parsed.data.visitId,
    p_symptoms: parsed.data.symptoms || null,
    p_history: parsed.data.history || null,
    p_examination: parsed.data.examination || null,
    p_assessment: parsed.data.assessment,
    p_advice: parsed.data.advice || null,
    p_follow_up_type: parsed.data.followUpType,
    p_follow_up_date: parsed.data.followUpDate || null,
    p_follow_up_days: followUpDays,
    p_medicines: medicines,
    p_tests: tests,
    p_complete: parsed.data.intent === "complete",
  });
  if (error)
    return {
      ok: false,
      message: error.message.includes("immutable")
        ? "This consultation is already completed and cannot be changed."
        : "Consultation could not be saved.",
    };
  revalidatePath(`/visits/${parsed.data.visitId}`);
  revalidatePath("/doctor");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      parsed.data.intent === "complete"
        ? "Consultation completed."
        : "Draft saved.",
    data: { completed: parsed.data.intent === "complete" },
  };
}
