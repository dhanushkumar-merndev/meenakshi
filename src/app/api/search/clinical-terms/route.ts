import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TERM_TYPES = ["diagnosis", "symptom", "investigation", "advice"];

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!["admin", "doctor", "op", "ip"].includes(profile.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = request.nextUrl.searchParams.get("type") ?? "diagnosis";
  if (!TERM_TYPES.includes(type))
    return NextResponse.json({ error: "Unknown term type" }, { status: 400 });

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_clinical_terms", {
    p_term_type: type,
    p_query: q,
    p_limit: 20,
  });
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
