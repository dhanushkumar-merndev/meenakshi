"use client";
import Link from "next/link";
import { CatalogSelect } from "@/components/shared/catalog-select";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, PackageCheck, Printer } from "lucide-react";
import { fulfillIpInventoryRequest } from "./inventory-request-actions";
import {
  calculateIpStockAmountAtOffset,
  findIpStockMatch,
  type IpStockOption,
} from "./stock-match";
import { formatInr } from "@/lib/domain/money";
import { allocateVisibleStock } from "@/lib/domain/stock-allocation";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

const UNAVAILABLE_STOCK_KEY = "unavailable";
const MANUAL_STOCK_KEY = "manual";

function stockKeyFor(option: IpStockOption) {
  return `${option.stock_type}:${option.stock_id}`;
}

function isTrackedStockKey(stockKey: string) {
  return stockKey !== UNAVAILABLE_STOCK_KEY && stockKey !== MANUAL_STOCK_KEY;
}

type Line = {
  requestItemId: string;
  requestedName: string;
  requestedQuantity: number;
  /** A stock item, or an explicit unavailable/manual outcome. */
  stockKey: string;
  fulfilledQuantity: number;
  /** Only used for an explicit manual/off-catalog supply. */
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
  stock: initialStock,
}: {
  requestId: string;
  patientName: string;
  items: RequestItem[];
  stock: IpStockOption[];
}) {
  const [stock, setStock] = useState(initialStock);
  const [state, action, pending] = useActionState(fulfillIpInventoryRequest, { ok: false });
  const [key] = useState(() => crypto.randomUUID());
  const [settlement, setSettlement] = useState<"ip_ticket" | "collect_now">("ip_ticket");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [reference, setReference] = useState("");
  const availableByStockKey = useMemo(
    () =>
      Object.fromEntries(
        stock.map((option) => [stockKeyFor(option), option.quantity]),
      ) as Record<string, number>,
    [stock],
  );
  const reconcileLines = (candidate: Line[], available = availableByStockKey) => {
    const allocations = allocateVisibleStock(
      candidate.map((line) => ({
        stockKey: isTrackedStockKey(line.stockKey) ? line.stockKey : null,
        requestedQuantity: line.requestedQuantity,
        selectedQuantity:
          line.stockKey === UNAVAILABLE_STOCK_KEY ? 0 : line.fulfilledQuantity,
      })),
      available,
    );
    return candidate.map((line, index) => ({
      ...line,
      fulfilledQuantity:
        line.stockKey === UNAVAILABLE_STOCK_KEY
          ? 0
          : allocations[index].selectedQuantity,
    }));
  };
  const [lines, setLines] = useState<Line[]>(() =>
    reconcileLines(
      items.map((item) => {
        const match = findIpStockMatch(item.requested_name, stock);
        return {
          requestItemId: item.id,
          requestedName: item.requested_name,
          requestedQuantity: item.requested_quantity,
          // No match means not supplied by default. A manual/off-catalog line
          // is an intentional choice by pharmacy, never an implicit fallback.
          stockKey: match ? stockKeyFor(match) : UNAVAILABLE_STOCK_KEY,
          fulfilledQuantity: match
            ? Math.min(item.requested_quantity, match.quantity)
            : 0,
          customPriceRupees: "",
        };
      }),
    ),
  );

  const updateLine = (requestItemId: string, patch: Partial<Line>, available = availableByStockKey) =>
    setLines((rows) =>
      reconcileLines(
        rows.map((row) =>
          row.requestItemId === requestItemId ? { ...row, ...patch } : row,
        ),
        available,
      ),
    );

  const allocations = useMemo(
    () =>
      allocateVisibleStock(
        lines.map((line) => ({
          stockKey: isTrackedStockKey(line.stockKey) ? line.stockKey : null,
          requestedQuantity: line.requestedQuantity,
          selectedQuantity:
            line.stockKey === UNAVAILABLE_STOCK_KEY ? 0 : line.fulfilledQuantity,
        })),
        availableByStockKey,
      ),
    [availableByStockKey, lines],
  );

  const payload = useMemo(
    () =>
      lines.map((line) => ({
        request_item_id: line.requestItemId,
        inventory_item_id:
          line.stockKey.startsWith("inventory:")
            ? line.stockKey.slice("inventory:".length)
            : undefined,
        medicine_id:
          line.stockKey.startsWith("medicine:")
            ? line.stockKey.slice("medicine:".length)
            : undefined,
        fulfilled_quantity: line.fulfilledQuantity,
        unit_price_paise:
          line.stockKey === MANUAL_STOCK_KEY
            ? Math.round((Number(line.customPriceRupees) || 0) * 100)
            : undefined,
      })),
    [lines],
  );
  const lineAmountsPaise = useMemo(() => {
    const usedQuantityByStockKey = new Map<string, number>();
    return lines.map((line) => {
      if (line.fulfilledQuantity <= 0) return 0;
      const option = stock.find(
        (candidate) => stockKeyFor(candidate) === line.stockKey,
      );
      if (option) {
        const usedQuantity = usedQuantityByStockKey.get(line.stockKey) ?? 0;
        const amount = calculateIpStockAmountAtOffset(
          option,
          line.fulfilledQuantity,
          usedQuantity,
        );
        usedQuantityByStockKey.set(
          line.stockKey,
          usedQuantity + line.fulfilledQuantity,
        );
        return amount;
      }
      if (line.stockKey === MANUAL_STOCK_KEY) {
        const price = Math.round((Number(line.customPriceRupees) || 0) * 100);
        return line.fulfilledQuantity * price;
      }
      return 0;
    });
  }, [lines, stock]);
  const totalPaise = useMemo(
    () => lineAmountsPaise.reduce((sum, amount) => sum + amount, 0),
    [lineAmountsPaise],
  );
  const needsManualPrice = lines.some(
    (line) =>
      line.stockKey === MANUAL_STOCK_KEY &&
      line.fulfilledQuantity > 0 &&
      (!Number.isFinite(Number(line.customPriceRupees)) || Number(line.customPriceRupees) <= 0),
  );
  const collectNow = settlement === "collect_now";
  // Counter collection is deliberately full-only. The hidden amount is
  // derived from the live supplied total, so changing a quantity cannot leave
  // a stale amount that would make an IP bill and a counter receipt diverge.
  const invalidCollection = collectNow && totalPaise <= 0;

  if (state.ok) {
    // Whatever fell short of the requested quantity (unmatched entirely, or
    // matched but stock only covered part of it) belongs on a note the
    // family can take to buy it outside -- nothing was billed for it either
    // way.
    const hasShortfall = lines.some((line) => line.fulfilledQuantity < line.requestedQuantity);
    return (
      <div className="flex items-center justify-end gap-2">
        <CheckCircle2 className="text-primary" />
        <span className="max-w-md text-sm text-muted-foreground">
          {state.message ?? "Fulfilled"}
          {state.data?.hasSuppliedItems
            ? ` Supplied total: ${formatInr(totalPaise)}.`
            : ""}
        </span>
        <Button size="sm" variant="outline" render={<Link href={`/print/ip-items/${requestId}`} target="_blank" />}>
          <Printer /> Bill / Receipt
        </Button>
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
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Fulfill item request</DialogTitle>
            <DialogDescription>
              {patientName} · The original requested quantity is retained on
              every line. Available now is guidance only; stock is neither
              reserved nor reduced until you confirm fulfilment.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />
          <input type="hidden" name="settlement" value={collectNow ? "pharmacy_counter" : "ip_ticket"} />
          <input type="hidden" name="collectedAmount" value={collectNow ? (totalPaise / 100).toFixed(2) : ""} />
          <input type="hidden" name="paymentMode" value={paymentMode} />
          <input type="hidden" name="reference" value={reference} />
          {state.message ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Item</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Available now</TableHead>
                  <TableHead className="min-w-48">Supply from</TableHead>
                  <TableHead>Supply now</TableHead>
                  <TableHead>Not supplied</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const matched = stock.find((option) => stockKeyFor(option) === line.stockKey);
                  const allocation = allocations[index];
                  const isManual = line.stockKey === MANUAL_STOCK_KEY;
                  const isUnavailable = line.stockKey === UNAVAILABLE_STOCK_KEY;
                  const suggested = findIpStockMatch(line.requestedName, stock);
                  const suggestedStockKey = suggested ? stockKeyFor(suggested) : null;
                  const suggestedAvailableNow = suggested
                    ? Math.max(
                        0,
                        suggested.quantity -
                          lines.reduce(
                            (used, candidate, candidateIndex) =>
                              candidateIndex === index ||
                              candidate.stockKey !== suggestedStockKey
                                ? used
                                : used + allocations[candidateIndex].selectedQuantity,
                            0,
                          ),
                      )
                    : 0;
                  const maximumSupply = matched
                    ? Math.min(line.requestedQuantity, allocation.availableNow ?? 0)
                    : isManual
                      ? line.requestedQuantity
                      : 0;
                  const outcome =
                    allocation.notSuppliedQuantity === 0
                      ? "Fully supplied"
                      : line.fulfilledQuantity === 0
                        ? "Unavailable"
                        : `Partially supplied · ${allocation.notSuppliedQuantity} not supplied`;
                  const lineAmountPaise = lineAmountsPaise[index] ?? 0;
                  return (
                    <TableRow key={line.requestItemId}>
                      <TableCell className="font-medium">
                        {line.requestedName}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {line.requestedQuantity}
                      </TableCell>
                      <TableCell>
                        {matched ? (
                          <>
                            <span className="tabular-nums">
                              {allocation.availableNow ?? 0}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              selected stock
                            </span>
                          </>
                        ) : isManual ? (
                          <span className="text-xs text-muted-foreground">
                            Not stock-tracked
                          </span>
                        ) : suggested ? (
                          <>
                            <span className="tabular-nums">{suggestedAvailableNow}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              suggested stock
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="tabular-nums">0</span>
                            <span className="block text-[11px] text-muted-foreground">
                              no stock match
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <CatalogSelect<IpStockOption | null>
                          endpoint="/api/search/ip-stock"
                          placeholder="Select stock to supply"
                          value={{ value: line.stockKey, label: matched ? `${matched.name} · ${matched.quantity} in stock` : isManual ? "Manual / off-catalog supply" : "Not supplied / outside purchase" }}
                          options={[
                            { value: UNAVAILABLE_STOCK_KEY, label: "Not supplied / outside purchase", data: null },
                            { value: MANUAL_STOCK_KEY, label: "Manual / off-catalog supply", data: null },
                          ]}
                          onChange={(option) => {
                            const selected = option.data;
                            if (selected) setStock((rows) => [...rows.filter((row) => stockKeyFor(row) !== option.value), selected]);
                            updateLine(line.requestItemId, {
                              stockKey: option.value,
                              fulfilledQuantity: option.value === UNAVAILABLE_STOCK_KEY ? 0 : selected ? Math.min(line.requestedQuantity, selected.quantity) : line.fulfilledQuantity || line.requestedQuantity,
                            }, selected ? { ...availableByStockKey, [option.value]: Number(selected.quantity) } : availableByStockKey);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min={0}
                          max={maximumSupply}
                          value={line.fulfilledQuantity}
                          onChange={(event) =>
                            updateLine(line.requestItemId, { fulfilledQuantity: Math.max(0, Number(event.target.value)) })
                          }
                          disabled={isUnavailable}
                        />
                        {isUnavailable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-auto px-0 py-0 text-[11px] text-muted-foreground"
                            onClick={() =>
                              updateLine(line.requestItemId, {
                                stockKey: suggested
                                  ? stockKeyFor(suggested)
                                  : MANUAL_STOCK_KEY,
                                fulfilledQuantity: suggested
                                  ? Math.min(line.requestedQuantity, suggested.quantity)
                                  : line.requestedQuantity,
                              })
                            }
                          >
                            {suggested ? "Restore stock match" : "Use manual supply"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-auto px-0 py-0 text-[11px] text-muted-foreground"
                            onClick={() =>
                              updateLine(line.requestItemId, {
                                stockKey: UNAVAILABLE_STOCK_KEY,
                                fulfilledQuantity: 0,
                              })
                            }
                          >
                            Mark not supplied
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums">
                          {allocation.notSuppliedQuantity}
                        </span>
                        <span
                          className={
                            "block text-[11px] " +
                            (allocation.notSuppliedQuantity === 0
                              ? "text-muted-foreground"
                              : "text-destructive")
                          }
                        >
                          {outcome}
                        </span>
                      </TableCell>
                      <TableCell>
                        {matched ? (
                          <span className="text-sm tabular-nums" title="Calculated from the selected FEFO stock batches">
                            {formatInr(lineAmountPaise)}
                            <span className="block text-[11px] text-muted-foreground">
                              supplied total
                            </span>
                          </span>
                        ) : isManual ? (
                          <div className="space-y-1">
                            <Input
                              className="w-24"
                              inputMode="decimal"
                              placeholder="₹0.00"
                              value={line.customPriceRupees}
                              onChange={(event) => updateLine(line.requestItemId, { customPriceRupees: event.target.value })}
                              disabled={line.fulfilledQuantity <= 0}
                            />
                            {line.fulfilledQuantity > 0 ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {formatInr(lineAmountPaise)} total
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Stock rule:</span>{" "}
            “Available now” is a live check, not a reservation. Only the
            supplied quantity changes stock after you confirm. Not-supplied
            quantities remain attached to this request for the outside-purchase note.
          </p>
          <div className="flex justify-end border-t pt-3 text-sm">
            <p>
              <span className="text-muted-foreground">Supplied total: </span>
              <span className="font-semibold">{formatInr(totalPaise)}</span>
            </p>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Settlement</p>
              <p className="text-xs text-muted-foreground">
                Choose where this supplied amount is settled. It is recorded only once.
              </p>
            </div>
            <RadioGroup
              value={settlement}
              onValueChange={(value) => {
                const next = String(value) as "ip_ticket" | "collect_now";
                setSettlement(next);
              }}
              className="gap-3"
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="ip_ticket" />
                <span>
                  <span className="block text-sm font-medium">Add to IP ticket</span>
                  <span className="block text-xs text-muted-foreground">
                    Shows as an IP pharmacy charge and is collected with the running or final bill.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="collect_now" />
                <span>
                  <span className="block text-sm font-medium">Collect at pharmacy now</span>
                  <span className="block text-xs text-muted-foreground">
                    Collects the exact supplied total at the pharmacy counter. It creates a pharmacy receipt only and does not add anything to the IP bill.
                  </span>
                </span>
              </label>
            </RadioGroup>
            {collectNow ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Amount to collect</Label>
                  <p className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium tabular-nums">
                    {formatInr(totalPaise)}
                  </p>
                  <p className="text-xs text-muted-foreground">The full supplied amount is collected here; partial counter collection is not used for IP requests.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ip-item-mode-${requestId}`}>Mode</Label>
                  <Select value={paymentMode} onValueChange={(value) => setPaymentMode(String(value))}>
                    <SelectTrigger id={`ip-item-mode-${requestId}`} className="w-full">
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
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`ip-item-reference-${requestId}`}>Reference</Label>
                  <Input
                    id={`ip-item-reference-${requestId}`}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || needsManualPrice || invalidCollection} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <PackageCheck />} Fulfill Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
