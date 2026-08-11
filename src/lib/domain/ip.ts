export function ipTotals(charges: readonly number[], payments: readonly number[]) {
  const totalPaise = charges.reduce((sum, value) => sum + value, 0);
  const paidPaise = payments.reduce((sum, value) => sum + value, 0);
  if (charges.some((value) => value < 0) || payments.some((value) => value <= 0)) throw new Error("Invalid IP financial entry");
  return { totalPaise, paidPaise, balancePaise: Math.max(0, totalPaise - paidPaise), settled: paidPaise >= totalPaise };
}
