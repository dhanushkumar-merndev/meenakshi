import type { InventoryItem } from "@/features/pharmacy/inventory-dialogs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!["admin", "pharmacy"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (q.length > 120 || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_inventory_items", { p_query: q, p_limit: 25, p_offset: offset });
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  const rows = (data ?? []) as Array<InventoryItem & { total_count: number }>;
  return NextResponse.json({
    items: rows.map((item) => ({
      value: item.id,
      label: item.name,
      description: `${formatInr(item.selling_price_paise)} · ${item.quantity} left`,
      disabled: !item.active || item.quantity <= 0,
      data: item,
    })),
    nextOffset: offset + rows.length < Number(rows[0]?.total_count ?? 0) ? offset + rows.length : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
