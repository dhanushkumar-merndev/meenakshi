import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StockRow = {
  stock_type: "inventory" | "medicine";
  stock_id: string;
  name: string;
  detail: string | null;
  unit: string | null;
  quantity: number;
};

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!["admin", "reception", "doctor", "pharmacy", "ip"].includes(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 120)
    return NextResponse.json({ error: "Search is too long" }, { status: 400 });

  if (q.length < 2) return NextResponse.json({ items: [], nextOffset: null }, { headers: { "Cache-Control": "private, no-store" } });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_ip_stock_catalog", {
    p_query: q,
    p_limit: 20,
  });
  if (error)
    return NextResponse.json({ error: "Search unavailable" }, { status: 500 });

  const items = ((data ?? []) as unknown as StockRow[]).map((item) => ({
    id: `${item.stock_type}:${item.stock_id}`,
    name: item.name,
    generic: item.detail,
    strength: null,
    form: item.unit ?? "Item",
    quantity: Number(item.quantity),
    availability: Number(item.quantity) > 0 ? "in_stock" : "out_of_stock",
  }));

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
