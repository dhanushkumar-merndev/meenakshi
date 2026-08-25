import Link from "next/link";
import { Printer } from "lucide-react";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { FulfillInventoryRequestDialog } from "@/features/ip/fulfill-inventory-request-dialog";
import type { IpStockOption } from "@/features/ip/stock-match";
import { RecentRequestAutoRefresh } from "@/features/ip/recent-request-auto-refresh";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TablePager } from "@/components/shared/table-pager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PharmacyRequest = {
  request_id: string;
  ip_ticket_id: string;
  ticket_number: string;
  patient_name: string;
  item_count: number;
  notes: string | null;
  status: "pending" | "fulfilled";
  settlement: "ip_ticket" | "pharmacy_counter" | "legacy_ip_payment";
  created_at: string;
  fulfilled_at: string | null;
  total_paise: number;
  collected_paise: number;
  shortfall_count: number;
  total_count: number;
};
type RequestItem = {
  id: string;
  requested_name: string;
  requested_quantity: number;
};

export default async function IpInventoryRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  await requireRoute("/pharmacy");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const tab = params.tab === "completed" ? "completed" : "pending";
  const page = Math.max(1, Number(params.page) || 1);
  const size = 50;
  const supabase = await createSupabaseServerClient();
  const [{ data: requestData, error }, { data: stockData, error: stockError }] =
    await Promise.all([
      supabase.rpc("list_ip_inventory_requests", {
        p_view: tab,
        p_query: q || null,
        p_limit: size,
        p_offset: (page - 1) * size,
      }),
      tab === "pending"
        ? supabase.rpc("search_ip_stock_catalog", {
            p_query: null,
            p_limit: 500,
          })
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (error) throw new Error("Pharmacy item requests could not be loaded.");
  if (stockError) throw new Error("Pharmacy stock options could not be loaded.");

  const requests = (requestData ?? []) as unknown as PharmacyRequest[];
  const stock = ((stockData ?? []) as unknown as IpStockOption[])
    .filter((row) => Number(row.quantity) > 0)
    .map((row) => ({
      ...row,
      selling_price_paise: Number(row.selling_price_paise),
      pack_price_paise:
        row.pack_price_paise === null ? null : Number(row.pack_price_paise),
      units_per_pack: Number(row.units_per_pack),
      quantity: Number(row.quantity),
      price_tiers:
        row.price_tiers?.map((tier) => ({
          quantity: Number(tier.quantity),
          pack_price_paise: Number(tier.pack_price_paise),
          units_per_pack: Number(tier.units_per_pack),
        })) ?? null,
    }));

  const pendingIds = requests
    .filter((request) => request.status === "pending")
    .map((request) => request.request_id);
  const itemsByRequest = new Map<string, RequestItem[]>();
  if (pendingIds.length) {
    const { data: itemRows } = await supabase
      .from("ip_inventory_request_items")
      .select("id,request_id,requested_name,requested_quantity")
      .in("request_id", pendingIds)
      .eq("status", "pending");
    for (const row of (itemRows ?? []) as Array<
      RequestItem & { request_id: string }
    >) {
      const list = itemsByRequest.get(row.request_id) ?? [];
      list.push(row);
      itemsByRequest.set(row.request_id, list);
    }
  }

  const recentExpiryTimes = requests
    .filter((request) => request.status === "fulfilled" && request.fulfilled_at)
    .map((request) => new Date(request.fulfilled_at!).getTime() + 10 * 60_000);
  const count = Number(requests[0]?.total_count ?? 0);

  return (
    <div>
      <RecentRequestAutoRefresh expiryTimes={recentExpiryTimes} />
      <PageHeader
        title="IP Item Requests"
        description="Medicines, inventory items, and manual requests. Each fulfilment is settled either on the IP ticket or at the pharmacy counter — never both."
      />
      <FilterTabs
        ariaLabel="Switch between current and completed IP item requests"
        active={tab}
        param="tab"
        params={{ q }}
        tabs={[
          { label: "Current", value: "pending" },
          { label: "Completed", value: "completed" },
        ]}
      />
      <DebouncedSearchInput
        className="mb-4 max-w-md"
        initialValue={q}
        placeholder="Search ticket number or patient name"
        ariaLabel="Search IP item requests"
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
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Settlement</TableHead>
                  <TableHead>{tab === "completed" ? "Completed" : "Requested"}</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length ? (
                  requests.map((request) => (
                    <TableRow key={request.request_id}>
                      <TableCell className="font-medium">
                        {request.ticket_number}
                      </TableCell>
                      <TableCell>
                        {request.patient_name}
                        {request.notes ? (
                          <span className="block max-w-48 truncate text-xs text-muted-foreground">
                            {request.notes}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{request.item_count}</TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell>{formatInr(Number(request.total_paise))}</TableCell>
                      <TableCell>
                        {request.status === "pending" ? (
                          <>
                            <span className="font-medium">Choose on fulfilment</span>
                            <span className="block text-xs text-muted-foreground">
                              No charge or counter collection yet
                            </span>
                          </>
                        ) : request.settlement === "pharmacy_counter" ? (
                          <><span className="font-medium">Pharmacy collected</span><span className="block text-xs text-muted-foreground">{formatInr(Number(request.collected_paise))}</span></>
                        ) : request.settlement === "legacy_ip_payment" ? (
                          <><span className="font-medium">Legacy IP payment</span><span className="block text-xs text-muted-foreground">{formatInr(Number(request.collected_paise))}</span></>
                        ) : Number(request.total_paise) === 0 ? (
                          <><span className="font-medium">No IP charge</span><span className="block text-xs text-muted-foreground">No amount due on the IP ticket</span></>
                        ) : (
                          <><span className="font-medium">On IP ticket</span><span className="block text-xs text-muted-foreground">Collected with running/final bill</span></>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatHospitalDate(
                          request.fulfilled_at ?? request.created_at,
                          true,
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {request.status === "pending" ? (
                          <FulfillInventoryRequestDialog
                            requestId={request.request_id}
                            patientName={request.patient_name}
                            items={itemsByRequest.get(request.request_id) ?? []}
                            stock={stock}
                          />
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  href={`/print/ip-items/${request.request_id}`}
                                  target="_blank"
                                />
                              }
                            >
                              <Printer /> Bill / Receipt
                            </Button>
                            {Number(request.shortfall_count) > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                render={
                                  <Link
                                    href={`/print/ip-shortage/${request.request_id}`}
                                    target="_blank"
                                  />
                                }
                              >
                                <Printer /> Outside Note
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q
                        ? "No IP item requests match this search."
                        : tab === "completed"
                          ? "No completed IP item requests."
                          : "No current IP item requests."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <TablePager
            page={page}
            pages={Math.max(1, Math.ceil(count / size))}
            total={count}
            params={{ q, tab }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
