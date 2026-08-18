import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Printer } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, formatHospitalDate } from "@/lib/domain/date";
import { formatInr, paymentSummary } from "@/lib/domain/money";
import { formatPrescriptionNumber } from "@/lib/domain/prescription";
import { ConsultationEditor } from "@/features/clinical/consultation-editor";
import { AllergyDialog } from "@/features/patients/allergy-dialog";
import { VitalsDialog } from "@/features/op/vitals-dialog";
import { UploadReportDialog } from "@/features/reports/upload-report-dialog";
import { AdmissionDialog } from "@/features/ip/ip-dialogs";
import { CollectPaymentDialog } from "@/features/visits/collect-payment-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type VisitDetail = {
  id: string;
  token_number: number;
  created_at: string;
  visit_date: string;
  visit_type: string;
  fee_paise: number;
  status: string;
  patient_id: string;
  doctor_id: string;
  patients: {
    name: string;
    uhid: string | null;
    phone_normalized: string;
    dob: string | null;
    gender: string;
    allergies: string | null;
    blood_group: string | null;
  } | null;
  doctors: {
    display_name: string;
    qualification: string | null;
    registration_number: string | null;
    op_fee_paise: number;
    follow_up_fee_paise: number;
  } | null;
  departments: { name: string } | null;
  vitals: {
    weight_kg: number | null;
    height_cm: number | null;
    temperature_c: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    pulse: number | null;
    spo2: number | null;
    respiratory_rate: number | null;
    notes: string | null;
  } | null;
  consultations: {
    symptoms: string | null;
    history: string | null;
    examination: string | null;
    assessment: string | null;
    advice: string | null;
    follow_up_type: string;
    follow_up_date: string | null;
    follow_up_days: number | null;
    status: string;
    admission_recommended: boolean | null;
    admission_ward_type: string | null;
    admission_reason: string | null;
  } | null;
  prescriptions: {
    id: string;
    prescription_number: number;
    status: string;
    prescription_items: Array<{
      medicine_id: string | null;
      medicine_name: string;
      dose: string | null;
      frequency: string | null;
      duration: string | null;
      route: string | null;
      notes: string | null;
      requested_quantity: number;
    }>;
  } | null;
  test_orders: Array<{
    id: string;
    test_name: string;
    category: string | null;
    notes: string | null;
    status: string;
  }>;
  visit_payments: Array<{
    amount_paise: number;
    mode: string;
    created_at: string;
  }>;
};
type VisitReport = {
  id: string;
  report_name: string;
  report_date: string;
  status: string;
  test_order_id: string | null;
  report_categories: { name: string } | null;
};
export default async function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRoute("/visits");
  const finance = hasPermission(profile.role, "viewVisitFinance");
  // The OP desk sends the patient onward after the consultation -- to the
  // pharmacy when medicines were prescribed, to billing when only the fee is
  // outstanding -- so they see the balance, and nothing else financial.
  const seesBalance = finance || profile.role === "op";
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("visits")
    .select(`id,token_number,created_at,visit_date,visit_type,status,patient_id,doctor_id,patients(name,uhid,phone_normalized,dob,gender,allergies,blood_group),doctors(display_name,qualification,registration_number,op_fee_paise,follow_up_fee_paise),departments(name),vitals(weight_kg,height_cm,temperature_c,bp_systolic,bp_diastolic,pulse,spo2,respiratory_rate,notes),consultations(symptoms,history,examination,assessment,advice,follow_up_type,follow_up_date,follow_up_days,status,admission_recommended,admission_ward_type,admission_reason),prescriptions(id,prescription_number,status,prescription_items(medicine_id,medicine_name,dose,frequency,duration,route,notes,requested_quantity)),test_orders(id,test_name,category,notes,status)${finance ? ",visit_payments(amount_paise,mode,created_at)" : ""}`)
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const visit = data as unknown as VisitDetail;
  const [financialResult, reportsResult, categoriesResult] = await Promise.all([
    seesBalance
      ? supabase.rpc("get_visit_financial_summaries", { p_visit_ids: [id] })
      : Promise.resolve({ data: [] }),
    supabase
      .from("patient_reports")
      .select(
        "id,report_name,report_date,status,test_order_id,report_categories(name)",
      )
      .eq("visit_id", id)
      .order("created_at", { ascending: false }),
    // Doctors need these too: they pick the kind of investigation they are
    // ordering, which is the same list an uploaded report is filed under.
    hasPermission(profile.role, "uploadReport") ||
    hasPermission(profile.role, "writeConsultation")
      ? supabase
          .from("report_categories")
          .select("id,name")
          .eq("active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
  ]);
  const summary = financialResult.data?.[0] as
    | { fee_paise?: number; collected_paise?: number }
    | undefined;
  const patientReports = (reportsResult.data ?? []) as unknown as VisitReport[];
  visit.fee_paise = Number(summary?.fee_paise ?? 0);
  visit.visit_payments = visit.visit_payments ?? [];
  const patient = visit.patients;
  if (!patient) notFound();
  const vitals = visit.vitals;
  const consultation = visit.consultations;
  const consultationCompleted = consultation?.status === "completed";
  const prescription = visit.prescriptions;
  // Collected comes from the summary RPC, not the payment rows: OP staff have
  // no read access to visit_payments, only to the totals.
  const money = paymentSummary(visit.fee_paise, [
    Number(summary?.collected_paise ?? 0),
  ]);
  // visits.fee_paise is column-revoked from authenticated, so the doctor cannot
  // read it back. Prefill from their own configured fee; they can override it.
  const configuredFeePaise =
    visit.visit_type === "follow_up"
      ? visit.doctors?.follow_up_fee_paise
      : visit.doctors?.op_fee_paise;
  const defaultFeeRupees =
    typeof configuredFeePaise === "number"
      ? (configuredFeePaise / 100).toFixed(2)
      : undefined;
  const canEditClinical =
    hasPermission(profile.role, "writeConsultation") &&
    (profile.role === "admin" || profile.doctorId === visit.doctor_id) &&
    visit.status !== "completed" &&
    !consultationCompleted;
  const initialVitals = vitals
    ? {
        weight: vitals.weight_kg,
        height: vitals.height_cm,
        temperature: vitals.temperature_c,
        systolic: vitals.bp_systolic,
        diastolic: vitals.bp_diastolic,
        pulse: vitals.pulse,
        spo2: vitals.spo2,
        respiratoryRate: vitals.respiratory_rate,
        notes: vitals.notes,
      }
    : undefined;
  const canConvertToIp=(profile.role==="doctor"||profile.role==="admin")&&(profile.role==="admin"||profile.doctorId===visit.doctor_id);
  const canRecordAllergies = ["admin", "doctor", "reception", "ip", "op"].includes(profile.role);
  const testCategories = ((categoriesResult.data ?? []) as Array<{ name: string }>)
    .map((row) => row.name);
  // These three are independent of each other; running them in one Promise.all
  // removes a round-trip from the critical path.
  const [{data:availableRooms},{data:existingAdmission},occupiedResult]=canConvertToIp?await Promise.all([supabase.from("room_beds").select("id,room_number,bed_number,floor").eq("active",true).order("floor").order("room_number"),supabase.from("ip_tickets").select("id").eq("source_visit_id",visit.id).in("status",["admitted","discharge_pending"]).maybeSingle(),supabase.from("ip_tickets").select("room_bed_id").in("status",["admitted","discharge_pending"]).not("room_bed_id","is",null)]):[{data:[]},{data:null},{data:[]}];
  const occupiedBeds=new Set((occupiedResult.data??[]).map(row=>row.room_bed_id));
  return (
    <div>
      <PageHeader
        title={`Token #${visit.token_number} · ${patient.name}`}
        description={`${formatHospitalDate(visit.created_at, true)} · Patient ID ${patient.uhid ?? "—"} · ${patient.phone_normalized}`}
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href={`/print/token/${visit.id}`} />}
            >
              <Printer /> Token
            </Button>
            {prescription?.id ? (
              <Button
                render={<Link href={`/print/prescription/${prescription.id}`} />}
              >
                <Printer /> Prescription
              </Button>
            ) : null}
            {canConvertToIp&&!existingAdmission?<AdmissionDialog triggerLabel="Convert to IP" doctors={[{id:visit.doctor_id,label:visit.doctors?.display_name??"Doctor"}]} rooms={(availableRooms??[]).filter(room=>!occupiedBeds.has(room.id)).map(room=>({id:room.id,label:`Floor ${room.floor} · Room ${room.room_number} · Bed ${room.bed_number}`}))} initialPatient={{id:visit.patient_id,label:`${patient.name} · ${patient.phone_normalized}`}} initialDoctorId={visit.doctor_id} sourceVisitId={visit.id}/>:null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={visit.status} />
        <Badge variant="secondary">
          {patient.dob ? `${calculateAge(patient.dob)} years` : "Age —"} ·{" "}
          {patient.gender}
        </Badge>
        <Badge variant="outline">{visit.doctors?.display_name}</Badge>
        {prescription ? (
          <Badge variant="outline" className="font-mono">
            {formatPrescriptionNumber(prescription.prescription_number)}
          </Badge>
        ) : null}
        {patient.allergies ? (
          <Badge variant="destructive">Allergies: {patient.allergies}</Badge>
        ) : null}
        {/* The doctor is usually the one who finds out about an allergy, so it
            is recorded here rather than only from Edit Patient. */}
        {canRecordAllergies ? (
          <AllergyDialog
            patientId={visit.patient_id}
            patientName={patient.name}
            allergies={patient.allergies}
            triggerLabel="Add allergies"
          />
        ) : null}
      </div>
      {finance ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-muted-foreground">Visit fee</p>
                <p className="font-semibold">{formatInr(visit.fee_paise)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Collected</p>
                <p className="font-semibold">
                  {formatInr(money.totalCollectedPaise)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Balance</p>
                <p className="font-semibold">{formatInr(money.balancePaise)}</p>
              </div>
            </div>
            {money.balancePaise > 0 ? (
              <CollectPaymentDialog
                visitId={visit.id}
                patientId={visit.patient_id}
                balancePaise={money.balancePaise}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : seesBalance ? (
        <Alert className="mb-4" variant={money.balancePaise > 0 ? "destructive" : "default"}>
          <AlertTitle>
            {money.balancePaise > 0
              ? `Pending balance ${formatInr(money.balancePaise)}`
              : "No pending balance"}
          </AlertTitle>
          <AlertDescription>
            {money.balancePaise > 0
              ? prescription
                ? "Send the patient to the pharmacy counter: the medicines and this fee are collected together."
                : "No medicines were prescribed — send the patient to the billing counter to settle this."
              : "Nothing to collect for this visit."}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Vitals</CardTitle>
          {hasPermission(profile.role, "recordVitals") &&
          visit.status !== "completed" &&
          !consultationCompleted ? (
            <VitalsDialog
              visitId={visit.id}
              patientName={patient.name}
              initialVitals={initialVitals}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {vitals ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
              {[
                ["Weight", vitals.weight_kg ? `${vitals.weight_kg} kg` : "—"],
                ["Height", vitals.height_cm ? `${vitals.height_cm} cm` : "—"],
                [
                  "Temperature",
                  vitals.temperature_c ? `${vitals.temperature_c} °C` : "—",
                ],
                [
                  "BP",
                  `${vitals.bp_systolic ?? "—"}/${vitals.bp_diastolic ?? "—"}`,
                ],
                ["Pulse", vitals.pulse ?? "—"],
                ["SpO₂", vitals.spo2 ? `${vitals.spo2}%` : "—"],
                ["Resp. rate", vitals.respiratory_rate ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Vitals not recorded.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Investigations & Reports</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {visit.test_orders.length} ordered · {patientReports.length} uploaded
            </p>
          </div>
          {hasPermission(profile.role, "uploadReport") ? (
            <UploadReportDialog
              categories={categoriesResult.data ?? []}
              testOrders={visit.test_orders.map((item) => ({
                id: item.id,
                patientId: visit.patient_id,
                patientLabel: `${patient.name} · ${patient.phone_normalized}`,
                visitId: visit.id,
                ipTicketId: null,
                label: item.test_name,
              }))}
              initialPatient={{
                id: visit.patient_id,
                label: `${patient.name} · ${patient.phone_normalized}`,
              }}
              initialVisitId={visit.id}
              lockPatient
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          {/* What the doctor ordered, whether or not a file has come back yet.
              Without this the tests were invisible until someone uploaded a
              result, so nobody could tell what was still awaited. */}
          {visit.test_orders.length ? (
            <div className="overflow-x-auto border-b">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investigation ordered</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visit.test_orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.test_name}</TableCell>
                      <TableCell>{order.category || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {order.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientReports.length ? (
                  patientReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.report_name}
                      </TableCell>
                      <TableCell>
                        {report.report_categories?.name ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatHospitalDate(report.report_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={report.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          render={
                            <a
                              href={`/api/reports/${report.id}`}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          <FileText /> Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No reports uploaded for this visit yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {canEditClinical ? (
        <ConsultationEditor
          visitId={visit.id}
          initial={consultation ?? undefined}
          initialMedicines={(prescription?.prescription_items ?? []).map(
            (item) => ({
              medicine_id: item.medicine_id ?? undefined,
              medicine_name: item.medicine_name,
              dose: item.dose ?? "",
              frequency: item.frequency ?? "",
              duration: item.duration ?? "",
              route: item.route ?? "",
              notes: item.notes ?? "",
              quantity: item.requested_quantity,
            }),
          )}
          initialTests={(visit.test_orders ?? []).map((item) => ({
            test_name: item.test_name,
            category: item.category ?? "",
            notes: item.notes ?? "",
          }))}
          testCategories={testCategories}
          defaultFee={defaultFeeRupees}
        />
      ) : consultation ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Completed consultation</AlertTitle>
            <AlertDescription>
              This record is read-only. Use the prescription print action for a
              formatted copy.
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
              {[
                ["Symptoms", consultation.symptoms],
                ["History", consultation.history],
                ["Examination", consultation.examination],
                ["Assessment", consultation.assessment],
                ["Advice", consultation.advice],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <section key={label}>
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {value}
                    </p>
                  </section>
                ))}
            </CardContent>
          </Card>
          {/* The prescription and the investigations are the two things staff
              look up after a consultation closes; the clinical notes above are
              no use to the pharmacy or the desk on their own. */}
          {prescription?.prescription_items?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Prescription{" "}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    {formatPrescriptionNumber(prescription.prescription_number)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Dose</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prescription.prescription_items.map((item, index) => (
                        <TableRow key={`${item.medicine_name}-${index}`}>
                          <TableCell className="font-medium">
                            {item.medicine_name}
                          </TableCell>
                          <TableCell>{item.dose || "—"}</TableCell>
                          <TableCell>{item.frequency || "—"}</TableCell>
                          <TableCell>{item.duration || "—"}</TableCell>
                          <TableCell>{item.route || "—"}</TableCell>
                          <TableCell>{item.notes || "—"}</TableCell>
                          <TableCell className="tabular-nums">
                            {item.requested_quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Alert>
          <AlertDescription>Waiting for doctor consultation.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
