/**
 * Reconciles quantities selected in a single counter transaction against the
 * stock that is visible right now. This is only a UI guardrail: the database
 * remains the source of truth and locks stock when the pharmacist confirms.
 */
export type StockAllocationLine = {
  /** A batch/catalogue key, or null for a non-stock-tracked line. */
  stockKey: string | null;
  requestedQuantity: number;
  selectedQuantity: number;
};

export type StockAllocation = {
  /** Quantity that can be supplied from this row's selected stock source now. */
  availableNow: number | null;
  /** The selected quantity after it is capped to request and visible stock. */
  selectedQuantity: number;
  /** Requested quantity that will not be supplied by this transaction. */
  notSuppliedQuantity: number;
};

function wholeNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Allocates each selected stock source in row order, so selecting the same
 * batch/catalogue item on two rows cannot make the counter UI promise more
 * than the current visible quantity. A null stock key deliberately stays
 * unbounded by stock: callers use that for an explicit manual/off-catalog
 * item, not for a stock reservation.
 */
export function allocateVisibleStock(
  lines: readonly StockAllocationLine[],
  availableByStockKey: Readonly<Record<string, number>>,
): StockAllocation[] {
  const usedByStockKey: Record<string, number> = {};

  return lines.map((line) => {
    const requestedQuantity = wholeNonNegative(line.requestedQuantity);
    const selectedQuantity = wholeNonNegative(line.selectedQuantity);
    const stockKey = line.stockKey;

    if (!stockKey || !(stockKey in availableByStockKey)) {
      const selected = Math.min(requestedQuantity, selectedQuantity);
      return {
        availableNow: null,
        selectedQuantity: selected,
        notSuppliedQuantity: requestedQuantity - selected,
      };
    }

    const totalAvailable = wholeNonNegative(availableByStockKey[stockKey]);
    const availableNow = Math.max(
      0,
      totalAvailable - (usedByStockKey[stockKey] ?? 0),
    );
    const selected = Math.min(requestedQuantity, selectedQuantity, availableNow);
    usedByStockKey[stockKey] =
      (usedByStockKey[stockKey] ?? 0) + selected;

    return {
      availableNow,
      selectedQuantity: selected,
      notSuppliedQuantity: requestedQuantity - selected,
    };
  });
}
