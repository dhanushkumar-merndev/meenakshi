import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate, ipDaysSince, isHospitalToday } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { containsSearchPattern, EMPTY_UUID } from "@/lib/domain/search";
import { findMatchingPatientIds } from "@/lib/search/patients";
import { AdmissionDialog } from "@/features/ip/ip-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { FilterTabs } from "@/components/shared/filter-tabs";
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
  room_bed_id: string | null;
  status: string;
  is_emergency: boolean;
  patients: { name: string } | null;
  doctors: { display_name: string } | null;
  total_paise: number;
  paid_paise: number;
};
type TicketFinancial = { ticket_id: string; total_paise: number; paid_paise: number };
export default async function IpPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; q?: string; view?: string }> }) {
  const profile = await requireRoute("/ip");
  const params = await searchParams; const selectedStatus = params.status ?? "active"; const page = Math.max(1, Number(params.page) || 1); const size = 50; const q = params.q?.trim() ?? "";
  // Grid shows live bed occupancy across every room, so it ignores the status
  // filter and paging that only make sense for the ticket list.
  const view = params.view === "grid" ? "grid" : "list";
  const supabase = await createSupabaseServerClient();
  const patientIds = q ? await findMatchingPatientIds(supabase, q) : [];
  const [ticketsResult, doctorsResult, roomsResult, occupancyResult, referralResult] = await Promise.all([
    (() => {
      let query = supabase
      .from("ip_tickets")
      .select(
        "id,ticket_number,admission_at,room,bed,room_bed_id,status,is_emergency,patients(name),doctors(display_name)",
        { count: "exact" },
      )
      // Newest admission first on every tab.
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
    supabase.from("room_beds").select("id,room_number,bed_number,floor,room_type").eq("active",true).order("floor").order("room_number").order("bed_number"),
    view === "grid"
      ? supabase
          .from("ip_tickets")
          .select("id,room_bed_id,admission_at,patients(name,phone_normalized),doctors(display_name)")
          .in("status", ["admitted", "discharge_pending"])
          .not("room_bed_id", "is", null)
      : Promise.resolve({ data: [] }),
    supabase.rpc("list_admission_referrals", { p_limit: 25 }),
  ]);
  const canFinance = profile.role === "admin" || profile.role === "ip";
  const sourceTickets = (ticketsResult.data ?? []) as unknown as Omit<Ticket, "total_paise" | "paid_paise">[];
  const { data: financialRows } = canFinance && sourceTickets.length
    ? await supabase.rpc("get_ip_financial_summaries", {
        p_ticket_ids: sourceTickets.map((ticket) => ticket.id),
      })
    : { data: [] };
  const financeByTicket = new Map(
    ((financialRows ?? []) as TicketFinancial[]).map((row) => [row.ticket_id, row]),
  );
  const tickets: Ticket[] = sourceTickets.map((ticket) => ({
    ...ticket,
    total_paise: Number(financeByTicket.get(ticket.id)?.total_paise ?? 0),
    paid_paise: Number(financeByTicket.get(ticket.id)?.paid_paise ?? 0),
  }));
  const referrals = (referralResult.data ?? []) as unknown as Referral[];
  const occupied = new Set(tickets.filter((ticket)=>["admitted","discharge_pending"].includes(ticket.status)).map((ticket)=>ticket.room_bed_id));
  // Shared by the page-level New Admission button and by each referral row.
  const doctorOptions = (doctorsResult.data ?? []).map((d) => ({ id: d.id, label: d.display_name }));
  const roomOptions = (roomsResult.data ?? [])
    .filter((room) => !occupied.has(room.id))
    .map((room) => ({ id: room.id, label: `Floor ${room.floor} · Room ${room.room_number} · Bed ${room.bed_number}` }));
  return (
    <div>
      <PageHeader
        title={view === "grid" ? "Room Occupancy" : selectedStatus === "all" ? "IP Tickets" : selectedStatus === "discharge_pending" ? "Pending Discharges" : selectedStatus === "discharged" ? "Discharged Patients" : "Current IP Patients"}
        description={view === "grid" ? "Live grid of available and occupied hospital rooms and beds" : "One ticket holds every charge, payment, note, and discharge record"}
        actions={
          <>
            <FilterTabs
              ariaLabel="Switch between ticket list and room grid"
              active={view}
              param="view"
              params={{ q, status: selectedStatus }}
              tabs={[
                { label: "List", value: "list" },
                { label: "Grid", value: "grid" },
              ]}
            />
            {profile.role === "admin" || profile.role === "ip" ? (
              <AdmissionDialog doctors={doctorOptions} rooms={roomOptions} />
            ) : null}
          </>
        }
      />
      {referrals.length ? (
        <Card className="mb-4 border-primary/40">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">
                Admission referrals from doctors ({referrals.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                The doctor recommends the ward type; you assign the room and bed.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Referred By</TableHead>
                    <TableHead>Ward Type</TableHead>
                    <TableHead>Admission Reason</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Recommended</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((referral) => (
                    <TableRow key={referral.consultation_id}>
                      <TableCell className="font-medium">
                        {referral.patient_name}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {referral.patient_phone}
                        </span>
                      </TableCell>
                      <TableCell>{referral.doctor_name}</TableCell>
                      <TableCell>
                        <StatusBadge status={referral.ward_type} />
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {referral.admission_reason ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">
                        {referral.assessment ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatHospitalDate(referral.recommended_at, true)}
                      </TableCell>
                      {/* Admitting from the referral row is what carries the
                          source visit onto the ticket, and the source visit is
                          what removes the referral from this queue. Admitting
                          through the generic New Admission button leaves the
                          referral sitting here for ever. */}
                      <TableCell className="text-right">
                        <AdmissionDialog
                          triggerLabel="Admit"
                          doctors={doctorOptions}
                          rooms={roomOptions}
                          initialPatient={{
                            id: referral.patient_id,
                            label: `${referral.patient_name} · ${referral.patient_phone}`,
                          }}
                          initialDoctorId={
                            doctorOptions.find((option) => option.label === referral.doctor_name)?.id ?? ""
                          }
                          sourceVisitId={referral.visit_id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {view === "grid" ? (
        <RoomGrid
          rooms={(roomsResult.data ?? []) as RoomBed[]}
          tickets={(occupancyResult.data ?? []) as unknown as Occupancy[]}
        />
      ) : (
      <>
      <FilterTabs
        ariaLabel="Filter IP tickets by status"
        active={selectedStatus}
        params={{ q, view }}
        tabs={[
          { label: "Current", value: "active" },
          { label: "Pending Discharge", value: "discharge_pending" },
          { label: "Discharged", value: "discharged" },
          { label: "All Tickets", value: "all" },
        ]}
      />
      <DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search IP ticket, patient name or phone" ariaLabel="Search IP patients" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Ticket</TableHead>
                  <TableHead>Room number</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>Patient details</TableHead>
                  <TableHead>IP days</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Admitted</TableHead>
                  {canFinance ? <><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead></> : null}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length ? (
                  tickets.map((ticket) => {
                    const total = ticket.total_paise;
                    const paid = ticket.paid_paise;
                    return (
                      <TableRow key={ticket.id} historical={!isHospitalToday(ticket.admission_at)}>
                        <TableCell className="font-medium">
                          {ticket.ticket_number}
                        </TableCell>
                        <TableCell>
                          {ticket.room ?? "—"}/{ticket.bed ?? "—"}
                        </TableCell>
                        <TableCell>{(roomsResult.data ?? []).find((room) => room.id === ticket.room_bed_id)?.floor ?? "—"}</TableCell>
                        <TableCell><StatusBadge status="occupied" /></TableCell>
                        <TableCell className="font-medium">{ticket.patients?.name ?? (ticket.is_emergency ? "Unidentified emergency" : "—")}</TableCell>
                        <TableCell>{ipDaysSince(ticket.admission_at)}</TableCell>
                        <TableCell>{ticket.doctors?.display_name}</TableCell>
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
                      colSpan={canFinance ? 14 : 11}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q ? "No IP tickets match this search." : "No patients currently admitted."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div><TablePager page={page} pages={Math.max(1, Math.ceil((ticketsResult.count ?? 0) / size))} total={ticketsResult.count ?? 0} params={{ status: selectedStatus, q, view }} />
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

type Referral = {
  consultation_id: string;
  visit_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  ward_type: string;
  admission_reason: string | null;
  assessment: string | null;
  recommended_at: string;
};
type RoomBed = { id: string; room_number: string; bed_number: string; floor: string; room_type: string | null };
type Occupancy = {
  id: string;
  room_bed_id: string | null;
  admission_at: string;
  patients: { name: string; phone_normalized: string } | null;
  doctors: { display_name: string } | null;
};

/** Live bed board: every active bed, grouped by floor, occupied ones linked to their ticket. */
function RoomGrid({ rooms, tickets }: { rooms: RoomBed[]; tickets: Occupancy[] }) {
  const byBed = new Map(tickets.map((ticket) => [ticket.room_bed_id, ticket]));
  const floors = [...new Set(rooms.map((room) => room.floor))];
  if (!rooms.length)
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          No rooms or beds configured yet.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-6">
      {floors.map((floor) => (
        <section key={floor}>
          <h2 className="mb-3 text-sm font-semibold">{floor}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms
              .filter((room) => room.floor === floor)
              .map((room) => {
                const ticket = byBed.get(room.id);
                return (
                  <Card
                    key={room.id}
                    className={ticket ? "border-destructive/30" : "border-primary/30"}
                  >
                    <CardContent className="space-y-1 p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">
                          Room {room.room_number} · Bed {room.bed_number}
                        </p>
                        <StatusBadge status={ticket ? "occupied" : "available"} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {room.room_type ?? "Standard"}
                      </p>
                      {ticket ? (
                        <>
                          <p className="pt-1 font-medium">{ticket.patients?.name ?? "—"}</p>
                          <p className="text-muted-foreground">{ticket.patients?.phone_normalized ?? "—"}</p>
                          <p>{ipDaysSince(ticket.admission_at)} IP days</p>
                          <p>{ticket.doctors?.display_name ?? "—"}</p>
                          <Button className="mt-2" size="sm" variant="outline" render={<Link href={`/ip/${ticket.id}`} />}>
                            Open IP ticket
                          </Button>
                        </>
                      ) : (
                        <p className="py-4 text-center text-muted-foreground">Ready for assignment</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
