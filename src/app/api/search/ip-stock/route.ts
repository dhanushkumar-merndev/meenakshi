import type { IpStockOption } from "@/features/ip/stock-match";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!["admin", "pharmacy"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (q.length > 120 || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_ip_stock_catalog_page", { p_query: q, p_limit: 26, p_offset: offset });
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  const rows = (data ?? []) as IpStockOption[];
  return NextResponse.json({
    items: rows.slice(0, 25).map((item) => ({
      value: `${item.stock_type}:${item.stock_id}`,
      label: item.name,
      description: `${item.detail ?? item.stock_type} · ${formatInr(Number(item.selling_price_paise))} · ${item.quantity} left`,
      disabled: Number(item.quantity) <= 0,
      data: item,
    })),
    nextOffset: rows.length > 25 ? offset + 25 : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
