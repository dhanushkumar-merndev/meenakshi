import { describe, expect, it } from "vitest";
import {
  calculateIpStockAmount,
  findIpStockMatch,
  type IpStockOption,
} from "./stock-match";

const option = (name: string, stock_id: string): IpStockOption => ({
  stock_type: "medicine",
  stock_id,
  name,
  detail: null,
  unit: "Tablet",
  selling_price_paise: 1400,
  pack_price_paise: 1400,
  units_per_pack: 1,
  quantity: 20,
  price_tiers: [{ quantity: 20, pack_price_paise: 1400, units_per_pack: 1 }],
});

describe("IP stock auto-match", () => {
  const options = [
    option("Pan 40", "pan"),
    option("Calpol Syrup", "calpol"),
  ];

  it("matches punctuation and case-insensitively", () => {
    expect(findIpStockMatch(" PAN-40 ", options)?.stock_id).toBe("pan");
  });

  it("calculates medicine pack pricing across FEFO batches", () => {
    const medicine = {
      ...option("Syrup", "syrup"),
      selling_price_paise: 132,
      pack_price_paise: 4500,
      units_per_pack: 34,
      price_tiers: [
        { quantity: 1, pack_price_paise: 4500, units_per_pack: 34 },
        { quantity: 10, pack_price_paise: 5000, units_per_pack: 34 },
      ],
    };
    expect(calculateIpStockAmount(medicine, 2)).toBe(279);
  });

  it("uses a unique name prefix", () => {
    expect(findIpStockMatch("Calpol", options)?.stock_id).toBe("calpol");
  });

  it("does not guess an unrelated item", () => {
    expect(findIpStockMatch("unknown item", options)).toBeUndefined();
  });
});
