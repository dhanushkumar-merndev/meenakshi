"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const voidSchema = z.object({
  discountId: databaseIdSchema,
  reason: z.string().trim().min(3, "Enter a short reason.").max(300),
});

/**
 * Admin correction for a discount recorded in error. The row is kept and
 * marked void (never deleted); the bill's balance reopens. Counter discounts
 * (pharmacy, IP items, procedures) were settled in cash at the discounted
 * amount, so void_discount refuses them.
 */
export async function voidDiscount(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("manageUsers");
  const parsed = voidSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_discount", {
    p_discount_id: parsed.data.discountId,
    p_reason: parsed.data.reason,
  });
  if (error)
    return {
      ok: false,
      message: error.message.includes("counter discount is final")
        ? "A counter discount was settled in cash and cannot be voided."
        : error.message.includes("bill is closed")
          ? "This IP bill is closed, so its discount can no longer be voided."
          : error.message.includes("discount not found")
            ? "This discount no longer exists. Refresh and try again."
            : "The discount could not be voided.",
    };
  revalidatePath("/admin/discounts");
  revalidatePath("/admin/analytics");
  revalidatePath("/dashboard");
  return { ok: true, message: "Discount voided. The bill's balance is due again." };
}
