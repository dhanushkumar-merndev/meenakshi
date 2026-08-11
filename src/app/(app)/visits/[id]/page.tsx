import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, formatHospitalDate } from "@/lib/domain/date";
import { formatInr, paymentSummary } from "@/lib/domain/money";
import { ConsultationEditor } from "@/features/clinical/consultation-editor";
import { VitalsDialog } from "@/features/op/vitals-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  } | null;
  departments: { name: string } | null;
  vitals: Array<{
    weight_kg: number | null;
    height_cm: number | null;
    temperature_c: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    pulse: number | null;
    spo2: number | null;
    respiratory_rate: number | null;
    notes: string | null;
  }>;
  consultations: Array<{
    symptoms: string | null;
    history: string | null;
    examination: string | null;
    assessment: string | null;
    advice: string | null;
    follow_up_type: string;
    follow_up_date: string | null;
    follow_up_days: number | null;
    status: string;
  }>;
  prescriptions: Array<{
    id: string;
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
  }>;
  test_orders: Array<{
    id: string;
    test_name: string;
    notes: string | null;
    status: string;
  }>;
  visit_payments: Array<{
    amount_paise: number;
    mode: string;
    created_at: string;
  }>;
};
export default async function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRoute("/visits");
  const finance = hasPermission(profile.role, "viewVisitFinance");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("visits")
    .select(`id,token_number,created_at,visit_date,visit_type,status,patient_id,doctor_id,patients(name,phone_normalized,dob,gender,allergies,blood_group),doctors(display_name,qualification,registration_number),departments(name),vitals(weight_kg,height_cm,temperature_c,bp_systolic,bp_diastolic,pulse,spo2,respiratory_rate,notes),consultations(symptoms,history,examination,assessment,advice,follow_up_type,follow_up_date,follow_up_days,status),prescriptions(id,status,prescription_items(medicine_id,medicine_name,dose,frequency,duration,route,notes,requested_quantity)),test_orders(id,test_name,notes,status)${finance ? ",visit_payments(amount_paise,mode,created_at)" : ""}`)
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const visit = data as unknown as VisitDetail;
  const { data: financialRows } = finance ? await supabase.rpc("get_visit_financial_summaries", { p_visit_ids: [id] }) : { data: [] };
  visit.fee_paise = Number((financialRows?.[0] as { fee_paise?: number } | undefined)?.fee_paise ?? 0);
  visit.visit_payments = visit.visit_payments ?? [];
  const patient = visit.patients;
  if (!patient) notFound();
  const vitals = visit.vitals?.[0];
  const consultation = visit.consultations?.[0];
  const prescription = visit.prescriptions?.[0];
  const money = paymentSummary(
    visit.fee_paise,
    visit.visit_payments?.map((p) => p.amount_paise) ?? [],
  );
  const canEditClinical =
    hasPermission(profile.role, "writeConsultation") &&
    (profile.role === "admin" || profile.doctorId === visit.doctor_id) &&
    visit.status !== "completed";
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
  return (
    <div>
      <PageHeader
        title={`Token #${visit.token_number} · ${patient.name}`}
        description={`${formatHospitalDate(visit.created_at, true)} · Patient ID ${patient.phone_normalized}`}
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href={`/print/token/${visit.id}`} />}
            >
              <Printer /> Token
            </Button>
            {visit.status === "completed" ? (
              <Button
                render={<Link href={`/print/prescription/${visit.id}`} />}
              >
                <Printer /> Prescription
              </Button>
            ) : null}
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
        {patient.allergies ? (
          <Badge variant="destructive">Allergies: {patient.allergies}</Badge>
        ) : null}
      </div>
      {finance ? (
        <Card className="mb-4">
          <CardContent className="grid grid-cols-3 gap-3 p-4 text-sm">
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
          </CardContent>
        </Card>
      ) : null}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Vitals</CardTitle>
          {hasPermission(profile.role, "recordVitals") &&
          visit.status !== "completed" ? (
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
      {canEditClinical ? (
        <ConsultationEditor
          visitId={visit.id}
          initial={consultation}
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
            notes: item.notes ?? "",
          }))}
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
        </div>
      ) : (
        <Alert>
          <AlertDescription>Waiting for doctor consultation.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
