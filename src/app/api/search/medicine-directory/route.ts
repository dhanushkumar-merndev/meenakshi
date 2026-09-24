import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!["admin", "pharmacy"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (q.length > 120 || !Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  if (q.length > 0 && q.length < 2) return NextResponse.json({ items: [], nextOffset: null }, { headers: { "Cache-Control": "private, no-store" } });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_medicine_directory", { p_query: q, p_limit: 25, p_offset: offset, p_include_archived: false });
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  const rows = (data ?? []) as Array<{ id: string; brand_name: string; strength: string | null; dosage_form: string; generic_name: string | null; active: boolean; total_count: number }>;
  return NextResponse.json({
    items: rows.map((item) => ({
      value: item.id,
      label: [item.brand_name, item.strength, item.dosage_form].filter(Boolean).join(" · "),
      description: [item.generic_name, !item.active ? "Inactive" : null].filter(Boolean).join(" · "),
      disabled: !item.active,
      data: { id: item.id },
    })),
    nextOffset: offset + rows.length < Number(rows[0]?.total_count ?? 0) ? offset + rows.length : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
