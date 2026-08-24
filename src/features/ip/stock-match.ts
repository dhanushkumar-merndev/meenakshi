export type IpStockOption = {
  stock_type: "inventory" | "medicine";
  stock_id: string;
  name: string;
  detail: string | null;
  unit: string | null;
  selling_price_paise: number;
  pack_price_paise: number | null;
  units_per_pack: number;
  quantity: number;
  price_tiers: Array<{
    quantity: number;
    pack_price_paise: number;
    units_per_pack: number;
  }> | null;
};

function normalizeStockName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Mirrors the database's FEFO pack-price calculation for the live preview. */
export function calculateIpStockAmount(
  option: IpStockOption,
  quantity: number,
) {
  if (quantity <= 0) return 0;
  if (option.stock_type === "inventory" || !option.price_tiers?.length)
    return quantity * option.selling_price_paise;

  let remaining = quantity;
  let total = 0;
  for (const tier of option.price_tiers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(tier.quantity));
    total += Math.round(
      (take * Number(tier.pack_price_paise))
      / Math.max(1, Number(tier.units_per_pack)),
    );
    remaining -= take;
  }
  return remaining > 0 ? 0 : total;
}

/**
 * Exact normalized names are safe to auto-select. A unique prefix match is
 * also useful for requests such as "Calpol" -> "Calpol Syrup"; ambiguous
 * matches stay unselected so pharmacy remains in control.
 */
export function findIpStockMatch(
  requestedName: string,
  options: IpStockOption[],
) {
  const requested = normalizeStockName(requestedName);
  if (!requested) return undefined;

  const exact = options.find(
    (option) => normalizeStockName(option.name) === requested,
  );
  if (exact) return exact;

  const prefix = options.filter((option) => {
    const candidate = normalizeStockName(option.name);
    return candidate.startsWith(`${requested} `) || requested.startsWith(`${candidate} `);
  });
  return prefix.length === 1 ? prefix[0] : undefined;
}
