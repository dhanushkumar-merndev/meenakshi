import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/hospital";

export type DashboardSummary = Record<string, number>;

export async function getDashboardData(profile: Profile) {
  const supabase = await createSupabaseServerClient();
  if (profile.role === "admin" || profile.role === "pharmacy") {
    await supabase.rpc("expire_stale_prescriptions");
  }
  const summaryPromise = supabase.rpc("dashboard_summary");
  if (profile.role === "pharmacy") {
    const [summaryResult, result] = await Promise.all([summaryPromise, supabase.from("prescriptions").select("id,prescription_number,status,created_at,visit_id,ip_ticket_id,doctors(display_name),visits(patients(name)),ip_tickets(patients(name)),prescription_items(id)").in("status", ["pending", "partially_dispensed"]).order("created_at").limit(8)]);
    return { summary: (summaryResult.data ?? {}) as DashboardSummary, role: profile.role, activity: { kind: "pharmacy" as const, rows: result.data ?? [] } };
  }
  if (profile.role === "ip") {
    const [summaryResult, result] = await Promise.all([summaryPromise, supabase.from("ip_tickets").select("id,ticket_number,admission_at,room,bed,status,is_emergency,patients(name),doctors(display_name),ip_charges(amount_paise),ip_payments(amount_paise)").in("status", ["admitted", "discharge_pending"]).order("admission_at").limit(8)]);
    return { summary: (summaryResult.data ?? {}) as DashboardSummary, role: profile.role, activity: { kind: "ip" as const, rows: result.data ?? [] } };
  }
  const [summaryResult, visitsResult] = await Promise.all([
    summaryPromise,
    supabase
      .from("visits")
      .select("id, token_number, visit_type, status, created_at, patients(name), doctors(display_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    summary: (summaryResult.data ?? {}) as DashboardSummary,
    activity: { kind: "visits" as const, rows: (visitsResult.data ?? []) as unknown as Array<{
      id: string;
      token_number: number;
      visit_type: string;
      status: string;
      created_at: string;
      patients: { name: string } | null;
      doctors: { display_name: string } | null;
    }> },
    role: profile.role,
  };
}
