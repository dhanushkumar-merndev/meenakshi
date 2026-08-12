import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { containsSearchPattern, EMPTY_UUID } from "@/lib/domain/search";
import { findMatchingPatientIds } from "@/lib/search/patients";
import { AdmissionDialog } from "@/features/ip/ip-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { TablePager } from "@/components/shared/table-pager";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
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
type Ticket = {
  id: string;
  ticket_number: string;
  admission_at: string;
  room: string | null;
  bed: string | null;
  status: string;
  is_emergency: boolean;
  patients: { name: string } | null;
  doctors: { display_name: string } | null;
  ip_charges: Array<{ amount_paise: number }>;
  ip_payments: Array<{ amount_paise: number }>;
};
export default async function IpPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  const profile = await requireRoute("/ip");
  const params = await searchParams; const selectedStatus = params.status ?? "active"; const page = Math.max(1, Number(params.page) || 1); const size = 50; const q = params.q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const patientIds = q ? await findMatchingPatientIds(supabase, q) : [];
  const [ticketsResult, doctorsResult] = await Promise.all([
    (() => {
      let query = supabase
      .from("ip_tickets")
      .select(
        "id,ticket_number,admission_at,room,bed,status,is_emergency,patients(name),doctors(display_name),ip_charges(amount_paise),ip_payments(amount_paise)",
        { count: "exact" },
      )
      .order("admission_at", { ascending: false })
      .range((page - 1) * size, page * size - 1);
      if (selectedStatus === "active") query = query.in("status", ["admitted", "discharge_pending"]);
      else if (["admitted", "discharge_pending", "discharged", "cancelled"].includes(selectedStatus)) query = query.eq("status", selectedStatus as "admitted");
      if (q) query = query.or([
        `ticket_number.ilike.${containsSearchPattern(q)}`,
        patientIds.length ? `patient_id.in.(${patientIds.join(",")})` : `patient_id.eq.${EMPTY_UUID}`,
      ].join(","));
      return query;
    })(),
    supabase
      .from("doctors")
      .select("id,display_name")
      .eq("active", true)
      .order("display_name"),
  ]);
  const tickets = (ticketsResult.data ?? []) as unknown as Ticket[];
  const canFinance = profile.role === "admin" || profile.role === "ip";
  return (
    <div>
      <PageHeader
        title={selectedStatus === "all" ? "IP Tickets" : selectedStatus === "discharge_pending" ? "Pending Discharges" : selectedStatus === "discharged" ? "Discharged Patients" : "Current IP Patients"}
        description="One ticket holds every charge, payment, note, and discharge record"
        actions={
          profile.role === "admin" || profile.role === "ip" ? (
            <AdmissionDialog
              doctors={(doctorsResult.data ?? []).map((d) => ({
                id: d.id,
                label: d.display_name,
              }))}
            />
          ) : undefined
        }
      />
      <DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search IP ticket, patient name or phone" ariaLabel="Search IP patients" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Ticket</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Room/Bed</TableHead>
                  <TableHead>Admitted</TableHead>
                  {canFinance ? <><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead></> : null}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length ? (
                  tickets.map((ticket) => {
                    const total = ticket.ip_charges.reduce(
                      (s, c) => s + c.amount_paise,
                      0,
                    );
                    const paid = ticket.ip_payments.reduce(
                      (s, p) => s + p.amount_paise,
                      0,
                    );
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">
                          {ticket.ticket_number}
                        </TableCell>
                        <TableCell>{ticket.patients?.name ?? (ticket.is_emergency ? "Unidentified emergency" : "—")}</TableCell>
                        <TableCell>{ticket.doctors?.display_name}</TableCell>
                        <TableCell>
                          {ticket.room ?? "—"}/{ticket.bed ?? "—"}
                        </TableCell>
                        <TableCell>
                          {formatHospitalDate(ticket.admission_at)}
                        </TableCell>
                        {canFinance ? <><TableCell>{formatInr(total)}</TableCell><TableCell>{formatInr(paid)}</TableCell><TableCell>
                          {formatInr(Math.max(0, total - paid))}
                        </TableCell></> : null}
                        <TableCell>
                          <StatusBadge status={ticket.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/ip/${ticket.id}`} />}
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
                      colSpan={canFinance ? 10 : 7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q ? "No IP tickets match this search." : "No patients currently admitted."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div><TablePager page={page} pages={Math.max(1, Math.ceil((ticketsResult.count ?? 0) / size))} total={ticketsResult.count ?? 0} params={{ status: selectedStatus, q }} />
        </CardContent>
      </Card>
    </div>
  );
}
