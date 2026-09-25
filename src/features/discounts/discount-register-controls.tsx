"use client";

import { useActionState, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, LoaderCircle } from "lucide-react";
import { voidDiscount } from "./actions";
import { DISCOUNT_REASONS, discountReasonLabel } from "@/lib/domain/discount";
import { formatInr } from "@/lib/domain/money";
import type { ActionState } from "@/types/hospital";
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";
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
import { Textarea } from "@/components/ui/textarea";

const SOURCES = [
  { value: "all", label: "All desks" },
  { value: "op", label: "OP" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "ip", label: "IP" },
];

/** Date range, desk and reason filters, kept in the URL. */
export function DiscountFilters({
  from,
  to,
  source,
  reason,
}: {
  from: string;
  to: string;
  source: string;
  reason: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="discount-from" className="text-xs">From</Label>
        <Input id="discount-from" type="date" value={from} max={to} onChange={(e) => update("from", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="discount-to" className="text-xs">To</Label>
        <Input id="discount-to" type="date" value={to} min={from} onChange={(e) => update("to", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Desk</Label>
        <Select value={source || "all"} onValueChange={(value) => update("source", String(value))}>
          <SelectTrigger className="w-36" aria-label="Filter by desk">
            <SelectValue>{() => SOURCES.find((entry) => entry.value === (source || "all"))?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SOURCES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Reason</Label>
        <Select value={reason || "all"} onValueChange={(value) => update("reason", String(value))}>
          <SelectTrigger className="w-40" aria-label="Filter by reason">
            <SelectValue>{() => (reason ? discountReasonLabel(reason) : "All reasons")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {DISCOUNT_REASONS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pending ? <LoaderCircle className="mb-2 size-4 animate-spin text-muted-foreground" aria-label="Loading" /> : null}
    </div>
  );
}

const initial: ActionState = { ok: false };

export function VoidDiscountDialog({
  discountId,
  amountPaise,
  patientName,
}: {
  discountId: string;
  amountPaise: number;
  patientName: string;
}) {
  const [state, action, pending] = useActionState(voidDiscount, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Discount voided.");
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Ban /> Void
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Void discount</DialogTitle>
            <DialogDescription>
              {formatInr(amountPaise)} for {patientName}. The discount stays on record as voided and
              the bill&apos;s balance becomes due again.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="discountId" value={discountId} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`void-${discountId}`}>Reason</Label>
            <Textarea
              id={`void-${discountId}`}
              name="reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Given on the wrong visit"
            />
            <p className="text-xs text-destructive">{state.fieldErrors?.reason?.[0]}</p>
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 3}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Ban />} Void Discount
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
