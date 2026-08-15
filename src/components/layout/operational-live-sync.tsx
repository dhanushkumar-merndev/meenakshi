"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/types/hospital";

const roleTables: Record<AppRole, string[]> = {
  admin: ["visits", "patient_reports", "prescriptions", "ip_tickets", "medicine_batches"],
  reception: ["visits", "visit_payments", "patient_reports", "consultations"],
  op: ["visits", "vitals", "patient_reports"],
  doctor: ["visits", "consultations", "patient_reports", "ip_tickets"],
  ip: ["ip_tickets", "ip_charges", "ip_payments", "patient_reports"],
  pharmacy: ["prescriptions", "medicine_batches", "pharmacy_sales"],
};

export function OperationalLiveSync({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const previous = useRef<string | undefined>(undefined);
  const queryKey = useMemo(() => ["operational-version", role] as const, [role]);
  const { data } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/live/version", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Live refresh unavailable");
      return (await response.json()) as { signature: string };
    },
    // Realtime below is the primary freshness signal. This poll is only a
    // safety net for a dropped websocket, so it runs every 10 minutes rather
    // than every minute: at 60s it was ~9,600 needless function invocations a
    // day across 20 staff, for data realtime had already delivered.
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!data?.signature) return;
    if (previous.current && previous.current !== data.signature) router.refresh();
    previous.current = data.signature;
  }, [data?.signature, router]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel = supabase.channel(`operations:${role}`);
    // router.refresh() re-runs the whole server component tree, so firing it
    // per row was expensive: one pharmacy dispense touches prescriptions,
    // prescription_items and a batch row, and every watched table change hit
    // every signed-in user of that role. Bursts are coalesced into one refresh.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: ["hospital-notifications"] });
        if (document.visibilityState === "visible") router.refresh();
      }, 2_000);
    };
    for (const table of roleTables[role]) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [pathname, queryClient, queryKey, role, router]);

  return null;
}
