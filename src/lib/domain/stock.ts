export function stockStatus(quantity: number, lowStockThreshold: number) {
  if (quantity <= 0) return "out_of_stock" as const;
  if (quantity <= lowStockThreshold) return "low_stock" as const;
  return "in_stock" as const;
}

const EXPIRING_SOON_DAYS = 30;

/**
 * Batch alert for the stock table. Expiry outranks quantity: an expired batch
 * cannot be dispensed however many units are on the shelf. The 30-day window
 * matches the dashboard's "Expiring Soon" count. Dates are YYYY-MM-DD strings,
 * so they compare lexically; `today` must be the hospital-timezone date.
 */
export function batchAlertStatus(
  quantity: number,
  lowStockThreshold: number,
  expiryDate: string,
  today: string,
) {
  if (expiryDate < today) return "expired" as const;
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + EXPIRING_SOON_DAYS);
  if (quantity > 0 && expiryDate <= soon.toISOString().slice(0, 10)) return "expiring_soon" as const;
  return stockStatus(quantity, lowStockThreshold);
}

export function remainingPrescriptionQuantity(requested: number, dispensed: number) {
  if (requested < 0 || dispensed < 0 || dispensed > requested) {
    throw new Error("Dispensed quantity must be between zero and requested quantity.");
  }
  return requested - dispensed;
}
