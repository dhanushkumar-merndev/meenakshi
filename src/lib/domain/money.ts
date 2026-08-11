export function rupeesToPaise(value: string | number) {
  const normalized = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a valid non-negative amount with up to 2 decimals.");
  }
  const [rupees, fraction = ""] = normalized.split(".");
  return Number.parseInt(rupees, 10) * 100 + Number.parseInt(fraction.padEnd(2, "0") || "0", 10);
}

export function formatInr(paise: number | bigint) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(paise) / 100);
}

export function paymentSummary(totalDuePaise: number, payments: readonly number[]) {
  const totalCollectedPaise = payments.reduce((sum, item) => sum + item, 0);
  const balancePaise = Math.max(0, totalDuePaise - totalCollectedPaise);
  const status = totalCollectedPaise === 0 ? "unpaid" : balancePaise === 0 ? "paid" : "partially_paid";
  return { totalDuePaise, totalCollectedPaise, balancePaise, status } as const;
}
