import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { AssignPatientDialog, ChargeDialog, IpPaymentDialog } from "@/features/ip/ip-dialogs";
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
  patients: { name: string; phone_normalized: string } | null;
  doctors: { display_name: string } | null;
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
    note: string;
    doctors: { display_name: string } | null;
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
      "id,ticket_number,patient_id,is_emergency,admission_at,discharge_at,room,bed,admission_reason,status,final_diagnosis,hospital_course,treatment_summary,discharge_medicines,discharge_advice,follow_up,patients(name,phone_normalized),doctors(display_name),ip_charges(id,created_at,category,item,quantity,rate_paise,amount_paise),ip_payments(id,created_at,amount_paise,mode,reference),ip_progress_notes(id,created_at,note,doctors(display_name))",
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
  const { data: chargeRows } = canManage ? await supabase.from("charges").select("id,category,charge_name,amount_paise").eq("active", true).in("category", ["doctor","ward","room","bed","treatment","test","other"]).order("category").order("charge_name") : { data: [] };
  const chargePresets = (chargeRows ?? []).map((charge) => ({ id: charge.id, category: charge.category, name: charge.charge_name, rate: (charge.amount_paise / 100).toFixed(2) }));
  const balance = Math.max(0, total - paid);
  return (
    <div>
      <PageHeader
        title={`${ticket.ticket_number} · ${ticket.patients?.name ?? "Unidentified Emergency Patient"}`}
        description={`Patient ID ${ticket.patients?.phone_normalized ?? "Pending assignment"} · admitted ${formatHospitalDate(ticket.admission_at, true)}`}
        actions={
          <>
            {canManage && !ticket.patient_id && ticket.status !== "discharged" ? <AssignPatientDialog ticketId={ticket.id} /> : null}
            {canFinance ? <Button size="sm" variant="outline" render={<Link href={`/print/ip-ticket/${ticket.id}`} />}><Printer /> Running Bill</Button> : null}
            {ticket.status === "discharged" ? <>{canFinance ? <Button size="sm" variant="outline" render={<Link href={`/print/ip-bill/${ticket.id}`} />}><Printer /> Final Bill</Button> : null}<Button size="sm" render={<Link href={`/print/discharge/${ticket.id}`} />}><Printer /> Discharge Summary</Button></> : null}
            {canDoctor && ticket.status === "admitted" ? <ProgressNoteDialog ticketId={ticket.id} /> : null}
            {canDoctor && ["admitted","discharge_pending"].includes(ticket.status) ? <DischargeSummaryDialog ticketId={ticket.id} initialValues={{finalDiagnosis:ticket.final_diagnosis,hospitalCourse:ticket.hospital_course,treatmentSummary:ticket.treatment_summary,dischargeMedicines:ticket.discharge_medicines,dischargeAdvice:ticket.discharge_advice,followUp:ticket.follow_up}} /> : null}
            {canManage && ticket.status !== "discharged" ? <>
              <ChargeDialog ticketId={ticket.id} presets={chargePresets} />
              <IpPaymentDialog ticketId={ticket.id} />
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
              {ticket.ip_progress_notes.map((n) => (
                <div className="rounded-lg border p-3" key={n.id}>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{n.doctors?.display_name}</span>
                    <span>{formatHospitalDate(n.created_at, true)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{n.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
