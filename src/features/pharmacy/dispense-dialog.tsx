"use client";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Pill } from "lucide-react";
import { dispensePrescription } from "./actions";
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
  quantity: number;
  pricePaise: number;
};
export function DispenseDialog({
  prescriptionId,
  patientName,
  source,
  items,
  batches,
}: {
  prescriptionId: string;
  patientName: string;
  source: string;
  items: Item[];
  batches: Batch[];
}) {
  const [state, action, pending] = useActionState(dispensePrescription, {
    ok: false,
  });
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
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
  if (state.ok)
    return (
      <Button size="sm" variant="outline" disabled>
        <CheckCircle2 /> Dispensed
      </Button>
    );
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <Pill /> Dispense
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Dispense prescription</DialogTitle>
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
                  <TableHead>Dispense Qty</TableHead>
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
                            <SelectValue placeholder="Unavailable" />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((batch) => (
                              <SelectItem key={batch.id} value={batch.id}>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {source === "op" ? (
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
          ) : null}
          <DialogFooter showCloseButton>
            <Button disabled={pending || payload.length === 0} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Pill />}{" "}
              Confirm Dispense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
