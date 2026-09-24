import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MedicineRow = {
  id: string;
  brand_name: string;
  generic_name: string | null;
  strength: string | null;
  dosage_form: string;
  quantity: number;
  low_stock_threshold: number;
};
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  // IP staff use this too, typing an item request against live stock (they
  // still cannot type anything not in the catalog and have it silently
  // "found" -- pharmacy always matches/prices at fulfilment regardless).
  if (!["admin", "reception", "doctor", "op", "pharmacy", "ip"].includes(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length > 120)
    return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  // Opening the picker offers a small browse list; typing searches the full directory.
  if (!q) {
    const { data, error } = await supabase.rpc("list_medicine_directory", { p_query: "", p_limit: 20, p_offset: 0, p_include_archived: false });
    if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
    const rows = (data ?? []) as Array<MedicineRow & { active: boolean; available_quantity: number }>;
    return NextResponse.json({ items: rows.filter((item) => item.active).map((item) => ({
      id: item.id, name: item.brand_name, generic: item.generic_name, strength: item.strength,
      form: item.dosage_form, quantity: Number(item.available_quantity),
      availability: Number(item.available_quantity) > 0 ? "available" : "out_of_stock",
    })) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const { data, error } = await supabase.rpc("search_medicine_availability", { p_query: q, p_limit: 20 });
  if (error)
    return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  const items = ((data ?? []) as unknown as MedicineRow[]).map((item) => {
    const quantity = Number(item.quantity);
    const threshold = Number(item.low_stock_threshold);
    return {
      id: item.id,
      name: item.brand_name,
      generic: item.generic_name,
      strength: item.strength,
      form: item.dosage_form,
      quantity,
      availability:
        quantity <= 0
          ? "out_of_stock"
          : quantity <= threshold
            ? "low_stock"
            : "in_stock",
    };
  });
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
