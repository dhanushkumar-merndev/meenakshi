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
  /** Cash taken at the counter, after any discount. */
  collected_paise: number;
  discount_paise: number;
  settlement: "ip_ticket" | "pharmacy_counter" | "legacy_ip_payment";
  payment_mode: string | null;
  payment_reference: string | null;
  fulfilled_by: string | null;
  items: Array<{
    name: string;
    requested_quantity: number;
    supplied_quantity: number;
    not_supplied_quantity: number;
    unit_price_paise: number | null;
    amount_paise: number;
    source: string;
    outcome: string;
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
  await requirePermission("viewIpInventoryReceipt");
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
  const collectedAtCounter = receipt.settlement === "pharmacy_counter";
  const legacyIpPayment = receipt.settlement === "legacy_ip_payment";
  const noIpCharge =
    !collectedAtCounter &&
    !legacyIpPayment &&
    Number(receipt.total_paise) === 0;

  return (
    <main className="mx-auto min-h-screen max-w-[210mm] bg-white py-4 text-black sm:py-8">
      <div data-print-hidden className="mb-4 flex justify-end">
        <PrintButton label="Print Bill / Receipt" />
      </div>
      <article className="border border-black/20 p-[10mm] font-sans print:border-0 print:p-0">
        <HospitalLetterhead identity={identity} logoSize={48} />
        <p className="mt-4 border-y border-black py-2 text-center text-sm font-semibold uppercase">
          {collectedAtCounter
            ? "IP Pharmacy Counter Receipt"
            : noIpCharge
              ? "IP Pharmacy Items Outcome"
              : "IP Pharmacy Items Bill"}
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

        <table className="mt-5 w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[27%]" />
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-black text-left text-xs leading-tight">
              <th className="px-1 py-2 font-semibold">Requested<br />item</th>
              <th className="px-1 py-2 font-semibold">Source</th>
              <th className="px-1 py-2 text-right font-semibold">Requested<br />qty</th>
              <th className="px-1 py-2 text-right font-semibold">Supplied<br />qty</th>
              <th className="px-1 py-2 text-right font-semibold">Not<br />supplied</th>
              <th className="px-1 py-2 text-right font-semibold">Rate</th>
              <th className="px-1 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(receipt.items ?? []).map((item, index) => (
              <tr className="border-b border-black/20" key={`${item.name}-${index}`}>
                <td className="break-words px-1 py-2">{item.name}</td>
                <td className="break-words px-1 py-2"><span>{item.source}</span><span className="block text-xs text-muted-foreground">{item.outcome}</span></td>
                <td className="px-1 py-2 text-right tabular-nums">{item.requested_quantity}</td>
                <td className="px-1 py-2 text-right tabular-nums">{item.supplied_quantity}</td>
                <td className="px-1 py-2 text-right tabular-nums">{item.not_supplied_quantity || "—"}</td>
                <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums">
                  {item.unit_price_paise === null ? "—" : formatInr(Number(item.unit_price_paise))}
                </td>
                <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums">
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
          {collectedAtCounter ? (
            <>
              {Number(receipt.discount_paise ?? 0) > 0 ? (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>−{formatInr(Number(receipt.discount_paise))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt>Collected at pharmacy</dt>
                <dd>{formatInr(Number(receipt.collected_paise))}</dd>
              </div>
              <p className="pt-1 text-xs">Collected at pharmacy — not added to IP bill.</p>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <dt>{noIpCharge ? "IP ticket charge" : "Added to IP ticket"}</dt>
                <dd>{formatInr(Number(receipt.total_paise))}</dd>
              </div>
              {legacyIpPayment ? (
                <div className="flex justify-between">
                  <dt>Historical IP payment</dt>
                  <dd>{formatInr(Number(receipt.collected_paise))}</dd>
                </div>
              ) : null}
              {noIpCharge ? (
                <p className="pt-1 text-xs">
                  No amount is due on the IP ticket for this request.
                </p>
              ) : (
                <div className="flex justify-between">
                  <dt>Remaining on IP ticket</dt>
                  <dd>{formatInr(balance)}</dd>
                </div>
              )}
            </>
          )}
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
          ) : !collectedAtCounter && !noIpCharge ? (
            <p className="pt-1 text-xs">
              No counter payment recorded. This amount remains on the IP ticket.
            </p>
          ) : null}
        </dl>
      </article>
    </main>
  );
}
