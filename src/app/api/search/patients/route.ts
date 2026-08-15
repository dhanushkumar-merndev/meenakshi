import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  await requirePermission("viewPatients");
  const raw = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (raw.length < 2) return NextResponse.json({ items: [] });
  const supabase = await createSupabaseServerClient();
  const numeric = raw.replace(/\D/g, "");
  let query = supabase.from("patients").select("id,name,uhid,phone_normalized,dob,gender").eq("status", "active").limit(15);
  // UHID is the visible Patient ID, so it is searchable alongside phone and name.
  query = numeric.length >= 2
    ? query.or(`phone_normalized.like.${numeric}%,uhid.ilike.%${numeric}%`).order("phone_normalized")
    : /^mh-?\d/i.test(raw)
      ? query.ilike("uhid", `${raw.replace(/\s+/g, "")}%`).order("uhid")
      : query.ilike("name_normalized", `${raw.toLowerCase().replace(/\s+/g, " ")}%`).order("name_normalized");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
