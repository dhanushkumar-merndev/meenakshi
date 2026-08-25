import { describe, expect, it } from "vitest";
import { allocateVisibleStock } from "./stock-allocation";

describe("allocateVisibleStock", () => {
  it("caps rows that choose the same stock source without reserving it", () => {
    expect(
      allocateVisibleStock(
        [
          { stockKey: "batch-a", requestedQuantity: 6, selectedQuantity: 6 },
          { stockKey: "batch-a", requestedQuantity: 5, selectedQuantity: 5 },
        ],
        { "batch-a": 8 },
      ),
    ).toEqual([
      { availableNow: 8, selectedQuantity: 6, notSuppliedQuantity: 0 },
      { availableNow: 2, selectedQuantity: 2, notSuppliedQuantity: 3 },
    ]);
  });

  it("keeps explicit manual lines out of stock allocation", () => {
    expect(
      allocateVisibleStock(
        [{ stockKey: null, requestedQuantity: 4, selectedQuantity: 4 }],
        {},
      ),
    ).toEqual([
      { availableNow: null, selectedQuantity: 4, notSuppliedQuantity: 0 },
    ]);
  });

  it("normalizes invalid quantities to a safe requested/supplied split", () => {
    expect(
      allocateVisibleStock(
        [{ stockKey: "batch-a", requestedQuantity: 3.8, selectedQuantity: 9 }],
        { "batch-a": 2.9 },
      ),
    ).toEqual([
      { availableNow: 2, selectedQuantity: 2, notSuppliedQuantity: 1 },
    ]);
  });
});
