import { calculateAge, formatHospitalDate } from "@/lib/domain/date";
import { HospitalLetterhead } from "@/components/shared/hospital-letterhead";
import type { HospitalIdentity } from "@/lib/print/hospital-identity";
import type { IpPrintData } from "./print-data";

export function DischargeDocument({
  ticket,
  identity,
}: {
  ticket: IpPrintData;
  identity: HospitalIdentity;
}) {
  const sections = [
    ["Admission Reason", ticket.admission_reason],
    ["Final Diagnosis", ticket.final_diagnosis],
    ["Hospital Course", ticket.hospital_course],
    ["Treatment", ticket.treatment_summary],
    ["Discharge Medicines", ticket.discharge_medicines],
    ["Advice", ticket.discharge_advice],
    ["Follow-up", ticket.follow_up],
  ].filter(([, value]) => value);

  return (
    <article className="min-h-[270mm] border border-black/20 p-7">
      {/* Hospital banner first, then the document title and the treating
          doctor's identity block beneath it. */}
      <header className="border-b-2 border-primary pb-3">
        <HospitalLetterhead identity={identity} />
        <div className="mt-3 flex items-start justify-between gap-4 border-t pt-2 text-xs">
          <div>
            <h1 className="text-base font-bold tracking-wide uppercase">
              Discharge Summary
            </h1>
            <p className="font-mono font-bold">{ticket.ticket_number}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{ticket.doctors?.display_name}</p>
            <p>{ticket.doctors?.qualification}</p>
            <p>Registration: {ticket.doctors?.registration_number ?? "—"}</p>
          </div>
        </div>
      </header>
      <section className="my-4 grid grid-cols-2 gap-2 rounded border p-3 text-sm sm:grid-cols-4">
        <p><b>Patient:</b> {ticket.patients?.name}</p>
        <p><b>Patient ID:</b> {ticket.patients?.uhid ?? "—"}</p>
        <p>
          <b>Age/Gender:</b>{" "}
          {ticket.patients?.dob ? calculateAge(ticket.patients.dob) : "—"} /{" "}
          {ticket.patients?.gender}
        </p>
        <p><b>Room/Bed:</b> {ticket.room ?? "—"}/{ticket.bed ?? "—"}</p>
        <p><b>Admission:</b> {formatHospitalDate(ticket.admission_at, true)}</p>
        <p>
          <b>Discharge:</b>{" "}
          {ticket.discharge_at
            ? formatHospitalDate(ticket.discharge_at, true)
            : "Pending"}
        </p>
      </section>
      <div className="space-y-5">
        {sections.map(([title, value]) => (
          <section className="break-inside-avoid" key={title}>
            <h2 className="border-b pb-1 text-sm font-bold tracking-wide text-primary uppercase">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
          </section>
        ))}
      </div>
      <footer className="mt-16 flex justify-between gap-6 border-t pt-4 text-[10px]">
        <div>
          <p className="font-semibold">{identity.name}</p>
          {identity.address ? <p>{identity.address}</p> : null}
          <p>
            {[identity.phone, identity.email].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1">Digital discharge summary issued by {identity.name}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">{ticket.doctors?.display_name}</p>
          <p>{ticket.doctors?.registration_number}</p>
        </div>
      </footer>
    </article>
  );
}
