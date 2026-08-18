import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TicketRow = {
  ip_ticket_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  patient_uhid: string;
  ticket_number: string;
  status: string;
  doctor_name: string;
  room: string | null;
  bed: string | null;
};

export async function GET(request: NextRequest) {
  await requirePermission("dispenseAsPerRx");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 120)
    return NextResponse.json({ error: "Search is too long" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_admitted_ip_tickets_for_pharmacy", {
    p_query: q || null,
    p_limit: 30,
  });
  if (error) return NextResponse.json({ error: "Search unavailable" }, { status: 500 });
  return NextResponse.json(
    { items: (data ?? []) as TicketRow[] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
