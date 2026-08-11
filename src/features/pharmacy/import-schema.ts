import { rupeesToPaise } from "@/lib/domain/money";

export const MEDICINE_IMPORT_HEADERS = [
  "medicine_name",
  "generic_name",
  "strength",
  "dosage_form",
  "manufacturer",
  "batch_number",
  "expiry_date",
  "opening_quantity",
  "purchase_price",
  "selling_price",
  "low_stock_threshold",
  "active",
] as const;
export type NormalizedMedicineImport = {
  medicine_name: string;
  generic_name: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  batch_number: string;
  expiry_date: string;
  opening_quantity: number;
  purchase_price_paise: number | null;
  selling_price_paise: number;
  low_stock_threshold: number;
  active: boolean;
};
export type ImportErrorRow = {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
};
const text = (value: unknown) => String(value ?? "").trim();
const booleanValue = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["true", "yes", "1", "active"].includes(normalized)) return true;
  if (["false", "no", "0", "inactive"].includes(normalized)) return false;
  throw new Error("active must be TRUE or FALSE");
};
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function validateMedicineImportRows(input: unknown[]): {
  valid: NormalizedMedicineImport[];
  invalid: ImportErrorRow[];
} {
  const valid: NormalizedMedicineImport[] = [];
  const invalid: ImportErrorRow[] = [];
  const identities = new Set<string>();
  input.slice(0, 1000).forEach((source, index) => {
    const data = (source && typeof source === "object" ? source : {}) as Record<
      string,
      unknown
    >;
    const errors: string[] = [];
    const medicine_name = text(data.medicine_name);
    const dosage_form = text(data.dosage_form);
    const batch_number = text(data.batch_number);
    const expiry_date = text(data.expiry_date);
    const opening_quantity = Number(data.opening_quantity);
    const selling = text(data.selling_price);
    const threshold =
      text(data.low_stock_threshold) === ""
        ? 10
        : Number(data.low_stock_threshold);
    if (!medicine_name) errors.push("medicine_name is required");
    if (!dosage_form) errors.push("dosage_form is required");
    if (!batch_number) errors.push("batch_number is required");
    if (!validDate(expiry_date)) errors.push("expiry_date must be YYYY-MM-DD");
    if (!Number.isInteger(opening_quantity) || opening_quantity < 0)
      errors.push("opening_quantity must be a whole number >= 0");
    if (!Number.isInteger(threshold) || threshold < 0)
      errors.push("low_stock_threshold must be a whole number >= 0");
    let selling_price_paise = 0;
    let purchase_price_paise: number | null = null;
    let active = true;
    try {
      selling_price_paise = rupeesToPaise(selling);
    } catch {
      errors.push("selling_price must be a non-negative INR amount");
    }
    if (text(data.purchase_price) !== "") {
      try {
        purchase_price_paise = rupeesToPaise(text(data.purchase_price));
      } catch {
        errors.push("purchase_price must be a non-negative INR amount");
      }
    }
    try {
      active = booleanValue(
        data.active === "" || data.active == null ? true : data.active,
      );
    } catch (error) {
      errors.push((error as Error).message);
    }
    const identity = [
      medicine_name,
      text(data.generic_name),
      text(data.strength),
      dosage_form,
      batch_number,
    ]
      .map((part) => part.toLowerCase().replace(/\s+/g, " ").trim())
      .join("|");
    if (identities.has(identity))
      errors.push("duplicate medicine and batch in this file");
    identities.add(identity);
    if (errors.length) {
      invalid.push({ row: index + 2, data, errors });
      return;
    }
    valid.push({
      medicine_name,
      generic_name: text(data.generic_name),
      strength: text(data.strength),
      dosage_form,
      manufacturer: text(data.manufacturer),
      batch_number,
      expiry_date,
      opening_quantity,
      purchase_price_paise,
      selling_price_paise,
      low_stock_threshold: threshold,
      active,
    });
  });
  if (input.length > 1000)
    invalid.push({
      row: 1002,
      data: {},
      errors: ["Maximum 1,000 data rows per upload"],
    });
  return { valid, invalid };
}
