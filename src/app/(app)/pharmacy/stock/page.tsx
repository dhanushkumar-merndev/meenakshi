import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";
import { stockStatus } from "@/lib/domain/stock";
import { PageHeader } from "@/components/shared/page-header";
import { TablePager } from "@/components/shared/table-pager";
import { BatchDialog } from "@/features/pharmacy/medicine-dialogs";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type Batch = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  selling_price_paise: number;
  low_stock_threshold: number;
  purchase_price_paise: number | null;
  active: boolean;
  medicine_id: string;
  medicine_directory: {
    brand_name: string;
    generic_name: string | null;
    strength: string | null;
  } | null;
};
export default async function StockPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRoute("/pharmacy");
  const page = Math.max(1, Number((await searchParams).page) || 1); const size = 50;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("list_pharmacy_batches", { p_limit: size, p_offset: (page - 1) * size });
  const source = (data ?? []) as unknown as Array<Omit<Batch, "medicine_directory"> & { brand_name: string; generic_name: string | null; strength: string | null; total_count: number }>;
  const rows = source.map((row) => ({ ...row, medicine_directory: { brand_name: row.brand_name, generic_name: row.generic_name, strength: row.strength } })); const total = Number(source[0]?.total_count ?? 0);
  return (
    <div>
      <PageHeader
        title="Medicine Stock"
        description="Batch-level quantities, FEFO expiry order, and stock alerts"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Generic</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">
                        {batch.medicine_directory?.brand_name}
                      </TableCell>
                      <TableCell>
                        {batch.medicine_directory?.generic_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right"><BatchDialog medicines={[{ id: batch.medicine_id, name: batch.medicine_directory?.brand_name ?? "Medicine" }]} item={{ id: batch.id, medicineId: batch.medicine_id, batchNumber: batch.batch_number, expiryDate: batch.expiry_date, purchasePrice: ((batch.purchase_price_paise ?? 0) / 100).toFixed(2), sellingPrice: (batch.selling_price_paise / 100).toFixed(2), lowStockThreshold: batch.low_stock_threshold, active: batch.active }} /></TableCell>
                      <TableCell>{batch.batch_number}</TableCell>
                      <TableCell>{batch.expiry_date}</TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>
                        {formatInr(batch.selling_price_paise)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={stockStatus(
                            batch.quantity,
                            batch.low_stock_threshold,
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No stock batches. Add or import medicines first.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div><TablePager page={page} pages={Math.max(1, Math.ceil(total / size))} total={total} />
        </CardContent>
      </Card>
    </div>
  );
}
