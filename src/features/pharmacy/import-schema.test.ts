import { describe, expect, it } from "vitest";
import { validateMedicineImportRows } from "./import-schema";

const row = { medicine_name: "Paracetamol 500mg", generic_name: "Paracetamol", strength: "500 mg", dosage_form: "Tablet", manufacturer: "ABC Pharma", batch_number: "PCM-A", expiry_date: "2027-08-31", opening_quantity: 500, purchase_price: "1.20", selling_price: "2.00", low_stock_threshold: 50, active: true };
describe("medicine import validation", () => {
  it("normalizes a valid spreadsheet row to paise", () => { const result = validateMedicineImportRows([row]); expect(result.invalid).toHaveLength(0); expect(result.valid[0]).toMatchObject({ purchase_price_paise: 120, selling_price_paise: 200, opening_quantity: 500 }); });
  it("rejects impossible dates and normalized duplicate batches", () => { const result = validateMedicineImportRows([{ ...row, expiry_date: "2027-02-31" }, row, { ...row, medicine_name: "  paracetamol   500MG ", batch_number: "pcm-a" }]); expect(result.invalid[0].errors).toContain("expiry_date must be YYYY-MM-DD"); expect(result.invalid[1].errors).toContain("duplicate medicine and batch in this file"); });
  it("imports no more than 1000 rows from one file", () => { const result = validateMedicineImportRows(Array.from({ length: 1001 }, (_, index) => ({ ...row, batch_number: `B-${index}` }))); expect(result.valid).toHaveLength(1000); expect(result.invalid.at(-1)?.errors[0]).toMatch(/1,000/); });
});
