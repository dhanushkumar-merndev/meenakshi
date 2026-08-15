import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  await getCurrentProfile();
  const metric = request.nextUrl.searchParams.get("metric")?.trim();
  if (!metric) return NextResponse.json({ error: "Metric required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  // The RPC enforces its own role guard, including a stricter one for money.
  const { data, error } = await supabase.rpc("dashboard_metric_detail", {
    p_metric: metric,
    p_limit: 25,
  });
  if (error)
    return NextResponse.json(
      { error: error.message.includes("forbidden") ? "Not available for your role" : "Detail unavailable" },
      { status: error.message.includes("forbidden") ? 403 : 500 },
    );

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
