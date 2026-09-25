/** Discounts settle part of the bill but are never counted as paid. */
export function ipTotals(charges: readonly number[], payments: readonly number[], discountPaise = 0) {
  const totalPaise = charges.reduce((sum, value) => sum + value, 0);
  const paidPaise = payments.reduce((sum, value) => sum + value, 0);
  if (charges.some((value) => value < 0) || payments.some((value) => value <= 0) || discountPaise < 0) throw new Error("Invalid IP financial entry");
  return {
    totalPaise,
    paidPaise,
    discountPaise,
    balancePaise: Math.max(0, totalPaise - discountPaise - paidPaise),
    settled: paidPaise + discountPaise >= totalPaise,
  };
}
