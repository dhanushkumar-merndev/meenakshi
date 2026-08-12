import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import {
  formatPrescriptionNumber,
  parsePrescriptionNumber,
} from "@/lib/domain/prescription";
import { DispenseDialog } from "@/features/pharmacy/dispense-dialog";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { PageHeader } from "@/components/shared/page-header";
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

type Rx = {
  id: string;
  prescription_number: number;
  status: string;
  created_at: string;
  visit_id: string | null;
  ip_ticket_id: string | null;
  doctors: { display_name: string } | null;
  visits: { patients: { name: string } | null } | null;
  ip_tickets: { patients: { name: string } | null } | null;
  prescription_items: Array<{
    id: string;
    medicine_id: string | null;
    medicine_name: string;
    requested_quantity: number;
    dispensed_quantity: number;
  }>;
};
type Batch = {
  id: string;
  medicine_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  selling_price_paise: number;
};
export default async function PharmacyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRoute("/pharmacy");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("expire_stale_prescriptions");
  let prescriptionQuery = supabase
    .from("prescriptions")
    .select(
      "id,prescription_number,status,created_at,visit_id,ip_ticket_id,doctors(display_name),visits(patients(name)),ip_tickets(patients(name)),prescription_items(id,medicine_id,medicine_name,requested_quantity,dispensed_quantity)",
    )
    .in("status", ["pending", "partially_dispensed"])
    .order("created_at")
    .limit(50);
  if (q) {
    prescriptionQuery = prescriptionQuery.eq(
      "prescription_number",
      parsePrescriptionNumber(q) ?? -1,
    );
  }
  const [rxResult, batchResult] = await Promise.all([
    prescriptionQuery,
    supabase.rpc("list_available_dispense_batches", { p_limit: 500 }),
  ]);
  if (rxResult.error) {
    throw new Error("Pending prescriptions could not be loaded.");
  }
  if (batchResult.error) {
    throw new Error("Available medicine batches could not be loaded.");
  }
  const prescriptions = (rxResult.data ?? []) as unknown as Rx[];
  const batches = ((batchResult.data ?? []) as unknown as Batch[]).map((b) => ({
    id: b.id,
    medicineId: b.medicine_id,
    batchNumber: b.batch_number,
    expiry: b.expiry_date,
    quantity: b.quantity,
    pricePaise: b.selling_price_paise,
  }));
  return (
    <div>
      <PageHeader
        title="Pending Prescriptions"
        description="Full dispensing completes the prescription; partial quantities remain pending; unused prescriptions expire after 24 hours"
      />
      <DebouncedSearchInput
        className="mb-4 max-w-md"
        initialValue={q}
        placeholder="Search prescription number (for example RX-000123)"
        ariaLabel="Search pending prescriptions by prescription number"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Medicines</TableHead>
                  <TableHead>Pending Qty</TableHead>
                  <TableHead>Prescribed / Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions.length ? (
                  prescriptions.map((rx) => {
                    const patient = rx.visit_id
                      ? rx.visits?.patients?.name
                      : rx.ip_tickets?.patients?.name;
                    const source = rx.ip_ticket_id ? "ip" : "op";
                    return (
                      <TableRow key={rx.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          {formatPrescriptionNumber(rx.prescription_number)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {patient ?? "—"}
                        </TableCell>
                        <TableCell className="uppercase">{source}</TableCell>
                        <TableCell>{rx.doctors?.display_name ?? "—"}</TableCell>
                        <TableCell>{rx.prescription_items.length}</TableCell>
                        <TableCell>
                          {rx.prescription_items.reduce(
                            (sum, item) =>
                              sum +
                              item.requested_quantity -
                              item.dispensed_quantity,
                            0,
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="block whitespace-nowrap">
                            {formatHospitalDate(rx.created_at, true)}
                          </span>
                          <span className="block whitespace-nowrap text-xs text-muted-foreground">
                            Expires {formatHospitalDate(
                              new Date(
                                new Date(rx.created_at).getTime() +
                                  24 * 60 * 60 * 1000,
                              ).toISOString(),
                              true,
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={rx.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DispenseDialog
                            key={`${rx.id}:${rx.status}:${rx.prescription_items.reduce((sum, item) => sum + item.dispensed_quantity, 0)}`}
                            prescriptionId={rx.id}
                            prescriptionNumber={formatPrescriptionNumber(
                              rx.prescription_number,
                            )}
                            patientName={patient ?? "Patient"}
                            source={source}
                            items={rx.prescription_items.map((item) => ({
                              id: item.id,
                              medicineId: item.medicine_id,
                              name: item.medicine_name,
                              requested: item.requested_quantity,
                              dispensed: item.dispensed_quantity,
                            }))}
                            batches={batches}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q
                        ? "No pending prescription matches that number."
                        : "No prescriptions waiting for dispensing."}
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
