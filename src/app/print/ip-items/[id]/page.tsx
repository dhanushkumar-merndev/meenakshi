import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { PrintButton } from "@/components/shared/print-button";
import { HospitalLetterhead } from "@/components/shared/hospital-letterhead";
import { getHospitalIdentity } from "@/lib/print/hospital-identity.server";

type Receipt = {
  request_id: string;
  created_at: string;
  fulfilled_at: string;
  ticket_number: string;
  patient_name: string;
  patient_uhid: string | null;
  total_paise: number;
  collected_paise: number;
  payment_mode: string | null;
  payment_reference: string | null;
  fulfilled_by: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit_price_paise: number;
    amount_paise: number;
    source: string;
  }>;
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export default async function IpItemsReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("viewIpInventoryRequest");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_ip_inventory_request_receipt",
    { p_request_id: id },
  );
  const receipt = (Array.isArray(data) ? data[0] : data) as Receipt | undefined;
  if (error || !receipt) notFound();
  const identity = await getHospitalIdentity();
  const balance = Math.max(
    0,
    Number(receipt.total_paise) - Number(receipt.collected_paise),
  );

  return (
    <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-4 text-black sm:p-8">
      <div data-print-hidden className="mb-4 flex justify-end">
        <PrintButton label="Print Bill / Receipt" />
      </div>
      <article className="border border-black/20 p-7 font-sans print:border-0 print:p-0">
        <HospitalLetterhead identity={identity} logoSize={48} />
        <p className="mt-4 border-y border-black py-2 text-center text-sm font-semibold uppercase">
          IP Pharmacy Items Bill / Receipt
        </p>

        <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="font-semibold">Request No</dt>
          <dd className="font-mono">IPR-{receipt.request_id.slice(0, 8).toUpperCase()}</dd>
          <dt className="font-semibold">IP Ticket</dt>
          <dd className="font-mono">{receipt.ticket_number}</dd>
          <dt className="font-semibold">Patient</dt>
          <dd>{receipt.patient_name}</dd>
          <dt className="font-semibold">Patient ID</dt>
          <dd className="font-mono">{receipt.patient_uhid ?? "—"}</dd>
          <dt className="font-semibold">Fulfilled</dt>
          <dd>{formatHospitalDate(receipt.fulfilled_at, true)}</dd>
          <dt className="font-semibold">Dispensed by</dt>
          <dd>{receipt.fulfilled_by ?? "—"}</dd>
        </dl>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1.5 font-semibold">Supplied item</th>
              <th className="py-1.5 font-semibold">Source</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Rate</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(receipt.items ?? []).map((item, index) => (
              <tr className="border-b border-black/20" key={`${item.name}-${index}`}>
                <td className="py-1.5 pr-2">{item.name}</td>
                <td className="py-1.5">{item.source}</td>
                <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatInr(Number(item.unit_price_paise))}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatInr(Number(item.amount_paise))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1.5 border-t border-black pt-3 text-sm">
          <div className="flex justify-between text-base font-bold">
            <dt>Supplied total</dt>
            <dd>{formatInr(Number(receipt.total_paise))}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Collected at pharmacy</dt>
            <dd>{formatInr(Number(receipt.collected_paise))}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Remaining on IP ticket</dt>
            <dd>{formatInr(balance)}</dd>
          </div>
          {receipt.payment_mode ? (
            <div className="flex justify-between text-xs">
              <dt>Payment</dt>
              <dd>
                {MODE_LABELS[receipt.payment_mode] ?? receipt.payment_mode}
                {receipt.payment_reference
                  ? ` · ${receipt.payment_reference}`
                  : ""}
              </dd>
            </div>
          ) : (
            <p className="pt-1 text-xs">
              No counter payment recorded. This amount remains on the IP ticket.
            </p>
          )}
        </dl>
      </article>
    </main>
  );
}
