"use client";
import { useActionState, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { importMedicines } from "./actions";
import {
  MEDICINE_IMPORT_HEADERS,
  validateMedicineImportRows,
  type ImportErrorRow,
  type NormalizedMedicineImport,
} from "./import-schema";
import type { ActionState } from "@/types/hospital";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
const initial: ActionState = { ok: false };
const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
export function BulkMedicineImport() {
  const [state, action, pending] = useActionState(importMedicines, initial);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [valid, setValid] = useState<NormalizedMedicineImport[]>([]);
  const [invalid, setInvalid] = useState<ImportErrorRow[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const parseFile = async (file?: File) => {
    if (!file) return;
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
      });
      const checked = validateMedicineImportRows(rows);
      setFileName(file.name);
      setRawRows(rows);
      setValid(checked.valid);
      setInvalid(checked.invalid);
      setKey(crypto.randomUUID());
    } catch {
      setFileName(file.name);
      setRawRows([]);
      setValid([]);
      setInvalid([
        {
          row: 1,
          data: {},
          errors: [
            "The spreadsheet could not be read. Use the official template.",
          ],
        },
      ]);
    } finally {
      setParsing(false);
    }
  };
  const downloadErrors = () => {
    const header = [...MEDICINE_IMPORT_HEADERS, "row_number", "errors"];
    const content = [
      header.map(csvCell).join(","),
      ...invalid.map((entry) =>
        [
          ...MEDICINE_IMPORT_HEADERS.map((key) => entry.data[key]),
          entry.row,
          entry.errors.join("; "),
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "medicine-import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              1. Download official template
            </CardTitle>
            <CardDescription>
              Headers, example data, and instructions are included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              render={<a href="/api/pharmacy/import/template" />}
            >
              <Download /> Download Excel Template
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Upload Excel or CSV</CardTitle>
            <CardDescription>
              Maximum 1,000 medicine and batch rows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-5 text-center hover:bg-muted/60">
              <FileSpreadsheet className="mb-2 size-7 text-primary" />
              <span className="text-sm font-medium">
                Drag and drop or choose a file
              </span>
              <span className="text-xs text-muted-foreground">
                .xlsx or .csv
              </span>
              <Input
                className="sr-only"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(event) => parseFile(event.target.files?.[0])}
              />
            </label>
          </CardContent>
        </Card>
      </div>
      {parsing ? <Progress value={60} /> : null}
      {fileName ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Validation summary · {fileName}
            </CardTitle>
            <CardDescription>
              Rows are not imported until you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Rows in file</p>
                <p className="text-2xl font-semibold">{rawRows.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Valid</p>
                <p className="text-2xl font-semibold text-primary">
                  {valid.length}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Invalid</p>
                <p className="text-2xl font-semibold text-destructive">
                  {invalid.length}
                </p>
              </div>
            </div>
            {invalid.length ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Invalid rows will not be imported</AlertTitle>
                <AlertDescription>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={downloadErrors}
                  >
                    <Download /> Download Error Rows
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>All rows are valid</AlertTitle>
                <AlertDescription>
                  Review the preview, then confirm the transactional import.
                </AlertDescription>
              </Alert>
            )}
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Selling Price</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valid.slice(0, 100).map((row, index) => (
                    <TableRow
                      key={`${row.medicine_name}-${row.batch_number}-${index}`}
                    >
                      <TableCell>{index + 2}</TableCell>
                      <TableCell>{row.medicine_name}</TableCell>
                      <TableCell>{row.batch_number}</TableCell>
                      <TableCell>{row.expiry_date}</TableCell>
                      <TableCell>{row.opening_quantity}</TableCell>
                      <TableCell>
                        ₹{(row.selling_price_paise / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-primary">Valid</TableCell>
                    </TableRow>
                  ))}
                  {invalid.slice(0, 50).map((row) => (
                    <TableRow key={`invalid-${row.row}`}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell>
                        {String(row.data.medicine_name ?? "—")}
                      </TableCell>
                      <TableCell>
                        {String(row.data.batch_number ?? "—")}
                      </TableCell>
                      <TableCell>
                        {String(row.data.expiry_date ?? "—")}
                      </TableCell>
                      <TableCell>
                        {String(row.data.opening_quantity ?? "—")}
                      </TableCell>
                      <TableCell>
                        {String(row.data.selling_price ?? "—")}
                      </TableCell>
                      <TableCell className="max-w-72 text-destructive">
                        {row.errors.join("; ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {state.message ? (
              <Alert variant={state.ok ? "default" : "destructive"}>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}
            <form action={action} className="flex justify-end">
              <input type="hidden" name="fileName" value={fileName} />
              <input
                type="hidden"
                name="rows"
                value={JSON.stringify(rawRows)}
              />
              <input type="hidden" name="idempotencyKey" value={key} />
              <Button
                disabled={pending || invalid.length > 0 || valid.length === 0}
                type="submit"
              >
                {pending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Upload />
                )}{" "}
                Import {valid.length} Valid Rows
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
