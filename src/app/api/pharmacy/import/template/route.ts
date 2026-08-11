import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/auth/dal";
import { MEDICINE_IMPORT_HEADERS } from "@/features/pharmacy/import-schema";
export async function GET() {
  const profile = await getCurrentProfile();
  if (!["admin", "pharmacy"].includes(profile.role))
    return new Response("Forbidden", { status: 403 });
  const example = {
    medicine_name: "Paracetamol 500mg",
    generic_name: "Paracetamol",
    strength: "500 mg",
    dosage_form: "Tablet",
    manufacturer: "ABC Pharma",
    batch_number: "PCM-2026-A",
    expiry_date: "2027-08-31",
    opening_quantity: 500,
    purchase_price: 1.2,
    selling_price: 2,
    low_stock_threshold: 50,
    active: true,
  };
  const medicines = XLSX.utils.json_to_sheet([example], {
    header: [...MEDICINE_IMPORT_HEADERS],
  });
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Meenakshi Hospital Medicine Import"],
    [
      "Required columns",
      "medicine_name, dosage_form, batch_number, expiry_date, opening_quantity, selling_price",
    ],
    ["expiry_date", "YYYY-MM-DD"],
    ["opening_quantity", "Whole number >= 0"],
    ["prices", "INR decimal values"],
    ["active", "TRUE or FALSE"],
    ["limit", "Maximum 1,000 data rows per import"],
    ["existing batches", "Opening quantity is added only after confirmation"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, medicines, "Medicines");
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename=meenakshi-medicine-import-template.xlsx",
      "Cache-Control": "private, no-store",
    },
  });
}
