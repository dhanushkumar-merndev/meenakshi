import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, formatHospitalDate } from "@/lib/domain/date";
import { formatPrescriptionNumber } from "@/lib/domain/prescription";
import { formatInr } from "@/lib/domain/money";
import { PrintButton } from "@/components/shared/print-button";
import { HospitalLogo } from "@/components/shared/hospital-logo";

type Rx = {
  created_at: string;
  patients: {
    name: string;
    phone_normalized: string;
    dob: string | null;
    gender: string;
  } | null;
  doctors: {
    display_name: string;
    qualification: string | null;
    registration_number: string | null;
    specialization: string | null;
  } | null;
  departments: { name: string } | null;
  vitals: Array<{
    weight_kg: number | null;
    temperature_c: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
  }>;
  consultations: Array<{
    symptoms: string | null;
    history: string | null;
    examination: string | null;
    assessment: string | null;
    advice: string | null;
  }>;
  test_orders: Array<{
    test_name: string;
    notes: string | null;
    created_at: string;
  }>;
  prescriptions: Array<{
    prescription_number: number;
    prescription_items: Array<{
      medicine_name: string;
      dose: string | null;
      frequency: string | null;
      duration: string | null;
      route: string | null;
      notes: string | null;
    }>;
  }>;
};
export default async function PrescriptionPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("visits")
    .select(
      "created_at,patients(name,phone_normalized,dob,gender),doctors(display_name,qualification,registration_number,specialization),departments(name),vitals(weight_kg,temperature_c,bp_systolic,bp_diastolic),consultations(symptoms,history,examination,assessment,advice),test_orders(test_name,notes,created_at),prescriptions(prescription_number,prescription_items(medicine_name,dose,frequency,duration,route,notes))",
    )
    .eq("id", id)
    .eq("status", "completed")
    .single();
  if (error || !data) notFound();
  // Money is kept off the prescription unless the hospital explicitly opts in
  // (AGENTS.md 24). The fee itself lives on visits, which is column-restricted,
  // so it is read through the finance RPC only when the setting is on.
  const { data: printSettings } = await supabase
    .from("hospital_settings")
    .select("print_fee_on_prescription")
    .eq("id", true)
    .single();
  let feePaise: number | null = null;
  if (printSettings?.print_fee_on_prescription) {
    const { data: finance } = await supabase.rpc("get_visit_financial_summaries", { p_visit_ids: [id] });
    const row = (finance ?? [])[0] as { fee_paise?: number } | undefined;
    feePaise = typeof row?.fee_paise === "number" ? row.fee_paise : null;
  }
  const rx = data as unknown as Rx;
  const patient = rx.patients;
  const doctor = rx.doctors;
  if (!patient || !doctor) notFound();
  const v = rx.vitals?.[0];
  const c = rx.consultations?.[0];
  const medicines = rx.prescriptions?.[0]?.prescription_items ?? [];
  const prescriptionNumber = rx.prescriptions?.[0]?.prescription_number;
  return (
    <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-4 text-[11px] text-black sm:p-8">
      <div data-print-hidden className="mb-4 flex justify-end">
        <PrintButton label="Print Prescription" />
      </div>
      <article className="min-h-[270mm] border border-black/20 p-7">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold">{doctor.display_name}</h1>
            <p>{doctor.qualification}</p>
            <p>{doctor.specialization ?? rx.departments?.name}</p>
            <p>Registration: {doctor.registration_number ?? "—"}</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <h2 className="text-xl font-bold text-primary">
                Meenakshi Hospital
              </h2>
              <p>Professional medical care</p>
            </div>
            <HospitalLogo size={56} />
          </div>
        </header>
        <div className="my-4 h-1 bg-primary" />
        <section className="grid grid-cols-2 gap-x-8 gap-y-1 border-b pb-3 sm:grid-cols-4">
          <p>
            <b>Name:</b> {patient.name}
          </p>
          <p>
            <b>Age/Gender:</b> {patient.dob ? calculateAge(patient.dob) : "—"} /{" "}
            {patient.gender}
          </p>
          <p>
            <b>Patient ID:</b> {patient.phone_normalized}
          </p>
          <p>
            <b>Date:</b> {formatHospitalDate(rx.created_at)}
          </p>
          {prescriptionNumber ? (
            <p>
              <b>Prescription No:</b>{" "}
              {formatPrescriptionNumber(prescriptionNumber)}
            </p>
          ) : null}
          <p>
            <b>Weight:</b> {v?.weight_kg ? `${v.weight_kg} kg` : "—"}
          </p>
          <p>
            <b>Temperature:</b>{" "}
            {v?.temperature_c ? `${v.temperature_c} °C` : "—"}
          </p>
          <p>
            <b>BP:</b>{" "}
            {v ? `${v.bp_systolic ?? "—"}/${v.bp_diastolic ?? "—"}` : "—"}
          </p>
        </section>
        <div className="space-y-3 py-4">
          {[
            ["Symptoms", c?.symptoms],
            ["History", c?.history],
            ["Examination", c?.examination],
            ["Assessment", c?.assessment],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <section key={label}>
                <h3 className="font-bold uppercase tracking-wide text-primary">
                  {label}
                </h3>
                <p className="mt-1 whitespace-pre-wrap">{value}</p>
              </section>
            ))}
        </div>
        {rx.test_orders.length ? (
          <section className="mb-4">
            <h3 className="mb-2 font-bold uppercase tracking-wide text-primary">
              Investigations
            </h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border p-2 text-left">Test</th>
                  <th className="border p-2 text-left">Date</th>
                  <th className="border p-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rx.test_orders.map((test, index) => (
                  <tr key={`${test.test_name}-${index}`}>
                    <td className="border p-2">{test.test_name}</td>
                    <td className="border p-2">
                      {formatHospitalDate(test.created_at)}
                    </td>
                    <td className="border p-2">{test.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {medicines.length ? (
          <section>
            <h3 className="mb-2 font-bold uppercase tracking-wide text-primary">
              Rx · Medicines
            </h3>
            <table className="w-full border-collapse">
              <thead className="print:table-header-group">
                <tr>
                  {["Name", "Dose", "Timing", "Duration", "Route", "Notes"].map(
                    (h) => (
                      <th className="border p-2 text-left" key={h}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {medicines.map((item, index) => (
                  <tr
                    className="break-inside-avoid"
                    key={`${item.medicine_name}-${index}`}
                  >
                    <td className="border p-2 font-medium">
                      {item.medicine_name}
                    </td>
                    <td className="border p-2">{item.dose ?? "—"}</td>
                    <td className="border p-2">{item.frequency ?? "—"}</td>
                    <td className="border p-2">{item.duration ?? "—"}</td>
                    <td className="border p-2">{item.route ?? "—"}</td>
                    <td className="border p-2">{item.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {c?.advice ? (
          <section className="mt-4">
            <h3 className="font-bold uppercase tracking-wide text-primary">
              Advice
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{c.advice}</p>
          </section>
        ) : null}
        {feePaise !== null ? (
          <section className="mt-4 border-t pt-2 text-right">
            <p>
              <b>Consultation fee:</b> {formatInr(feePaise)}
            </p>
          </section>
        ) : null}
        <footer className="mt-12 flex justify-between border-t pt-3 text-[10px]">
          <p>Meenakshi Hospital · Digital prescription</p>
          <p className="text-right">
            {doctor.display_name}
            <br />
            {doctor.registration_number}
          </p>
        </footer>
      </article>
    </main>
  );
}
