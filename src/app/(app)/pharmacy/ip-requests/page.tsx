import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { FulfillInventoryRequestDialog } from "@/features/ip/fulfill-inventory-request-dialog";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PendingRequest = {
  request_id: string;
  ip_ticket_id: string;
  ticket_number: string;
  patient_name: string;
  item_count: number;
  notes: string | null;
  created_at: string;
};
type RequestItem = {
  id: string;
  requested_name: string;
  requested_quantity: number;
};
type InventoryOption = { id: string; name: string; unit: string | null; selling_price_paise: number; quantity: number };

export default async function IpInventoryRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRoute("/pharmacy");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const [{ data: requestData, error }, { data: inventoryData }] = await Promise.all([
    supabase.rpc("list_pending_ip_inventory_requests", { p_query: q || null, p_limit: 50 }),
    supabase
      .from("inventory_items")
      .select("id,name,unit,selling_price_paise,quantity")
      .eq("active", true)
      .order("name"),
  ]);
  if (error) throw new Error("Pending pharmacy item requests could not be loaded.");
  const requests = (requestData ?? []) as unknown as PendingRequest[];
  const inventory = (inventoryData ?? []) as unknown as InventoryOption[];

  // Line items are fetched per request, not embedded in the summary RPC
  // above (which is one row per request, deliberately kept flat for the
  // list). Small, bounded fan-out -- pending requests are a handful at a time.
  const itemsByRequest = new Map<string, RequestItem[]>();
  if (requests.length) {
    const { data: itemRows } = await supabase
      .from("ip_inventory_request_items")
      .select("id,request_id,requested_name,requested_quantity")
      .in("request_id", requests.map((r) => r.request_id))
      .eq("status", "pending");
    for (const row of (itemRows ?? []) as Array<RequestItem & { request_id: string }>) {
      const list = itemsByRequest.get(row.request_id) ?? [];
      list.push(row);
      itemsByRequest.set(row.request_id, list);
    }
  }

  return (
    <div>
      <PageHeader
        title="IP Item Requests"
        description="Consumables IP staff or doctors have asked for. Fulfilling reduces stock and bills the IP ticket; declining costs nothing."
      />
      <DebouncedSearchInput
        className="mb-4 max-w-md"
        initialValue={q}
        placeholder="Search ticket number or patient name"
        ariaLabel="Search pending IP item requests"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length ? (
                  requests.map((request) => (
                    <TableRow key={request.request_id}>
                      <TableCell className="font-medium">{request.ticket_number}</TableCell>
                      <TableCell>{request.patient_name}</TableCell>
                      <TableCell>{request.item_count}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">
                        {request.notes ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatHospitalDate(request.created_at, true)}
                      </TableCell>
                      <TableCell className="text-right">
                        <FulfillInventoryRequestDialog
                          requestId={request.request_id}
                          patientName={request.patient_name}
                          items={itemsByRequest.get(request.request_id) ?? []}
                          inventory={inventory}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      {q ? "No requests match this search." : "No pending item requests from IP."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
