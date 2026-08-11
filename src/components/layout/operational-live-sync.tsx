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
    refetchInterval: 60_000,
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
    for (const table of roleTables[role]) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void queryClient.invalidateQueries({ queryKey });
          if (document.visibilityState === "visible") router.refresh();
        },
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pathname, queryClient, queryKey, role, router]);

  return null;
}
