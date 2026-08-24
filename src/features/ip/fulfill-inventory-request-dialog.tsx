"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, PackageCheck, Printer } from "lucide-react";
import { fulfillIpInventoryRequest } from "./inventory-request-actions";
import {
  calculateIpStockAmount,
  findIpStockMatch,
  type IpStockOption,
} from "./stock-match";
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
import { Checkbox } from "@/components/ui/checkbox";
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

type RequestItem = { id: string; requested_name: string; requested_quantity: number };

type Line = {
  requestItemId: string;
  requestedName: string;
  requestedQuantity: number;
  /** "" = not matched to stock -> off-catalog, priced manually. */
  stockKey: string;
  fulfilledQuantity: number;
  /** Only used when stockKey is "" (off-catalog). */
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
  stock,
}: {
  requestId: string;
  patientName: string;
  items: RequestItem[];
  stock: IpStockOption[];
}) {
  const [state, action, pending] = useActionState(fulfillIpInventoryRequest, { ok: false });
  const [key] = useState(() => crypto.randomUUID());
  const [collectNow, setCollectNow] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    items.map((item) => {
      const match = findIpStockMatch(item.requested_name, stock);
      return {
        requestItemId: item.id,
        requestedName: item.requested_name,
        requestedQuantity: item.requested_quantity,
        stockKey: match ? `${match.stock_type}:${match.stock_id}` : "",
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
        inventory_item_id:
          line.stockKey.startsWith("inventory:")
            ? line.stockKey.slice("inventory:".length)
            : undefined,
        medicine_id:
          line.stockKey.startsWith("medicine:")
            ? line.stockKey.slice("medicine:".length)
            : undefined,
        fulfilled_quantity: line.fulfilledQuantity,
        unit_price_paise: line.stockKey
          ? undefined
          : Math.round((Number(line.customPriceRupees) || 0) * 100),
      })),
    [lines],
  );
  const totalPaise = useMemo(
    () =>
      lines.reduce((sum, line) => {
        if (line.fulfilledQuantity <= 0) return sum;
        const option = stock.find(
          (candidate) =>
            `${candidate.stock_type}:${candidate.stock_id}` === line.stockKey,
        );
        if (option)
          return sum + calculateIpStockAmount(option, line.fulfilledQuantity);
        const price = Math.round((Number(line.customPriceRupees) || 0) * 100);
        return sum + line.fulfilledQuantity * price;
      }, 0),
    [lines, stock],
  );
  const needsManualPrice = lines.some(
    (line) =>
      !line.stockKey &&
      line.fulfilledQuantity > 0 &&
      (!Number.isFinite(Number(line.customPriceRupees)) || Number(line.customPriceRupees) <= 0),
  );
  const collectedPaise = Math.round((Number(collectedAmount) || 0) * 100);
  const invalidCollection = collectNow && (
    collectedPaise <= 0 || collectedPaise > totalPaise
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
          <input type="hidden" name="collectedAmount" value={collectNow ? collectedAmount : ""} />
          <input type="hidden" name="paymentMode" value={paymentMode} />
          <input type="hidden" name="reference" value={reference} />
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
                  const matched = stock.find(
                    (option) =>
                      `${option.stock_type}:${option.stock_id}` === line.stockKey,
                  );
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
                          value={line.stockKey || "custom"}
                          onValueChange={(value) => {
                            const stockKey = value === "custom" ? "" : String(value);
                            const selected = stock.find(
                              (option) =>
                                `${option.stock_type}:${option.stock_id}` === stockKey,
                            );
                            updateLine(line.requestItemId, {
                              stockKey,
                              fulfilledQuantity: selected
                                ? Math.min(line.requestedQuantity, selected.quantity)
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
                            {stock.map((option) => {
                              const value = `${option.stock_type}:${option.stock_id}`;
                              const source = option.stock_type === "medicine" ? "Medicine" : "Inventory";
                              return (
                                <SelectItem
                                  key={value}
                                  value={value}
                                  label={`${option.name} · ${source} · ${option.quantity} left`}
                                >
                                  {option.name} · {source} · {formatInr(option.selling_price_paise)} · {option.quantity} left
                                </SelectItem>
                              );
                            })}
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
                        {line.fulfilledQuantity > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-auto px-0 py-0 text-[11px] text-muted-foreground"
                            onClick={() => updateLine(line.requestItemId, { fulfilledQuantity: 0 })}
                          >
                            Mark unavailable
                          </Button>
                        ) : (
                          <span className="mt-1 block text-[11px] text-destructive">Outside purchase</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {matched ? (
                          <span className="text-sm tabular-nums" title="Auto-filled from the current stock price">
                            {formatInr(matched.selling_price_paise)}
                            <span className="block text-[11px] text-muted-foreground">
                              per {matched.unit || "unit"}
                              {matched.pack_price_paise && matched.units_per_pack > 1
                                ? ` · ${formatInr(matched.pack_price_paise)}/pack`
                                : ""}
                            </span>
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
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={collectNow}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setCollectNow(next);
                  if (next) setCollectedAmount((totalPaise / 100).toFixed(2));
                }}
              />
              <span>
                <span className="block text-sm font-medium">Collect payment now</span>
                <span className="block text-xs text-muted-foreground">
                  Records an IP payment at the pharmacy counter. Leave unchecked to collect with the final IP bill.
                </span>
              </span>
            </label>
            {collectNow ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`ip-item-amount-${requestId}`}>Amount</Label>
                  <Input
                    id={`ip-item-amount-${requestId}`}
                    inputMode="decimal"
                    value={collectedAmount}
                    onChange={(event) => setCollectedAmount(event.target.value)}
                  />
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
