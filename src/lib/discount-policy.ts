import "server-only";
import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/hospital";
import { DISCOUNT_NOTE_MAX, DISCOUNT_REASON_VALUES } from "@/lib/domain/discount";

export type DiscountPolicy = {
  /** Staff limit as a percentage of the bill, set by admin (1-100). */
  limitPercent: number;
  /** Admin may discount up to the full bill. */
  unlimited: boolean;
};

const DEFAULT_LIMIT = 10;

/**
 * What a dialog may offer. Only guidance: the database re-reads the limit and
 * the caller's role on every discount, so a stale page cannot exceed it.
 */
export async function getDiscountPolicy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  role: AppRole,
): Promise<DiscountPolicy> {
  const { data } = await supabase
    .from("hospital_settings")
    .select("max_discount_percent")
    .eq("id", true)
    .maybeSingle();
  const limit = Number(data?.max_discount_percent ?? DEFAULT_LIMIT);
  return {
    limitPercent: Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : DEFAULT_LIMIT,
    unlimited: role === "admin",
  };
}

/** The discount part of a payment form, as the DiscountField submits it. */
export const discountFormSchema = z.object({
  discountPaise: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  discountReason: z.enum(DISCOUNT_REASON_VALUES).optional().or(z.literal("")),
  discountNote: z.string().trim().max(DISCOUNT_NOTE_MAX).optional(),
});

/** RPC arguments for a validated discount; reason/note only when one is given. */
export function discountRpcArgs(data: z.infer<typeof discountFormSchema>) {
  const given = data.discountPaise > 0;
  return {
    p_discount_paise: data.discountPaise,
    p_discount_reason: given ? data.discountReason || null : null,
    p_discount_note: given ? data.discountNote || null : null,
  };
}
