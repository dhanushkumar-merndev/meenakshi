"use client";

import { useState } from "react";
import { BadgePercent, X } from "lucide-react";
import {
  DISCOUNT_NOTE_MAX,
  DISCOUNT_REASONS,
  discountInputToPaise,
  discountPercentLabel,
  discountReasonLabel,
  validateDiscount,
  type DiscountInputMode,
} from "@/lib/domain/discount";
import { formatInr } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DiscountPolicyProps = { limitPercent: number; unlimited: boolean };

/**
 * State for one discount on one bill. `grossPaise` is what a percentage is
 * taken of; `maxPaise` is the most this person may give on it right now.
 */
export function useDiscount({
  grossPaise,
  maxPaise,
  policy,
}: {
  grossPaise: number;
  maxPaise: number;
  policy: DiscountPolicyProps;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountInputMode>("amount");
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const parsed = discountInputToPaise(mode, raw, grossPaise);
  const paise = open ? parsed.paise : 0;
  const error = !open
    ? null
    : (parsed.error ??
      validateDiscount({
        paise,
        maxPaise,
        grossPaise,
        reason,
        note,
        unlimited: policy.unlimited,
        limitPercent: policy.limitPercent,
      }));
  const reset = () => {
    setOpen(false);
    setMode("amount");
    setRaw("");
    setReason("");
    setNote("");
  };
  return {
    open, setOpen, mode, setMode, raw, setRaw, reason, setReason, note, setNote,
    paise, error, valid: error === null, grossPaise, maxPaise, policy, reset,
  };
}

export type DiscountState = ReturnType<typeof useDiscount>;

/**
 * Optional discount on a bill: ₹ or %, a reason, and a note (required for
 * "Other"). Submits discountPaise / discountReason / discountNote with the
 * surrounding form.
 */
export function DiscountField({ discount, id }: { discount: DiscountState; id: string }) {
  const { policy } = discount;
  const hidden = (
    <>
      <input type="hidden" name="discountPaise" value={discount.paise} />
      <input type="hidden" name="discountReason" value={discount.paise > 0 ? discount.reason : ""} />
      <input type="hidden" name="discountNote" value={discount.paise > 0 ? discount.note : ""} />
    </>
  );

  if (!discount.open) {
    return (
      <div>
        {hidden}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={discount.maxPaise <= 0}
          onClick={() => discount.setOpen(true)}
        >
          <BadgePercent /> Add discount
        </Button>
        {discount.maxPaise <= 0 && discount.grossPaise > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            The {policy.limitPercent}% discount limit is already used on this bill.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      {hidden}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${id}-discount`} className="text-sm">
          Discount
        </Label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {policy.unlimited
              ? `Up to ${formatInr(discount.maxPaise)}`
              : `Max ${policy.limitPercent}% · ${formatInr(discount.maxPaise)}`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove discount"
            onClick={discount.reset}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <Select
          value={discount.mode}
          onValueChange={(value) => discount.setMode(value as DiscountInputMode)}
        >
          <SelectTrigger className="w-20" aria-label="Discount type">
            <SelectValue>{() => (discount.mode === "amount" ? "₹" : "%")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="amount">₹</SelectItem>
            <SelectItem value="percent">%</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id={`${id}-discount`}
          inputMode="decimal"
          placeholder={discount.mode === "amount" ? "Amount" : "Percent"}
          value={discount.raw}
          onChange={(event) => discount.setRaw(event.target.value)}
          aria-invalid={discount.error !== null}
        />
      </div>
      {discount.paise > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            {formatInr(discount.paise)} off · {discountPercentLabel(discount.paise, discount.grossPaise)} of{" "}
            {formatInr(discount.grossPaise)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={discount.reason} onValueChange={(value) => discount.setReason(String(value))}>
              <SelectTrigger className="w-full" aria-label="Discount reason">
                <SelectValue>
                  {() => (discount.reason ? discountReasonLabel(discount.reason) : "Reason")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Discount note"
              placeholder={discount.reason === "other" ? "Note (required)" : "Note (optional)"}
              maxLength={DISCOUNT_NOTE_MAX}
              value={discount.note}
              onChange={(event) => discount.setNote(event.target.value)}
            />
          </div>
        </>
      ) : null}
      {discount.error ? <p className="text-xs text-destructive">{discount.error}</p> : null}
    </fieldset>
  );
}
