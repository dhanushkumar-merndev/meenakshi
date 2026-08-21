"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, PackageCheck, Printer } from "lucide-react";
import { fulfillIpInventoryRequest } from "./inventory-request-actions";
import { formatInr } from "@/lib/domain/money";
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

type RequestItem = { id: string; requested_name: string; requested_quantity: number };
type InventoryOption = { id: string; name: string; unit: string | null; selling_price_paise: number; quantity: number };

type Line = {
  requestItemId: string;
  requestedName: string;
  requestedQuantity: number;
  /** "" = not matched to any catalog item -> off-catalog, priced manually. */
  inventoryItemId: string;
  fulfilledQuantity: number;
  /** Only used when inventoryItemId is "" (off-catalog). */
  customPriceRupees: string;
};

/**
 * Pharmacy's side of an IP item request: for each line, either match it to
 * real stock (deducts atomically, priced from the catalog) or leave it
 * off-catalog and price it manually. A line left at 0 is unavailable -- no
 * charge, no stock change; the patient is told to buy it outside.
 */
export function FulfillInventoryRequestDialog({
  requestId,
  patientName,
  items,
  inventory,
}: {
  requestId: string;
  patientName: string;
  items: RequestItem[];
  inventory: InventoryOption[];
}) {
  const [state, action, pending] = useActionState(fulfillIpInventoryRequest, { ok: false });
  const [key] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<Line[]>(() =>
    items.map((item) => {
      // Best-effort auto-match on an exact (case-insensitive) name so the
      // pharmacist isn't re-picking things that clearly already exist.
      const match = inventory.find((i) => i.name.toLowerCase() === item.requested_name.toLowerCase());
      return {
        requestItemId: item.id,
        requestedName: item.requested_name,
        requestedQuantity: item.requested_quantity,
        inventoryItemId: match?.id ?? "",
        fulfilledQuantity: match ? Math.min(item.requested_quantity, match.quantity) : item.requested_quantity,
        customPriceRupees: "",
      };
    }),
  );

  const updateLine = (requestItemId: string, patch: Partial<Line>) =>
    setLines((rows) => rows.map((row) => (row.requestItemId === requestItemId ? { ...row, ...patch } : row)));

  const payload = useMemo(
    () =>
      lines.map((line) => ({
        request_item_id: line.requestItemId,
        inventory_item_id: line.inventoryItemId || undefined,
        fulfilled_quantity: line.fulfilledQuantity,
        unit_price_paise: line.inventoryItemId
          ? undefined
          : Math.round((Number(line.customPriceRupees) || 0) * 100),
      })),
    [lines],
  );
  const totalPaise = useMemo(
    () =>
      lines.reduce((sum, line) => {
        if (line.fulfilledQuantity <= 0) return sum;
        const price = line.inventoryItemId
          ? (inventory.find((i) => i.id === line.inventoryItemId)?.selling_price_paise ?? 0)
          : Math.round((Number(line.customPriceRupees) || 0) * 100);
        return sum + line.fulfilledQuantity * price;
      }, 0),
    [lines, inventory],
  );
  const needsManualPrice = lines.some(
    (line) =>
      !line.inventoryItemId &&
      line.fulfilledQuantity > 0 &&
      (!Number.isFinite(Number(line.customPriceRupees)) || Number(line.customPriceRupees) <= 0),
  );

  if (state.ok) {
    // Whatever fell short of the requested quantity (unmatched entirely, or
    // matched but stock only covered part of it) belongs on a note the
    // family can take to buy it outside -- nothing was billed for it either
    // way.
    const hasShortfall = lines.some((line) => line.fulfilledQuantity < line.requestedQuantity);
    return (
      <div className="flex items-center justify-end gap-2">
        <CheckCircle2 className="text-primary" />
        <span className="text-sm text-muted-foreground">Fulfilled</span>
        {hasShortfall ? (
          <Button size="sm" variant="outline" render={<Link href={`/print/ip-shortage/${requestId}`} target="_blank" />}>
            <Printer /> Shortage Note
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PackageCheck /> Fulfill
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Fulfill item request</DialogTitle>
            <DialogDescription>
              {patientName} · Match each line to stock, or leave it off-catalog
              and price it manually. Quantity 0 marks it unavailable.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />
          {state.message ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead className="min-w-48">Match to stock</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const matched = inventory.find((i) => i.id === line.inventoryItemId);
                  return (
                    <TableRow key={line.requestItemId}>
                      <TableCell className="font-medium">
                        {line.requestedName}
                        <span className="block text-xs text-muted-foreground">
                          Requested {line.requestedQuantity}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={line.inventoryItemId || "custom"}
                          onValueChange={(value) => {
                            const id = value === "custom" ? "" : String(value);
                            const stock = inventory.find((i) => i.id === id);
                            updateLine(line.requestItemId, {
                              inventoryItemId: id,
                              fulfilledQuantity: stock
                                ? Math.min(line.requestedQuantity, stock.quantity)
                                : line.requestedQuantity,
                            });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Off-catalog">
                              {() => (matched ? `${matched.name} · ${matched.quantity} left` : "Off-catalog (manual price)")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom" label="Off-catalog (manual price)">
                              Off-catalog (manual price)
                            </SelectItem>
                            {inventory.map((option) => (
                              <SelectItem
                                key={option.id}
                                value={option.id}
                                label={`${option.name} · ${option.quantity} left`}
                                disabled={option.quantity <= 0}
                              >
                                {option.name} · {formatInr(option.selling_price_paise)} · {option.quantity} left
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min={0}
                          max={matched ? Math.min(line.requestedQuantity, matched.quantity) : line.requestedQuantity}
                          value={line.fulfilledQuantity}
                          onChange={(event) =>
                            updateLine(line.requestItemId, { fulfilledQuantity: Math.max(0, Number(event.target.value)) })
                          }
                        />
                        {matched && matched.quantity < line.requestedQuantity ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">Only {matched.quantity} in stock</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {matched ? (
                          <span className="text-sm tabular-nums" title="Auto-filled from the current stock price">
                            {formatInr(matched.selling_price_paise)}
                          </span>
                        ) : (
                          <Input
                            className="w-24"
                            inputMode="decimal"
                            placeholder="₹0.00"
                            value={line.customPriceRupees}
                            onChange={(event) => updateLine(line.requestItemId, { customPriceRupees: event.target.value })}
                            disabled={line.fulfilledQuantity <= 0}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end border-t pt-3 text-sm">
            <p>
              <span className="text-muted-foreground">Total to bill the ticket: </span>
              <span className="font-semibold">{formatInr(totalPaise)}</span>
            </p>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || needsManualPrice} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <PackageCheck />} Fulfill Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
