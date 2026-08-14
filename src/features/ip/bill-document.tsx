import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { HospitalLogo } from "@/components/shared/hospital-logo";
import type { IpPrintData } from "./print-data";

export function IpBillDocument({
  ticket,
  final = false,
}: {
  ticket: IpPrintData;
  final?: boolean;
}) {
  const total = ticket.ip_charges.reduce(
    (sum, item) => sum + item.amount_paise,
    0,
  );
  const paid = ticket.ip_payments.reduce(
    (sum, item) => sum + item.amount_paise,
    0,
  );

  return (
    <article className="min-h-[270mm] border border-black/20 p-7">
      <header className="flex items-start justify-between border-b-2 border-primary pb-4">
        <div className="flex items-center gap-3">
          <HospitalLogo size={52} />
          <div>
            <h1 className="text-xl font-bold text-primary">Meenakshi Hospital</h1>
            <p>Hospital Management &amp; Patient Care</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold">
            {final ? "FINAL IP BILL" : "IP RUNNING BILL"}
          </h2>
          <p>{ticket.ticket_number}</p>
        </div>
      </header>
      <section className="my-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
        <p>
          <b>Patient:</b>{" "}
          {ticket.patients?.name ?? "Unidentified emergency patient"}
        </p>
        <p>
          <b>Patient ID:</b>{" "}
          {ticket.patients?.phone_normalized ?? "Pending assignment"}
        </p>
        <p><b>Doctor:</b> {ticket.doctors?.display_name}</p>
        <p><b>Room/Bed:</b> {ticket.room ?? "—"}/{ticket.bed ?? "—"}</p>
        <p><b>Admitted:</b> {formatHospitalDate(ticket.admission_at, true)}</p>
        <p>
          <b>Discharged:</b>{" "}
          {ticket.discharge_at
            ? formatHospitalDate(ticket.discharge_at, true)
            : "—"}
        </p>
        <p><b>Status:</b> {ticket.status.replaceAll("_", " ")}</p>
      </section>
      <table className="w-full border-collapse text-xs">
        <thead className="print:table-header-group">
          <tr>
            {["Date/Time", "Category", "Item", "Qty", "Rate", "Amount"].map(
              (label) => (
                <th className="border p-2 text-left" key={label}>{label}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {ticket.ip_charges.map((charge) => (
            <tr className="break-inside-avoid" key={charge.id}>
              <td className="border p-2">{formatHospitalDate(charge.created_at, true)}</td>
              <td className="border p-2 capitalize">{charge.category}</td>
              <td className="border p-2">{charge.item}</td>
              <td className="border p-2">{charge.quantity}</td>
              <td className="border p-2">{formatInr(charge.rate_paise)}</td>
              <td className="border p-2">{formatInr(charge.amount_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="ml-auto mt-5 w-full max-w-sm space-y-2 text-sm">
        <div className="flex justify-between"><b>Total</b><b>{formatInr(total)}</b></div>
        <div className="flex justify-between"><span>Collected</span><span>{formatInr(paid)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base">
          <b>Balance</b><b>{formatInr(Math.max(0, total - paid))}</b>
        </div>
      </section>
      {ticket.ip_payments.length ? (
        <section className="mt-6">
          <h3 className="mb-2 font-bold">PAYMENT HISTORY</h3>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="border p-2 text-left">Date/Time</th>
                <th className="border p-2 text-left">Amount</th>
                <th className="border p-2 text-left">Mode</th>
                <th className="border p-2 text-left">Reference</th>
              </tr>
            </thead>
            <tbody>
              {ticket.ip_payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="border p-2">{formatHospitalDate(payment.created_at, true)}</td>
                  <td className="border p-2">{formatInr(payment.amount_paise)}</td>
                  <td className="border p-2 capitalize">{payment.mode.replaceAll("_", " ")}</td>
                  <td className="border p-2">{payment.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <footer className="mt-12 flex justify-between border-t pt-3 text-[10px]">
        <p>Computer-generated hospital document</p>
        <p>Meenakshi Hospital</p>
      </footer>
    </article>
  );
}
