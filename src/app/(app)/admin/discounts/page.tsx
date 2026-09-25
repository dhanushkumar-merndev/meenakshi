import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import {
  DISCOUNT_REASON_VALUES,
  DISCOUNT_SOURCE_LABELS,
  discountPercentLabel,
  discountReasonLabel,
} from "@/lib/domain/discount";
import { DiscountFilters, VoidDiscountDialog } from "@/features/discounts/discount-register-controls";
import { PAGE_SIZE, TablePagination, pageFromParam } from "@/components/shared/table-pagination";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DiscountRow = {
  id: string;
  created_at: string;
  source: string;
  bill_label: string;
  href: string;
  patient_name: string | null;
  patient_uhid: string | null;
  patient_phone: string | null;
  gross_paise: number;
  amount_paise: number;
  reason: string;
  note: string | null;
  given_by_name: string | null;
  given_by_role: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  can_void: boolean;
  total_count: number;
  total_amount_paise: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function hospitalDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export default async function DiscountRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; source?: string; reason?: string; q?: string; page?: string }>;
}) {
  await requireRoute("/admin/discounts");
  const params = await searchParams;
  const today = new Date();
  const monthStart = new Date(today);
  monthStart.setDate(monthStart.getDate() - 29);
  const from = DATE.test(params.from ?? "") ? params.from! : hospitalDate(monthStart);
  const to = DATE.test(params.to ?? "") ? params.to! : hospitalDate(today);
  const source = ["op", "pharmacy", "ip"].includes(params.source ?? "") ? params.source! : "";
  const reason = (DISCOUNT_REASON_VALUES as readonly string[]).includes(params.reason ?? "") ? params.reason! : "";
  const q = params.q?.trim() ?? "";
  const page = pageFromParam(params.page);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_discounts", {
    p_from: from,
    p_to: to,
    p_source: source || null,
    p_reason: reason || null,
    p_query: q || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const invalidRange = Boolean(error?.message.includes("invalid date range"));
  if (error && !invalidRange) throw new Error("Discounts could not be loaded.");
  const rows = (data ?? []) as unknown as DiscountRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  const totalAmount = Number(rows[0]?.total_amount_paise ?? 0);

  return (
    <div>
      <PageHeader
        title="Discount Register"
        description="Every discount given at the OP, IP and pharmacy desks, with its reason and who gave it"
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <DiscountFilters from={from} to={to} source={source} reason={reason} />
        <DebouncedSearchInput
          className="w-full lg:max-w-xs"
          initialValue={q}
          placeholder="Patient, phone, UHID or staff"
          ariaLabel="Search discounts"
        />
      </div>
      <section className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Discounts in range (excluding voided)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatInr(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {new Intl.NumberFormat("en-IN").format(total)}
            </p>
          </CardContent>
        </Card>
      </section>
      {invalidRange ? (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Choose a range where From is before To and no longer than a year.
        </p>
      ) : null}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead className="text-right">Bill amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Given by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatHospitalDate(row.created_at, true)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{row.patient_name ?? "Unidentified emergency"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.patient_uhid ?? row.patient_phone ?? ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link className="underline-offset-4 hover:underline" href={row.href}>
                          {row.bill_label}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {DISCOUNT_SOURCE_LABELS[row.source] ?? row.source}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatInr(row.gross_paise)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInr(row.amount_paise)}
                        <span className="block text-xs text-muted-foreground">
                          {discountPercentLabel(row.amount_paise, row.gross_paise)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-56">
                        {discountReasonLabel(row.reason)}
                        {row.note ? <span className="block truncate text-xs text-muted-foreground">{row.note}</span> : null}
                      </TableCell>
                      <TableCell>
                        {row.given_by_name ?? "—"}
                        <span className="block text-xs capitalize text-muted-foreground">{row.given_by_role ?? ""}</span>
                      </TableCell>
                      <TableCell>
                        {row.voided_at ? (
                          <Badge variant="outline" title={row.void_reason ?? undefined}>
                            Voided{row.voided_by_name ? ` by ${row.voided_by_name}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Applied</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.can_void ? (
                          <VoidDiscountDialog
                            discountId={row.id}
                            amountPaise={row.amount_paise}
                            patientName={row.patient_name ?? "this patient"}
                          />
                        ) : (
                          <Button size="sm" variant="ghost" render={<Link href={row.href} />}>
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      No discounts match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            total={total}
            noun="discounts"
            size={PAGE_SIZE}
            params={{ from, to, source, reason, q }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
