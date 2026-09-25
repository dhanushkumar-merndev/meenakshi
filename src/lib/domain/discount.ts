import { rupeesToPaise } from "./money";

/**
 * Discounts reduce what a patient owes; they are never money received.
 *
 * The database (discount_assert_allowed) is authoritative for every rule here.
 * These mirror it so a dialog can explain a problem before submitting, and
 * so both sides round the same way.
 */

export const DISCOUNT_REASONS = [
  { value: "senior_citizen", label: "Senior citizen" },
  { value: "staff", label: "Staff" },
  { value: "doctor_advised", label: "Doctor advised" },
  { value: "charity", label: "Charity" },
  { value: "round_off", label: "Round-off" },
  { value: "other", label: "Other" },
] as const;

export type DiscountReason = (typeof DISCOUNT_REASONS)[number]["value"];

export const DISCOUNT_REASON_VALUES = DISCOUNT_REASONS.map((reason) => reason.value) as [
  DiscountReason,
  ...DiscountReason[],
];

export function discountReasonLabel(reason: string | null | undefined) {
  return DISCOUNT_REASONS.find((entry) => entry.value === reason)?.label ?? reason ?? "";
}

/** Where a discount was given, grouped the way the analytics report it. */
export const DISCOUNT_SOURCE_LABELS: Record<string, string> = {
  op_fee: "OP visit fee",
  pharmacy_sale: "Pharmacy sale",
  ip_ticket: "IP bill",
  ip_counter: "IP items (counter)",
  procedure: "Procedure bill",
};

export const DISCOUNT_NOTE_MAX = 300;

export type DiscountInputMode = "amount" | "percent";

/**
 * Largest discount allowed on a bill of `grossPaise`.
 *
 * Matches the database's integer check `amount * 100 <= limit * gross`, so a
 * value accepted here is never rejected there for rounding.
 */
export function maxDiscountPaise(
  grossPaise: number,
  limitPercent: number,
  unlimited: boolean,
  alreadyDiscountedPaise = 0,
) {
  if (grossPaise <= 0) return 0;
  const ceiling = unlimited ? grossPaise : Math.floor((grossPaise * limitPercent) / 100);
  return Math.max(0, ceiling - alreadyDiscountedPaise);
}

/** Parses what was typed into paise. Empty input is no discount. */
export function discountInputToPaise(
  mode: DiscountInputMode,
  raw: string,
  grossPaise: number,
): { paise: number; error?: string } {
  const value = raw.trim();
  if (!value) return { paise: 0 };
  if (mode === "amount") {
    try {
      return { paise: rupeesToPaise(value) };
    } catch {
      return { paise: 0, error: "Enter a valid amount." };
    }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { paise: 0, error: "Enter a valid percentage." };
  const percent = Number(value);
  if (percent > 100) return { paise: 0, error: "A discount cannot exceed 100%." };
  return { paise: Math.round((grossPaise * percent) / 100) };
}

/** "10%" or "12.5%" of the bill, for display only. */
export function discountPercentLabel(amountPaise: number, grossPaise: number) {
  if (grossPaise <= 0 || amountPaise <= 0) return "0%";
  const percent = (amountPaise * 100) / grossPaise;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

export function validateDiscount({
  paise,
  maxPaise,
  grossPaise,
  reason,
  note,
  unlimited,
  limitPercent,
}: {
  paise: number;
  maxPaise: number;
  grossPaise: number;
  reason: string;
  note: string;
  unlimited: boolean;
  limitPercent: number;
}): string | null {
  if (paise <= 0) return null;
  if (paise > grossPaise) return "Discount cannot be more than the bill.";
  if (paise > maxPaise)
    return unlimited
      ? "Discount cannot be more than the amount due."
      : `Maximum ${limitPercent}% discount allowed.`;
  if (!DISCOUNT_REASON_VALUES.includes(reason as DiscountReason)) return "Choose a discount reason.";
  if (reason === "other" && !note.trim()) return "Add a note for the discount.";
  if (note.length > DISCOUNT_NOTE_MAX) return `Keep the note under ${DISCOUNT_NOTE_MAX} characters.`;
  return null;
}

/**
 * How one counter discount is shared at pharmacy dispensing: medicines first,
 * then the doctor fee. Mirrors dispense_prescription.
 */
export function splitCounterDiscount(
  discountPaise: number,
  medicinesPaise: number,
  feePaise: number,
) {
  const medicines = Math.min(discountPaise, medicinesPaise);
  const fee = Math.min(discountPaise - medicines, feePaise);
  return { medicinesPaise: medicines, feePaise: fee };
}

/** A staff-facing sentence for a database discount rejection, or null. */
export function discountErrorMessage(message: string): string | null {
  const limit = message.match(/discount exceeds limit of (\d+) percent/);
  if (limit) return `That discount is over the ${limit[1]}% limit set by admin.`;
  if (message.includes("discount exceeds bill amount"))
    return "The discount cannot be more than the bill.";
  if (message.includes("discount reason required")) return "Choose a discount reason.";
  if (message.includes("discount note required")) return "Add a note for this discount.";
  if (message.includes("discount note too long")) return "The discount note is too long.";
  if (message.includes("invalid discount amount")) return "Enter a valid discount.";
  if (message.includes("IP pharmacy is billed on the ticket"))
    return "IP medicines are billed on the IP ticket; give the discount on the IP bill.";
  if (message.includes("procedure is billed on the IP ticket"))
    return "This procedure is billed on the patient's IP ticket; give the discount on the IP bill.";
  if (message.includes("discount requires pharmacy counter collection"))
    return "A discount can only be given when collecting at the counter.";
  return null;
}
