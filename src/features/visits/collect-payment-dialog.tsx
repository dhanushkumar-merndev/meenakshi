"use client";
import { useActionState, useState } from "react";
import { IndianRupee, LoaderCircle } from "lucide-react";
import { addVisitPayment } from "./actions";
import { formatInr, rupeesToPaise } from "@/lib/domain/money";
import { maxDiscountPaise } from "@/lib/domain/discount";
import {
  DiscountField,
  useDiscount,
  type DiscountPolicyProps,
} from "@/components/shared/discount-field";
import type { ActionState } from "@/types/hospital";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";

const initial: ActionState = { ok: false };
const MODE_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank Transfer", other: "Other" };

/**
 * Settles a visit's fee when it never reaches the pharmacy counter (no
 * medicines were prescribed, e.g. a straight referral to admission) -- the
 * only other place this fee is ever collected is bundled into dispensing.
 */
export function CollectPaymentDialog({
  visitId,
  patientId,
  balancePaise,
  feePaise,
  discountedPaise = 0,
  discountPolicy,
  size = "sm",
}: {
  visitId: string;
  /** Only used to revalidate that patient's page; safe to omit when unknown. */
  patientId?: string;
  balancePaise: number;
  /** The visit's full fee: what a discount percentage and limit apply to. */
  feePaise?: number;
  /** Discount already given on this visit, counted against the limit. */
  discountedPaise?: number;
  discountPolicy: DiscountPolicyProps;
  size?: "sm" | "default";
}) {
  const [state, action, pending] = useActionState(addVisitPayment, initial);
  const fee = Math.max(feePaise ?? balancePaise, balancePaise);
  const discount = useDiscount({
    grossPaise: fee,
    maxPaise: Math.min(
      balancePaise,
      maxDiscountPaise(fee, discountPolicy.limitPercent, discountPolicy.unlimited, discountedPaise),
    ),
    policy: discountPolicy,
  });
  // The amount follows "balance less discount" until the collector types a
  // different (part) payment themselves.
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const amount = typedAmount ?? (Math.max(0, balancePaise - discount.paise) / 100).toFixed(2);
  let amountPaise: number | null = null;
  try {
    amountPaise = amount.trim() ? rupeesToPaise(amount) : 0;
  } catch {
    amountPaise = null;
  }
  const settlesPaise = (amountPaise ?? 0) + discount.paise;
  const amountError =
    amountPaise === null
      ? "Enter a valid amount."
      : settlesPaise <= 0
        ? "Enter an amount or a discount."
        : settlesPaise > balancePaise
          ? "Amount and discount are more than the balance."
          : null;
  const [mode, setMode] = useState("cash");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const { open, setOpen } = useAutoCloseDialog(state, "Payment recorded.");
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !open) {
      // One key per intended collection: kept across retries while the dialog
      // is open, fresh for the next part payment on the same visit.
      setKey(crypto.randomUUID());
      setTypedAmount(null);
      discount.reset();
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size={size} />}>
        <IndianRupee /> Collect {formatInr(balancePaise)}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Collect payment</DialogTitle>
            <DialogDescription>
              Outstanding balance {formatInr(balancePaise)}.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="visitId" value={visitId} />
          <input type="hidden" name="patientId" value={patientId ?? ""} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="mode" value={mode} />
          {state.message && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="collect-amount">Amount (₹)</Label>
            <Input
              id="collect-amount"
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setTypedAmount(e.target.value)}
              aria-invalid={amountError !== null}
            />
            <p className="text-xs text-destructive">
              {amountError ?? state.fieldErrors?.amount?.[0]}
            </p>
          </div>
          <DiscountField discount={discount} id={`visit-${visitId}`} />
          {discount.paise > 0 && amountError === null ? (
            <p className="text-xs text-muted-foreground">
              Settles {formatInr(settlesPaise)} of {formatInr(balancePaise)}
              {balancePaise - settlesPaise > 0
                ? ` · ${formatInr(balancePaise - settlesPaise)} still due`
                : " · fully settled"}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label>Payment mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => MODE_LABELS[mode] ?? mode}</SelectValue>
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
          <div className="space-y-2">
            <Label htmlFor="collect-reference">Reference (optional)</Label>
            <Input id="collect-reference" name="reference" placeholder="UPI ref / cheque no." />
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || amountError !== null || !discount.valid} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <IndianRupee />} {amountPaise === 0 && discount.paise > 0 ? "Record Discount" : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
