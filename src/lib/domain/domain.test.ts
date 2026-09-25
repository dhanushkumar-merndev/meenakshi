import { describe, expect, it } from "vitest";
import { normalizeIndianPhone } from "./phone";
import { formatInr, paymentSummary, rupeesToPaise } from "./money";
import { batchAlertStatus, remainingPrescriptionQuantity, stockStatus } from "./stock";
import { formatTokenNumber } from "./date";
import { ipTotals } from "./ip";

describe("hospital domain rules", () => {
  it("normalizes Indian phone numbers to the final ten digits", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("9876543210");
    expect(() => normalizeIndianPhone("12345")).toThrow(/valid 10-digit/);
  });
  it("converts money without floating point storage", () => {
    expect(rupeesToPaise("500.25")).toBe(50025);
    expect(rupeesToPaise("0.05")).toBe(5);
    expect(formatInr(50000)).toContain("500");
  });
  it("derives append-only payment totals", () => {
    expect(paymentSummary(50000, [30000, 20000])).toMatchObject({ totalCollectedPaise: 50000, balancePaise: 0, status: "paid" });
    expect(paymentSummary(50000, [30000]).status).toBe("partially_paid");
    // A discount lowers the balance but is never counted as collected.
    expect(paymentSummary(50000, [45000], 5000)).toMatchObject({ totalCollectedPaise: 45000, balancePaise: 0, status: "paid" });
    expect(paymentSummary(50000, [], 5000)).toMatchObject({ totalCollectedPaise: 0, balancePaise: 45000, status: "partially_paid" });
    expect(paymentSummary(50000, [], 50000).status).toBe("paid");
  });
  it("calculates stock and partial dispensing", () => {
    expect(stockStatus(0, 10)).toBe("out_of_stock");
    expect(stockStatus(8, 10)).toBe("low_stock");
    expect(remainingPrescriptionQuantity(10, 6)).toBe(4);
    expect(batchAlertStatus(30, 10, "2026-09-23", "2026-09-24")).toBe("expired");
    expect(batchAlertStatus(0, 10, "2026-01-01", "2026-09-24")).toBe("expired");
    expect(batchAlertStatus(30, 10, "2026-09-24", "2026-09-24")).toBe("expiring_soon");
    expect(batchAlertStatus(30, 10, "2026-10-24", "2026-09-24")).toBe("expiring_soon");
    expect(batchAlertStatus(30, 10, "2026-10-25", "2026-09-24")).toBe("in_stock");
    expect(batchAlertStatus(5, 10, "2027-01-01", "2026-09-24")).toBe("low_stock");
    expect(() => remainingPrescriptionQuantity(10, 11)).toThrow();
  });
  it("rejects invalid tokens", () => {
    expect(formatTokenNumber(12)).toBe("12");
    expect(() => formatTokenNumber(0)).toThrow();
  });
  it("derives IP running total, paid amount, and balance", () => {
    expect(ipTotals([50000, 120000, 30000], [100000])).toEqual({ totalPaise: 200000, paidPaise: 100000, discountPaise: 0, balancePaise: 100000, settled: false });
    expect(ipTotals([200000], [180000], 20000)).toMatchObject({ balancePaise: 0, settled: true });
    expect(ipTotals([50000], [50000]).settled).toBe(true);
  });
});
