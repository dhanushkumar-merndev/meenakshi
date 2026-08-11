import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, formatHospitalDate } from "@/lib/domain/date";
import { formatInr, paymentSummary } from "@/lib/domain/money";
import { CreateVisitDialog } from "@/features/visits/create-visit-dialog";
import { EditPatientDialog } from "@/features/patients/edit-patient-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type VisitRow = {
  id: string;
  visit_date: string;
  token_number: number;
  visit_type: string;
  fee_paise: number;
  status: string;
  doctors: { display_name: string } | null;
  consultations: { assessment: string | null }[];
  visit_payments: { amount_paise: number; mode: string; created_at: string }[];
};
type DoctorRow = {
  id: string;
  display_name: string;
  op_fee_paise: number;
  follow_up_fee_paise: number;
  departments: { name: string } | null;
};
type IpRow = {
  id: string;
  ticket_number: string;
  admission_at: string;
  discharge_at: string | null;
  room: string | null;
  bed: string | null;
  status: string;
  doctors: { display_name: string } | null;
};
type ReportRow = {
  id: string;
  report_name: string;
  report_date: string;
  status: string;
  report_categories: { name: string } | null;
};

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRoute("/patients");
  const canFinance = hasPermission(profile.role, "viewVisitFinance");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [patientResult, visitsResult, doctorsResult, ipResult, reportsResult] =
    await Promise.all([
      supabase
        .from("patients")
        .select(
          "id,name,phone_normalized,dob,gender,blood_group,allergies,address,status,created_at",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("visits")
        .select(`id,visit_date,token_number,visit_type,status,doctors(display_name),consultations(assessment)${canFinance ? ",visit_payments(amount_paise,mode,created_at)" : ""}`)
        .eq("patient_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("doctors")
        .select(
          "id,display_name,op_fee_paise,follow_up_fee_paise,departments(name)",
        )
        .eq("active", true)
        .order("display_name"),
      supabase
        .from("ip_tickets")
        .select(
          "id,ticket_number,admission_at,discharge_at,room,bed,status,doctors(display_name)",
        )
        .eq("patient_id", id)
        .order("admission_at", { ascending: false })
        .limit(30),
      supabase
        .from("patient_reports")
        .select("id,report_name,report_date,status,report_categories(name)")
        .eq("patient_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (patientResult.error || !patientResult.data) notFound();
  const patient = patientResult.data;
  const sourceVisits = (visitsResult.data ?? []) as unknown as VisitRow[];
  const { data: financialRows } = canFinance && sourceVisits.length ? await supabase.rpc("get_visit_financial_summaries", { p_visit_ids: sourceVisits.map((visit) => visit.id) }) : { data: [] };
  const financeByVisit = new Map(((financialRows ?? []) as Array<{ visit_id: string; fee_paise: number }>).map((row) => [row.visit_id, row.fee_paise]));
  const visits = sourceVisits.map((visit) => ({ ...visit, fee_paise: financeByVisit.get(visit.id) ?? 0, visit_payments: visit.visit_payments ?? [] }));
  const age = patient.dob ? calculateAge(patient.dob) : null;
  const doctors = ((doctorsResult.data ?? []) as unknown as DoctorRow[]).map(
    (doctor) => ({
      id: doctor.id,
      displayName: doctor.display_name,
      department: doctor.departments?.name ?? "—",
      opFeePaise: doctor.op_fee_paise,
      followUpFeePaise: doctor.follow_up_fee_paise,
    }),
  );
  return (
    <div>
      <PageHeader
        title={patient.name}
        description={`Patient ID: ${patient.phone_normalized}`}
        actions={
          <>
            {hasPermission(profile.role, "createPatient") ? <EditPatientDialog patient={{ id: patient.id, name: patient.name, phone: patient.phone_normalized, dob: patient.dob, gender: patient.gender, bloodGroup: patient.blood_group, address: patient.address, allergies: patient.allergies, status: patient.status }} /> : null}
            {hasPermission(profile.role, "createVisit") ? (
              <CreateVisitDialog
                patientId={patient.id}
                patientName={patient.name}
                doctors={doctors}
                previousVisits={visits.map((visit) => ({
                  id: visit.id,
                  label: `${formatHospitalDate(visit.visit_date)} · Token ${visit.token_number} · ${visit.doctors?.display_name ?? "Doctor"}`,
                }))}
              />
            ) : null}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">
          {age === null ? "Age not recorded" : `${age} years`} ·{" "}
          {patient.gender}
        </Badge>
        {patient.blood_group ? (
          <Badge variant="outline">Blood group {patient.blood_group}</Badge>
        ) : null}
        {patient.allergies ? (
          <Badge variant="destructive">Allergies: {patient.allergies}</Badge>
        ) : null}
      </div>
      <Tabs defaultValue="visits">
        <TabsList>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="ip">IP Admissions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {canFinance ? (
            <TabsTrigger value="payments">Payments</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="visits">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Diagnosis</TableHead>
                      {canFinance ? (
                        <>
                          <TableHead>Fee</TableHead>
                          <TableHead>Collected</TableHead>
                          <TableHead>Balance</TableHead>
                        </>
                      ) : null}
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.length ? (
                      visits.map((visit) => {
                        const money = paymentSummary(
                          visit.fee_paise,
                          visit.visit_payments?.map((p) => p.amount_paise) ??
                            [],
                        );
                        return (
                          <TableRow key={visit.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatHospitalDate(visit.visit_date)}
                            </TableCell>
                            <TableCell>#{visit.token_number}</TableCell>
                            <TableCell>
                              {visit.doctors?.display_name ?? "—"}
                            </TableCell>
                            <TableCell className="capitalize">
                              {visit.visit_type.replaceAll("_", " ")}
                            </TableCell>
                            <TableCell className="max-w-52 truncate">
                              {visit.consultations?.[0]?.assessment ?? "—"}
                            </TableCell>
                            {canFinance ? (
                              <>
                                <TableCell>
                                  {formatInr(visit.fee_paise)}
                                </TableCell>
                                <TableCell>
                                  {formatInr(money.totalCollectedPaise)}
                                </TableCell>
                                <TableCell>
                                  {formatInr(money.balancePaise)}
                                </TableCell>
                              </>
                            ) : null}
                            <TableCell>
                              <StatusBadge status={visit.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
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
                          colSpan={canFinance ? 10 : 7}
                          className="h-28 text-center text-muted-foreground"
                        >
                          No visits yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ip">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Admission</TableHead>
                    <TableHead>Discharge</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Room/Bed</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((ipResult.data ?? []) as unknown as IpRow[]).map(
                    (ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell>{ticket.ticket_number}</TableCell>
                        <TableCell>
                          {formatHospitalDate(ticket.admission_at)}
                        </TableCell>
                        <TableCell>
                          {ticket.discharge_at
                            ? formatHospitalDate(ticket.discharge_at)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {ticket.doctors?.display_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {ticket.room ?? "—"}/{ticket.bed ?? "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={ticket.status} />
                        </TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" render={<Link href={`/ip/${ticket.id}`} />}>Open</Button></TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Report</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((reportsResult.data ?? []) as unknown as ReportRow[]).map(
                    (report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          {formatHospitalDate(report.report_date)}
                        </TableCell>
                        <TableCell>{report.report_name}</TableCell>
                        <TableCell>
                          {report.report_categories?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={report.status} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" render={<a href={`/api/reports/${report.id}`} target="_blank" rel="noreferrer" />}>
                            <FileText /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {canFinance ? (
          <TabsContent value="payments">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.flatMap((visit) =>
                      visit.visit_payments.map((payment, index) => (
                        <TableRow key={`${visit.id}-${index}`}>
                          <TableCell>
                            {formatHospitalDate(visit.visit_date)}
                          </TableCell>
                          <TableCell>OP Token #{visit.token_number}</TableCell>
                          <TableCell>
                            {formatInr(payment.amount_paise)}
                          </TableCell>
                          <TableCell className="capitalize">{payment.mode.replaceAll("_", " ")}</TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
