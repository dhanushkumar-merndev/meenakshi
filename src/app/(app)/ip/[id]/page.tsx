import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { IP_CHARGE_MASTER_CATEGORIES } from "@/lib/domain/charge-categories";
import { AssignPatientDialog, ChargeDialog, IpPaymentDialog, RequestInventoryDialog } from "@/features/ip/ip-dialogs";
import { CompleteDischargeDialog, DischargeSummaryDialog, ProgressNoteDialog } from "@/features/ip/clinical-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  patient_id: string | null;
  is_emergency: boolean;
  ticket_number: string;
  admission_at: string;
  discharge_at: string | null;
  room: string | null;
  bed: string | null;
  admission_reason: string | null;
  final_diagnosis: string | null;
  hospital_course: string | null;
  treatment_summary: string | null;
  discharge_medicines: string | null;
  discharge_advice: string | null;
  follow_up: string | null;
  status: string;
  patients: { name: string; uhid: string | null; phone_normalized: string } | null;
  doctors: { display_name: string; ip_visit_fee_paise: number | null } | null;
  ip_charges: Array<{
    id: string;
    created_at: string;
    category: string;
    item: string;
    quantity: number;
    rate_paise: number;
    amount_paise: number;
  }>;
  ip_payments: Array<{
    id: string;
    created_at: string;
    amount_paise: number;
    mode: string;
    reference: string | null;
  }>;
  ip_progress_notes: Array<{
    id: string;
    created_at: string;
    note: string | null;
    pulse: string | null;
    bp: string | null;
    spo2: string | null;
    respiratory_rate: string | null;
    chief_complaint: string | null;
    issues: string | null;
    examination: string | null;
    plan: string | null;
    doctors: { display_name: string } | null;
  }>;
  ip_inventory_requests: Array<{
    id: string;
    notes: string | null;
    status: string;
    created_at: string;
    ip_inventory_request_items: Array<{
      id: string;
      requested_name: string;
      requested_quantity: number;
      fulfilled_quantity: number;
      unit_price_paise: number | null;
      status: string;
    }>;
  }>;
};
export default async function IpTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRoute("/ip");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ip_tickets")
    .select(
      "id,ticket_number,patient_id,is_emergency,admission_at,discharge_at,room,bed,admission_reason,status,final_diagnosis,hospital_course,treatment_summary,discharge_medicines,discharge_advice,follow_up,patients(name,uhid,phone_normalized),doctors(display_name,ip_visit_fee_paise),ip_charges(id,created_at,category,item,quantity,rate_paise,amount_paise),ip_payments(id,created_at,amount_paise,mode,reference),ip_progress_notes(id,created_at,note,pulse,bp,spo2,respiratory_rate,chief_complaint,issues,examination,plan,doctors(display_name)),ip_inventory_requests(id,notes,status,created_at,ip_inventory_request_items(id,requested_name,requested_quantity,fulfilled_quantity,unit_price_paise,status))",
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const ticket = data as unknown as Ticket;
  const total = ticket.ip_charges.reduce((s, c) => s + c.amount_paise, 0);
  const paid = ticket.ip_payments.reduce((s, p) => s + p.amount_paise, 0);
  const canManage = profile.role === "admin" || profile.role === "ip";
  const canFinance = canManage;
  const canDoctor = profile.role === "admin" || profile.role === "doctor";
  const { data: chargeRows } = canManage ? await supabase.from("charges").select("id,category,charge_name,amount_paise").eq("active", true).in("category", IP_CHARGE_MASTER_CATEGORIES).order("category").order("charge_name") : { data: [] };
  const chargePresets = (chargeRows ?? []).map((charge) => ({ id: charge.id, category: charge.category, name: charge.charge_name, rate: (charge.amount_paise / 100).toFixed(2) }));
  const balance = Math.max(0, total - paid);
  return (
    <div>
      <PageHeader
        title={`${ticket.ticket_number} · ${ticket.patients?.name ?? "Unidentified Emergency Patient"}`}
        description={`Patient ID ${ticket.patients?.uhid ?? "Pending assignment"} · admitted ${formatHospitalDate(ticket.admission_at, true)}`}
        actions={
          <>
            {canManage && !ticket.patient_id && ticket.status !== "discharged" ? <AssignPatientDialog ticketId={ticket.id} /> : null}
            {canFinance ? <Button size="sm" variant="outline" render={<Link href={`/print/ip-ticket/${ticket.id}`} />}><Printer /> Running Bill</Button> : null}
            {ticket.status === "discharged" ? <>{canFinance ? <Button size="sm" variant="outline" render={<Link href={`/print/ip-bill/${ticket.id}`} />}><Printer /> Final Bill</Button> : null}<Button size="sm" render={<Link href={`/print/discharge/${ticket.id}`} />}><Printer /> Discharge Summary</Button></> : null}
            {canDoctor && ticket.status === "admitted" ? <ProgressNoteDialog ticketId={ticket.id} defaultFee={typeof ticket.doctors?.ip_visit_fee_paise === "number" ? (ticket.doctors.ip_visit_fee_paise / 100).toFixed(2) : undefined} /> : null}
            {canDoctor && ["admitted","discharge_pending"].includes(ticket.status) ? <DischargeSummaryDialog ticketId={ticket.id} initialValues={{finalDiagnosis:ticket.final_diagnosis,hospitalCourse:ticket.hospital_course,treatmentSummary:ticket.treatment_summary,dischargeMedicines:ticket.discharge_medicines,dischargeAdvice:ticket.discharge_advice,followUp:ticket.follow_up}} /> : null}
            {(canManage || canDoctor) && ["admitted", "discharge_pending"].includes(ticket.status) ? (
              <RequestInventoryDialog ticketId={ticket.id} />
            ) : null}
            {canManage && ticket.status !== "discharged" ? <>
              <ChargeDialog ticketId={ticket.id} presets={chargePresets} />
              <IpPaymentDialog ticketId={ticket.id} totalPaise={total} paidPaise={paid} />
            </> : null}
            {canManage && ticket.status === "discharge_pending" && ticket.patient_id ? <CompleteDischargeDialog ticketId={ticket.id} balancePaise={balance} /> : null}
          </>
        }
      />
      {!ticket.patient_id ? (
        <Alert className="mb-4">
          <AlertTitle>Emergency patient assignment pending</AlertTitle>
          <AlertDescription>
            Clinical and billing activity remains on this ticket. Assign the
            confirmed patient before discharge.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={ticket.status} />
        <span className="text-sm text-muted-foreground">
          Doctor: {ticket.doctors?.display_name} · Room/Bed:{" "}
          {ticket.room ?? "—"}/{ticket.bed ?? "—"}
        </span>
      </div>
      {canFinance ? <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Running Total</p>
            <p className="text-2xl font-semibold">{formatInr(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-2xl font-semibold">{formatInr(paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-2xl font-semibold">
              {formatInr(balance)}
            </p>
          </CardContent>
        </Card>
      </section> : null}
      <Tabs defaultValue={canFinance ? "charges" : "notes"}>
        <TabsList>
          {canFinance ? <TabsTrigger value="charges">Charges</TabsTrigger> : null}
          {canFinance ? <TabsTrigger value="payments">Payments</TabsTrigger> : null}
          <TabsTrigger value="notes">Progress Notes</TabsTrigger>
          {ticket.ip_inventory_requests.length ? (
            <TabsTrigger value="requests">Pharmacy Requests</TabsTrigger>
          ) : null}
        </TabsList>
        {canFinance ? <TabsContent value="charges">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticket.ip_charges.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {formatHospitalDate(c.created_at, true)}
                      </TableCell>
                      <TableCell className="capitalize">{c.category}</TableCell>
                      <TableCell>{c.item}</TableCell>
                      <TableCell>{c.quantity}</TableCell>
                      <TableCell>{formatInr(c.rate_paise)}</TableCell>
                      <TableCell>{formatInr(c.amount_paise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent> : null}
        {canFinance ? <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticket.ip_payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {formatHospitalDate(p.created_at, true)}
                      </TableCell>
                      <TableCell>{formatInr(p.amount_paise)}</TableCell>
                      <TableCell className="capitalize">
                        {p.mode.replaceAll("_", " ")}
                      </TableCell>
                      <TableCell>{p.reference ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent> : null}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Clinical progress notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.ip_progress_notes.length ? (
                ticket.ip_progress_notes.map((n) => {
                  const vitals = [
                    n.pulse ? `Pulse ${n.pulse}` : null,
                    n.bp ? `BP ${n.bp}` : null,
                    n.spo2 ? `SpO2 ${n.spo2}` : null,
                    n.respiratory_rate ? `RR ${n.respiratory_rate}` : null,
                  ].filter(Boolean);
                  const fields: Array<[string, string | null]> = [
                    ["Chief complaint", n.chief_complaint],
                    ["Issues", n.issues],
                    ["Examination", n.examination],
                    ["Plan", n.plan],
                  ];
                  return (
                    <div className="rounded-lg border p-3" key={n.id}>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{n.doctors?.display_name}</span>
                        <span>{formatHospitalDate(n.created_at, true)}</span>
                      </div>
                      {vitals.length ? (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {vitals.join(" · ")}
                        </p>
                      ) : null}
                      <dl className="mt-2 space-y-1.5 text-sm">
                        {fields
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-xs font-medium text-muted-foreground">
                                {label}
                              </dt>
                              <dd className="whitespace-pre-wrap">{value}</dd>
                            </div>
                          ))}
                      </dl>
                      {n.note ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {n.note}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  No progress notes recorded yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {ticket.ip_inventory_requests.length ? (
          <TabsContent value="requests" className="space-y-3">
            {ticket.ip_inventory_requests.map((request) => (
              <Card key={request.id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {formatHospitalDate(request.created_at, true)}
                    </CardTitle>
                    {request.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{request.notes}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={request.status} />
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Fulfilled</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {request.ip_inventory_request_items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.requested_name}</TableCell>
                          <TableCell>{item.requested_quantity}</TableCell>
                          <TableCell>
                            {item.status === "pending" ? "—" : item.fulfilled_quantity}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={item.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
