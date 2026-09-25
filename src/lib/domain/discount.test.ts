import { describe, expect, it } from "vitest";
import {
  discountErrorMessage,
  discountInputToPaise,
  discountPercentLabel,
  maxDiscountPaise,
  splitCounterDiscount,
  validateDiscount,
} from "./discount";

const base = { grossPaise: 50000, unlimited: false, limitPercent: 10, reason: "staff", note: "" };

describe("maxDiscountPaise", () => {
  it("applies the staff limit with the database's integer rounding", () => {
    expect(maxDiscountPaise(50000, 10, false)).toBe(5000);
    // 10% of ₹333.33 is 3333.3 paise; the database accepts 3333, not 3334.
    expect(maxDiscountPaise(33333, 10, false)).toBe(3333);
  });
  it("lets admin discount the whole bill", () => {
    expect(maxDiscountPaise(50000, 10, true)).toBe(50000);
  });
  it("counts what was already discounted against the limit", () => {
    expect(maxDiscountPaise(50000, 10, false, 3000)).toBe(2000);
    expect(maxDiscountPaise(50000, 10, false, 6000)).toBe(0);
  });
  it("is zero for an empty bill", () => {
    expect(maxDiscountPaise(0, 100, true)).toBe(0);
  });
});

describe("discountInputToPaise", () => {
  it("reads rupees", () => {
    expect(discountInputToPaise("amount", "50.5", 0)).toEqual({ paise: 5050 });
    expect(discountInputToPaise("amount", "", 1000)).toEqual({ paise: 0 });
    expect(discountInputToPaise("amount", "-5", 1000).error).toBeTruthy();
  });
  it("reads a percentage of the bill, rounded to the paisa", () => {
    expect(discountInputToPaise("percent", "10", 50000)).toEqual({ paise: 5000 });
    expect(discountInputToPaise("percent", "12.5", 33333)).toEqual({ paise: 4167 });
    expect(discountInputToPaise("percent", "101", 50000).error).toBeTruthy();
    expect(discountInputToPaise("percent", "abc", 50000).error).toBeTruthy();
  });
});

describe("discountPercentLabel", () => {
  it("formats whole and fractional percentages", () => {
    expect(discountPercentLabel(5000, 50000)).toBe("10%");
    expect(discountPercentLabel(6250, 50000)).toBe("12.5%");
    expect(discountPercentLabel(0, 50000)).toBe("0%");
  });
});

describe("validateDiscount", () => {
  it("accepts no discount", () => {
    expect(validateDiscount({ ...base, paise: 0, maxPaise: 5000 })).toBeNull();
  });
  it("accepts exactly the limit", () => {
    expect(validateDiscount({ ...base, paise: 5000, maxPaise: 5000 })).toBeNull();
  });
  it("rejects over the limit with the limit in the message", () => {
    expect(validateDiscount({ ...base, paise: 5001, maxPaise: 5000 })).toBe("Maximum 10% discount allowed.");
  });
  it("rejects more than the bill", () => {
    expect(validateDiscount({ ...base, unlimited: true, paise: 50001, maxPaise: 50000 })).toMatch(/more than the bill/);
  });
  it("needs a known reason", () => {
    expect(validateDiscount({ ...base, reason: "", paise: 100, maxPaise: 5000 })).toMatch(/reason/);
    expect(validateDiscount({ ...base, reason: "friend", paise: 100, maxPaise: 5000 })).toMatch(/reason/);
  });
  it("needs a note for Other", () => {
    expect(validateDiscount({ ...base, reason: "other", note: " ", paise: 100, maxPaise: 5000 })).toMatch(/note/);
    expect(validateDiscount({ ...base, reason: "other", note: "Old patient", paise: 100, maxPaise: 5000 })).toBeNull();
  });
});

describe("splitCounterDiscount", () => {
  it("takes the discount off medicines first", () => {
    expect(splitCounterDiscount(300, 1000, 500)).toEqual({ medicinesPaise: 300, feePaise: 0 });
  });
  it("puts the remainder on the doctor fee", () => {
    expect(splitCounterDiscount(1300, 1000, 500)).toEqual({ medicinesPaise: 1000, feePaise: 300 });
  });
  it("never takes more from the fee than is owed", () => {
    expect(splitCounterDiscount(2000, 1000, 500)).toEqual({ medicinesPaise: 1000, feePaise: 500 });
  });
});

describe("discountErrorMessage", () => {
  it("explains a limit rejection", () => {
    expect(discountErrorMessage("discount exceeds limit of 15 percent")).toBe(
      "That discount is over the 15% limit set by admin.",
    );
  });
  it("ignores unrelated errors", () => {
    expect(discountErrorMessage("batch stock unavailable")).toBeNull();
  });
});
