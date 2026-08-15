import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { formatPrescriptionNumber } from "@/lib/domain/prescription";
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
  expires_at: string;
  visit_id: string | null;
  ip_ticket_id: string | null;
  token_number: number | null;
  source: string;
  patient_name: string | null;
  patient_phone: string | null;
  doctor_name: string | null;
  consultation_fee_paise: number;
  consultation_balance_paise: number;
  items: Array<{
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
  // Expiry is not swept here: the Supabase pg_cron job
  // "expire-stale-hospital-prescriptions" runs every minute, so doing it per
  // request only added a round-trip and Vercel function time.
  // Read through an RPC: the pharmacy role has no SELECT on public.patients, so
  // an embedded join would silently return null patient names.
  const [rxResult, batchResult] = await Promise.all([
    supabase.rpc("list_pending_prescriptions", {
      p_query: q || null,
      p_limit: 50,
    }),
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
        placeholder="Search token, patient name, phone or RX number"
        ariaLabel="Search pending prescriptions by token, patient or prescription number"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Prescription</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Medicines</TableHead>
                  <TableHead>Pending Qty</TableHead>
                  <TableHead>Consultation Fee</TableHead>
                  <TableHead>Prescribed / Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prescriptions.length ? (
                  prescriptions.map((rx) => {
                    const patient = rx.patient_name;
                    const source = rx.source.toLowerCase();
                    return (
                      <TableRow key={rx.id}>
                        <TableCell className="font-medium tabular-nums">
                          {rx.token_number ? `#${rx.token_number}` : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {patient ?? "—"}
                          {rx.patient_phone ? (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {rx.patient_phone}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatPrescriptionNumber(rx.prescription_number)}
                        </TableCell>
                        <TableCell className="uppercase">{source}</TableCell>
                        <TableCell>{rx.doctor_name ?? "—"}</TableCell>
                        <TableCell>{rx.items.length}</TableCell>
                        <TableCell>
                          {rx.items.reduce(
                            (sum, item) =>
                              sum +
                              item.requested_quantity -
                              item.dispensed_quantity,
                            0,
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {rx.consultation_balance_paise > 0 ? (
                            <>
                              <span className="block font-medium">
                                {formatInr(rx.consultation_balance_paise)}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                to collect
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {rx.consultation_fee_paise > 0
                                ? "Paid"
                                : source === "ip"
                                  ? "On IP ticket"
                                  : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="block whitespace-nowrap">
                            {formatHospitalDate(rx.created_at, true)}
                          </span>
                          <span className="block whitespace-nowrap text-xs text-muted-foreground">
                            Expires {formatHospitalDate(rx.expires_at, true)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={rx.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DispenseDialog
                            key={`${rx.id}:${rx.status}:${rx.items.reduce((sum, item) => sum + item.dispensed_quantity, 0)}`}
                            prescriptionId={rx.id}
                            prescriptionNumber={formatPrescriptionNumber(
                              rx.prescription_number,
                            )}
                            patientName={patient ?? "Patient"}
                            source={source}
                            consultationBalancePaise={
                              rx.consultation_balance_paise
                            }
                            doctorName={rx.doctor_name}
                            items={rx.items.map((item) => ({
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
                      colSpan={11}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q
                        ? "No pending prescription matches that search."
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
