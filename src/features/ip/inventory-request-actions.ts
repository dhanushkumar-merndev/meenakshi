"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const requestLineSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2, "Item name is required.").max(150),
      quantity: z.number().int().positive(),
    }),
  )
  .min(1)
  .max(30);

const requestSchema = z.object({
  ticketId: databaseIdSchema,
  lines: z.string(),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey: databaseIdSchema,
});

/**
 * IP staff or the treating doctor asking pharmacy for items -- this never
 * touches stock. The requester has no access to the inventory catalog; they
 * just describe what they need, and pharmacy matches it at fulfilment.
 */
export async function requestIpInventory(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("requestIpInventory");
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let lines: z.infer<typeof requestLineSchema>;
  try {
    lines = requestLineSchema.parse(JSON.parse(parsed.data.lines));
  } catch {
    return { ok: false, message: "Add at least one item with a name and quantity." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_ip_inventory_request", {
    p_ticket_id: parsed.data.ticketId,
    p_lines: lines,
    p_notes: parsed.data.notes || null,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error)
    return {
      ok: false,
      message: error.message.includes("own patient")
        ? "You can only request items for your own patient."
        : "The item request could not be created.",
    };
  revalidatePath(`/ip/${parsed.data.ticketId}`);
  revalidatePath("/pharmacy/ip-requests");
  return { ok: true, message: "Item request sent to pharmacy." };
}

const fulfillLineSchema = z
  .array(
    z.object({
      request_item_id: databaseIdSchema,
      inventory_item_id: databaseIdSchema.optional().or(z.literal("")),
      fulfilled_quantity: z.number().int().min(0),
      unit_price_paise: z.number().int().min(0).optional(),
    }).superRefine((line, context) => {
      // A catalog item is priced by the locked server-side stock record. An
      // off-catalog item has no such source, so its manually entered unit
      // price is mandatory whenever any quantity is being billed.
      if (!line.inventory_item_id && line.fulfilled_quantity > 0 && !(line.unit_price_paise && line.unit_price_paise > 0)) {
        context.addIssue({
          code: "custom",
          path: ["unit_price_paise"],
          message: "Enter a manual unit price for every off-catalog item being fulfilled.",
        });
      }
    }),
  )
  .max(30);

const fulfillSchema = z.object({
  requestId: databaseIdSchema,
  lines: z.string(),
  idempotencyKey: databaseIdSchema,
});

/**
 * Pharmacy resolves a pending request line by line: linking it to a real
 * catalog item reduces stock atomically and prices it from the catalog;
 * leaving it off-catalog uses the manually entered price and never touches
 * stock; a quantity of 0 (or an omitted line) marks it unavailable -- no
 * charge, no stock change, patient told to buy it outside.
 */
export async function fulfillIpInventoryRequest(_: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("dispense");
  const parsed = fulfillSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  let lines: z.infer<typeof fulfillLineSchema>;
  try {
    lines = fulfillLineSchema.parse(JSON.parse(parsed.data.lines));
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues.find((issue) => issue.path.includes("unit_price_paise"))?.message
      : undefined;
    return { ok: false, message: message ?? "Check the fulfilled quantities and prices." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fulfill_ip_inventory_request", {
    p_request_id: parsed.data.requestId,
    p_lines: lines.map((line) => ({
      request_item_id: line.request_item_id,
      inventory_item_id: line.inventory_item_id || null,
      fulfilled_quantity: line.fulfilled_quantity,
      unit_price_paise: line.unit_price_paise ?? null,
    })),
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error)
    return {
      ok: false,
      message: error.message.includes("insufficient inventory stock")
        ? error.message
        : error.message.includes("manual unit price")
          ? "Enter a manual unit price for every off-catalog item being fulfilled."
        : "The request could not be fulfilled; no stock or charge was changed.",
    };
  revalidatePath("/pharmacy/ip-requests");
  revalidatePath("/pharmacy/inventory");
  return { ok: true, message: "Request fulfilled and billed to the IP ticket." };
}
