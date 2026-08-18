import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { PrintButton } from "@/components/shared/print-button";
import { HospitalLetterhead } from "@/components/shared/hospital-letterhead";
import { getHospitalIdentity } from "@/lib/print/hospital-identity.server";

type Request = {
  id: string;
  created_at: string;
  status: string;
  ip_tickets: {
    ticket_number: string;
    patients: { name: string; uhid: string } | null;
  } | null;
  ip_inventory_request_items: Array<{
    requested_name: string;
    requested_quantity: number;
    fulfilled_quantity: number;
    status: string;
  }>;
};

/**
 * What pharmacy could not supply from an IP item request -- so the family
 * has something in hand to buy it from an outside pharmacy. Covers both a
 * line marked fully unavailable and the unmet balance of a partially
 * fulfilled line (requested 10, only 4 in stock -> note the other 6).
 * Nothing owed for these; the hospital never billed for what it didn't give.
 */
export default async function IpShortagePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("viewIpInventoryRequest");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ip_inventory_requests")
    .select(
      "id,created_at,status,ip_tickets(ticket_number,patients(name,uhid)),ip_inventory_request_items(requested_name,requested_quantity,fulfilled_quantity,status)",
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const request = data as unknown as Request;
  const identity = await getHospitalIdentity();

  const shortfalls = request.ip_inventory_request_items
    .map((item) => ({ ...item, shortfall: item.requested_quantity - item.fulfilled_quantity }))
    .filter((item) => item.shortfall > 0);

  return (
    <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-4 text-black sm:p-8">
      <div data-print-hidden className="mb-4 flex justify-end">
        <PrintButton label="Print Shortage Note" />
      </div>
      <article className="mx-auto max-w-md border border-black p-6 font-sans">
        <HospitalLetterhead identity={identity} logoSize={48} />
        <p className="mt-4 border-y border-black py-2 text-center text-sm font-semibold uppercase">
          Items Not Available In-House
        </p>

        <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="font-semibold">Ticket</dt>
          <dd className="font-mono">{request.ip_tickets?.ticket_number ?? "—"}</dd>
          <dt className="font-semibold">Patient</dt>
          <dd>{request.ip_tickets?.patients?.name ?? "Unidentified emergency"}</dd>
          <dt className="font-semibold">Patient ID</dt>
          <dd className="font-mono">{request.ip_tickets?.patients?.uhid ?? "—"}</dd>
          <dt className="font-semibold">Date</dt>
          <dd>{formatHospitalDate(request.created_at, true)}</dd>
        </dl>

        {request.status !== "fulfilled" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            This request has not been fulfilled yet; nothing to note.
          </p>
        ) : shortfalls.length ? (
          <>
            <table className="mt-5 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1.5 font-semibold">Item</th>
                  <th className="py-1.5 text-right font-semibold">
                    Please arrange
                  </th>
                </tr>
              </thead>
              <tbody>
                {shortfalls.map((item, index) => (
                  <tr className="border-b border-black/20" key={`${item.requested_name}-${index}`}>
                    <td className="py-1.5 pr-2">
                      {item.requested_name}
                      {item.fulfilled_quantity > 0 ? (
                        <span className="block text-xs">
                          {item.fulfilled_quantity} of {item.requested_quantity} supplied by the hospital
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{item.shortfall}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 border-t border-dashed border-black pt-3 text-xs">
              These quantities were not billed and are not available in the
              hospital pharmacy. Please purchase them from an outside
              pharmacy and bring them to the ward.
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Every item on this request was fully supplied by the hospital.
          </p>
        )}
      </article>
    </main>
  );
}
