import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/hospital";

export type DashboardSummary = Record<string, number>;

/** Row shape returned by the list_pending_prescriptions RPC. */
export type PendingPrescriptionRow = {
  id: string;
  prescription_number: number;
  status: string;
  created_at: string;
  expires_at: string;
  token_number: number | null;
  source: string;
  patient_name: string | null;
  patient_phone: string | null;
  doctor_name: string | null;
  items: Array<{ id: string }>;
};

export async function getDashboardData(profile: Profile) {
  const supabase = await createSupabaseServerClient();
  // Prescription expiry is swept by the Supabase pg_cron job
  // "expire-stale-hospital-prescriptions" (every minute), not per dashboard load.
  const summaryPromise = supabase.rpc("dashboard_summary");
  if (profile.role === "pharmacy") {
    // Via RPC: the pharmacy role has no SELECT on public.patients, so an
    // embedded patient join resolves to null and every name renders as "—".
    const [summaryResult, result] = await Promise.all([summaryPromise, supabase.rpc("list_pending_prescriptions", { p_query: null, p_limit: 8 })]);
    return { summary: (summaryResult.data ?? {}) as DashboardSummary, role: profile.role, activity: { kind: "pharmacy" as const, rows: (result.data ?? []) as PendingPrescriptionRow[] } };
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
