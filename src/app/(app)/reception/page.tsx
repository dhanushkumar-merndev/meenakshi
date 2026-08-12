import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { EMPTY_UUID, searchDigits } from "@/lib/domain/search";
import { findMatchingPatientIds } from "@/lib/search/patients";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type Visit = {
  id: string;
  token_number: number;
  visit_type: string;
  fee_paise: number;
  status: string;
  created_at: string;
  patients: { id: string; name: string; phone_normalized: string } | null;
  doctors: { display_name: string } | null;
  visit_payments: Array<{ amount_paise: number }>;
};
export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRoute("/reception");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const patientIds = q ? await findMatchingPatientIds(supabase, q) : [];
  let visitsQuery = supabase
    .from("visits")
    .select(
      "id,token_number,visit_type,status,created_at,patients(id,name,phone_normalized),doctors(display_name),visit_payments(amount_paise)",
    )
    .eq("visit_date", today)
    .order("created_at", { ascending: false });
  if (q) {
    const filters = patientIds.length
      ? [`patient_id.in.(${patientIds.join(",")})`]
      : [`patient_id.eq.${EMPTY_UUID}`];
    if (/^#?\d{1,4}$/.test(q)) {
      filters.push(`token_number.eq.${Number(searchDigits(q))}`);
    }
    visitsQuery = visitsQuery.or(filters.join(","));
  }
  const { data } = await visitsQuery;
  const source = (data ?? []) as unknown as Visit[];
  const { data: financialRows } = source.length ? await supabase.rpc("get_visit_financial_summaries", { p_visit_ids: source.map((visit) => visit.id) }) : { data: [] };
  const finance = new Map(((financialRows ?? []) as Array<{ visit_id: string; fee_paise: number }>).map((row) => [row.visit_id, row.fee_paise]));
  const rows = source.map((visit) => ({ ...visit, fee_paise: finance.get(visit.id) ?? 0 }));
  return (
    <div>
      <PageHeader
        title="Today's Visits"
        description="Reception queue, offline collections, and token access"
        actions={
          <Button render={<Link href="/patients" />}>
            Find or Add Patient
          </Button>
        }
      />
      <DebouncedSearchInput
        className="mb-4 max-w-md"
        initialValue={q}
        placeholder="Search token, patient name or phone"
        ariaLabel="Search today's reception visits"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Collected</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((visit) => {
                    const collected = visit.visit_payments.reduce(
                      (s, p) => s + p.amount_paise,
                      0,
                    );
                    return (
                      <TableRow key={visit.id}>
                        <TableCell className="font-semibold">
                          #{visit.token_number}
                        </TableCell>
                        <TableCell>{visit.patients?.name}</TableCell>
                        <TableCell>
                          {visit.patients?.phone_normalized}
                        </TableCell>
                        <TableCell>{visit.doctors?.display_name}</TableCell>
                        <TableCell className="capitalize">
                          {visit.visit_type.replaceAll("_", " ")}
                        </TableCell>
                        <TableCell>{formatInr(collected)}</TableCell>
                        <TableCell>
                          {formatInr(Math.max(0, visit.fee_paise - collected))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={visit.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/visits/${visit.id}`} />}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q ? "No visits match this search." : "No visits created today."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-t p-3 text-xs text-muted-foreground">
            Updated {formatHospitalDate(new Date().toISOString(), true)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
