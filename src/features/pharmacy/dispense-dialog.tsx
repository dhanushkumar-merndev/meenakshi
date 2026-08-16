"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Pill, Printer } from "lucide-react";
import { dispensePrescription } from "./actions";
import { formatInr, packBreakdown } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Item = {
  id: string;
  medicineId: string | null;
  name: string;
  requested: number;
  dispensed: number;
};
type Batch = {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiry: string;
  /** Stock in pieces. */
  quantity: number;
  /** Price of one pack; a single piece is priced pro rata. */
  pricePaise: number;
  /** Pieces in one strip / box / bottle. 1 means it is sold as single pieces. */
  unitsPerPack: number;
};
export function DispenseDialog({
  prescriptionId,
  prescriptionNumber,
  patientName,
  source,
  items,
  batches,
  consultationBalancePaise,
  doctorName,
}: {
  prescriptionId: string;
  prescriptionNumber: string;
  patientName: string;
  source: string;
  items: Item[];
  batches: Batch[];
  /** Outstanding consultation fee the doctor set, collected at this counter. */
  consultationBalancePaise?: number;
  doctorName?: string | null;
}) {
  const [state, action, pending] = useActionState(dispensePrescription, {
    ok: false,
  });
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
  const outstanding = consultationBalancePaise ?? 0;
  const [feeCollected, setFeeCollected] = useState(() =>
    outstanding > 0 ? (outstanding / 100).toFixed(2) : "",
  );
  const [lines, setLines] = useState(() =>
    items.map((item) => {
      const batch = batches
        .filter((b) => b.medicineId === item.medicineId && b.quantity > 0)
        .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
      return {
        itemId: item.id,
        batchId: batch?.id ?? "",
        quantity: Math.min(
          item.requested - item.dispensed,
          batch?.quantity ?? 0,
        ),
      };
    }),
  );
  const payload = useMemo(
    () =>
      lines
        .filter((line) => line.batchId && line.quantity > 0)
        .map((line) => ({
          prescription_item_id: line.itemId,
          batch_id: line.batchId,
          quantity: line.quantity,
        })),
    [lines],
  );
  // The pharmacy counter cannot close an OP prescription while the doctor's
  // consultation fee is still outstanding.
  const feeEntered = Number(feeCollected);
  const feeUnpaid =
    source === "op" &&
    outstanding > 0 &&
    (!feeCollected.trim() || Number.isNaN(feeEntered) || feeEntered <= 0);
  if (state.ok) {
    const completed = state.data?.prescriptionStatus === "dispensed";
    // The receipt is the point of the counter transaction: it covers the
    // medicines and, when it was taken here, the consultation fee.
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled>
          <CheckCircle2 />
          {completed ? "Completed" : "Partially Dispensed"}
        </Button>
        <Button
          size="sm"
          render={<Link href={`/print/receipt/${state.data?.saleId}`} target="_blank" />}
        >
          <Printer /> Receipt
        </Button>
      </div>
    );
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <Pill /> Dispense
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Dispense {prescriptionNumber}</DialogTitle>
            <DialogDescription>
              {patientName} · {source.toUpperCase()} · FEFO batches are
              suggested. Only confirmed quantities reduce stock.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="prescriptionId" value={prescriptionId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />
          <input type="hidden" name="paymentMode" value={mode} />
          {state.message ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead className="min-w-48">
                    Batch / Expiry / Stock
                  </TableHead>
                  <TableHead>Dispense Qty (pieces)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => {
                  const options = batches.filter(
                    (batch) =>
                      batch.medicineId === item.medicineId &&
                      batch.quantity > 0,
                  );
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.requested - item.dispensed}</TableCell>
                      <TableCell>
                        <Select
                          value={lines[index]?.batchId}
                          onValueChange={(value) =>
                            setLines((rows) =>
                              rows.map((line, i) =>
                                i === index
                                  ? { ...line, batchId: value as string }
                                  : line,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Unavailable">{() => { const selected = options.find((batch) => batch.id === lines[index]?.batchId); return selected ? `${selected.batchNumber} · ${selected.expiry} · ${selected.quantity}` : "Unavailable"; }}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((batch) => (
                              <SelectItem key={batch.id} value={batch.id} label={`${batch.batchNumber} · ${batch.expiry} · ${batch.quantity}`}>
                                {batch.batchNumber} · {batch.expiry} ·{" "}
                                {batch.quantity}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          type="number"
                          min={0}
                          max={item.requested - item.dispensed}
                          value={lines[index]?.quantity ?? 0}
                          onChange={(event) =>
                            setLines((rows) =>
                              rows.map((line, i) =>
                                i === index
                                  ? {
                                      ...line,
                                      quantity: Number(event.target.value),
                                    }
                                  : line,
                              ),
                            )
                          }
                        />
                        {/* Quantities are always pieces, so stock arithmetic has
                            one unit; this only says what that is in strips, and
                            lets the pharmacist fill in whole strips quickly. */}
                        {(() => {
                          const pack = options.find((b) => b.id === lines[index]?.batchId)?.unitsPerPack ?? 1;
                          if (pack <= 1) return null;
                          const pieces = lines[index]?.quantity ?? 0;
                          const pending = item.requested - item.dispensed;
                          return (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[11px] text-muted-foreground">
                                {packBreakdown(pieces, pack)?.label ?? `${pieces}`}
                              </p>
                              <Button
                                type="button"
                                size="xs"
                                variant="link"
                                className="h-auto px-0 text-[11px]"
                                onClick={() =>
                                  setLines((rows) =>
                                    rows.map((line, i) =>
                                      i === index
                                        ? { ...line, quantity: Math.min(pending, Math.floor(pending / pack) * pack) }
                                        : line,
                                    ),
                                  )
                                }
                              >
                                Whole strips only
                              </Button>
                            </div>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {source === "op" ? (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select
                  value={mode}
                  onValueChange={(value) => setMode(value as string)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {outstanding > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor={`fee-${prescriptionId}`}>
                    Consultation fee collected (₹){" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`fee-${prescriptionId}`}
                    name="consultationCollected"
                    inputMode="decimal"
                    className="w-48"
                    value={feeCollected}
                    onChange={(event) => setFeeCollected(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set by {doctorName ?? "the consulting doctor"} · outstanding{" "}
                    {formatInr(outstanding)}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter showCloseButton>
            <Button
              disabled={pending || payload.length === 0 || feeUnpaid}
              type="submit"
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <Pill />}{" "}
              {feeUnpaid ? "Enter consultation fee" : "Confirm Dispense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
