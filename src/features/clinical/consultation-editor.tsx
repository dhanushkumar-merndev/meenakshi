"use client";
import { useActionState, useEffect, useState } from "react";
import { FileCheck2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { saveConsultation, startConsultation } from "./actions";
import { MedicineCombobox } from "./medicine-combobox";
import { DiagnosisPicker } from "./diagnosis-picker";
import type { ActionState } from "@/types/hospital";
import { DatePickerField } from "@/components/shared/date-picker-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { calculatePrescriptionQuantity } from "@/lib/domain/medicine-quantity";
import {
  DURATION_PRESETS,
  FREQUENCY_PRESETS,
  NOTES_PRESETS,
  PresetSelect,
  ROUTE_PRESETS,
} from "./preset-select";

type MedicineLine = {
  key: string;
  medicine_id?: string;
  medicine_name: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  notes: string;
  quantity: number;
  quantityAuto: boolean;
};
type SavedMedicineLine = Omit<MedicineLine, "key" | "quantityAuto">;
type TestLine = { key: string; test_name: string; notes: string };
type InitialConsultation = {
  symptoms?: string | null;
  history?: string | null;
  examination?: string | null;
  assessment?: string | null;
  advice?: string | null;
  follow_up_type?: string;
  follow_up_date?: string | null;
  follow_up_days?: number | null;
  admission_recommended?: boolean | null;
  admission_ward_type?: string | null;
  admission_reason?: string | null;
};
const initialState: ActionState = { ok: false };
const newMedicine = (): MedicineLine => ({
  key: crypto.randomUUID(),
  medicine_name: "",
  dose: "",
  frequency: "BD (1-0-1)",
  duration: "3 days",
  route: "Oral",
  notes: "After food",
  quantity: 1,
  quantityAuto: true,
});

export function ConsultationEditor({
  visitId,
  initial,
  initialMedicines = [],
  initialTests = [],
  defaultFee,
}: {
  visitId: string;
  initial?: InitialConsultation;
  initialMedicines?: SavedMedicineLine[];
  initialTests?: Omit<TestLine, "key">[];
  /** Doctor's configured fee in rupees, pre-filled but always editable. */
  defaultFee?: string;
}) {
  const [state, action, pending] = useActionState(
    saveConsultation,
    initialState,
  );

  // Opening the patient is what puts them "in consultation": the doctor is with
  // them from this moment, and reception and the OP desk need to see that
  // without waiting for a draft to be saved. The RPC ignores a visit that is
  // already in progress, completed or cancelled, so this is safe to re-run.
  useEffect(() => {
    void startConsultation(visitId);
  }, [visitId]);
  const [medicines, setMedicines] = useState<MedicineLine[]>(
    initialMedicines.map((line) => ({
      ...line,
      key: crypto.randomUUID(),
      quantityAuto: false,
    })),
  );
  const [tests, setTests] = useState<TestLine[]>(
    initialTests.map((line) => ({ ...line, key: crypto.randomUUID() })),
  );
  const [admissionRecommended, setAdmissionRecommended] = useState(
    initial?.admission_recommended ?? false,
  );
  const [wardType, setWardType] = useState(
    initial?.admission_ward_type ?? "general",
  );
  const [followUp, setFollowUp] = useState(initial?.follow_up_type ?? "none");
  const [followUpDate, setFollowUpDate] = useState(
    initial?.follow_up_date ?? "",
  );
  const updateMedicine = (key: string, patch: Partial<MedicineLine>) =>
    setMedicines((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        const dosageChanged = ["dose", "frequency", "duration"].some((field) =>
          Object.prototype.hasOwnProperty.call(patch, field),
        );
        if (dosageChanged && row.quantityAuto) {
          const suggested = calculatePrescriptionQuantity(next);
          if (suggested !== null) next.quantity = suggested;
        }
        return next;
      }),
    );
  if (state.data?.completed)
    return (
      <Alert>
        <FileCheck2 />
        <AlertDescription>
          Consultation completed. The historical medical record is now
          read-only.
        </AlertDescription>
      </Alert>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="visitId" value={visitId} />
      <input
        type="hidden"
        name="medicines"
        value={JSON.stringify(
          medicines.map((line) => ({
            medicine_id: line.medicine_id,
            medicine_name: line.medicine_name,
            dose: line.dose,
            frequency: line.frequency,
            duration: line.duration,
            route: line.route,
            notes: line.notes,
            quantity: line.quantity,
          })),
        )}
      />
      <input
        type="hidden"
        name="tests"
        value={JSON.stringify(
          tests.map((line) => ({
            test_name: line.test_name,
            notes: line.notes,
          })),
        )}
      />
      <input type="hidden" name="followUpType" value={followUp} />
      {state.message ? (
        <Alert variant={state.ok ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clinical notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="symptoms">Symptoms / Chief Complaint</Label>
            <Textarea
              id="symptoms"
              name="symptoms"
              defaultValue={initial?.symptoms ?? ""}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="history">History / Notes</Label>
            <Textarea
              id="history"
              name="history"
              defaultValue={initial?.history ?? ""}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="examination">Examination</Label>
            <Textarea
              id="examination"
              name="examination"
              defaultValue={initial?.examination ?? ""}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Assessment / Diagnosis <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DiagnosisPicker name="assessment" initialValue={initial?.assessment ?? ""} />
          <p className="text-xs text-muted-foreground">
            Search by name or ICD-10 code. Anything without a coded match can
            still be added exactly as typed.
          </p>
          <p className="text-xs text-destructive">
            {state.fieldErrors?.assessment?.[0]}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Medicines</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMedicines((rows) => [...rows, newMedicine()])}
          >
            <Plus /> Add Medicine
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-60">Medicine</TableHead>
                  <TableHead>Dose</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicines.length ? (
                  medicines.map((row) => {
                    const suggestedQuantity = calculatePrescriptionQuantity(row);
                    return (
                      <TableRow key={row.key}>
                      <TableCell>
                        <MedicineCombobox
                          value={row}
                          onChange={(value) => updateMedicine(row.key, value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.dose}
                          onChange={(e) =>
                            updateMedicine(row.key, { dose: e.target.value })
                          }
                          placeholder="1 tablet"
                        />
                      </TableCell>
                      <TableCell>
                        <PresetSelect
                          ariaLabel="Frequency"
                          presets={FREQUENCY_PRESETS}
                          value={row.frequency}
                          onChange={(frequency) =>
                            updateMedicine(row.key, { frequency })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <PresetSelect
                          ariaLabel="Duration"
                          presets={DURATION_PRESETS}
                          value={row.duration}
                          onChange={(duration) =>
                            updateMedicine(row.key, { duration })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <PresetSelect
                          ariaLabel="Route"
                          presets={ROUTE_PRESETS}
                          value={row.route}
                          onChange={(route) => updateMedicine(row.key, { route })}
                        />
                      </TableCell>
                      <TableCell>
                        <PresetSelect
                          ariaLabel="Notes"
                          presets={NOTES_PRESETS}
                          value={row.notes}
                          onChange={(notes) => updateMedicine(row.key, { notes })}
                        />
                      </TableCell>
                      <TableCell className="min-w-28">
                        <Input
                          className="w-20"
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateMedicine(row.key, {
                              quantity: Math.max(1, Number(e.target.value)),
                              quantityAuto: false,
                            })
                          }
                        />
                        {suggestedQuantity === null ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Enter manually
                          </p>
                        ) : row.quantityAuto && row.quantity === suggestedQuantity ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Auto: {suggestedQuantity}
                          </p>
                        ) : (
                          <Button
                            type="button"
                            size="xs"
                            variant="link"
                            className="mt-1 h-auto px-0 text-[11px]"
                            onClick={() =>
                              updateMedicine(row.key, {
                                quantity: suggestedQuantity,
                                quantityAuto: true,
                              })
                            }
                          >
                            Use suggested {suggestedQuantity}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove medicine"
                          onClick={() =>
                            setMedicines((rows) =>
                              rows.filter((item) => item.key !== row.key),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-20 text-center text-muted-foreground"
                    >
                      No medicines added. Prescribing does not change pharmacy
                      stock.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Investigations / Tests</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setTests((rows) => [
                ...rows,
                { key: crypto.randomUUID(), test_name: "", notes: "" },
              ])
            }
          >
            <Plus /> Add Test
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {tests.map((row) => (
            <div
              className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              key={row.key}
            >
              <Input
                placeholder="Test name"
                value={row.test_name}
                onChange={(e) =>
                  setTests((rows) =>
                    rows.map((item) =>
                      item.key === row.key
                        ? { ...item, test_name: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Input
                placeholder="Notes"
                value={row.notes}
                onChange={(e) =>
                  setTests((rows) =>
                    rows.map((item) =>
                      item.key === row.key
                        ? { ...item, notes: e.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove test"
                onClick={() =>
                  setTests((rows) =>
                    rows.filter((item) => item.key !== row.key),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advice & Follow-up</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="advice">Advice</Label>
            <Textarea
              id="advice"
              name="advice"
              defaultValue={initial?.advice ?? ""}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Follow-up</Label>
            <Select
              value={followUp}
              onValueChange={(value) => setFollowUp(value as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No follow-up</SelectItem>
                <SelectItem value="after_report">After report</SelectItem>
                <SelectItem value="specific_date">Specific date</SelectItem>
                <SelectItem value="after_days">After number of days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {followUp === "specific_date" ? (
            <div className="space-y-2">
              <Label htmlFor="follow-date">Date</Label>
              <DatePickerField
                id="follow-date"
                name="followUpDate"
                value={followUpDate}
                onValueChange={setFollowUpDate}
                placeholder="Select follow-up date"
              />
            </div>
          ) : null}
          {followUp === "after_days" ? (
            <div className="space-y-2">
              <Label htmlFor="follow-days">Days</Label>
              <Input
                id="follow-days"
                name="followUpDays"
                type="number"
                min={1}
                defaultValue={initial?.follow_up_days ?? 7}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">IP Admission</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="hidden"
            name="admissionRecommended"
            value={admissionRecommended ? "on" : ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={admissionRecommended}
              onCheckedChange={(checked) =>
                setAdmissionRecommended(checked === true)
              }
            />
            Recommend this patient for IP admission
          </label>
          {admissionRecommended ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ward-type">
                  Ward type <span className="text-destructive">*</span>
                </Label>
                <input type="hidden" name="admissionWardType" value={wardType} />
                <Select
                  value={wardType}
                  onValueChange={(value) => setWardType(String(value))}
                >
                  <SelectTrigger id="ward-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Ward</SelectItem>
                    <SelectItem value="private">Private Room</SelectItem>
                    <SelectItem value="icu">ICU</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  IP staff assign the actual room and bed.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admission-reason">Reason for admission</Label>
                <Textarea
                  id="admission-reason"
                  name="admissionReason"
                  defaultValue={initial?.admission_reason ?? ""}
                  rows={3}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consultation Fee</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="consultation-fee">
              Fee (₹) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="consultation-fee"
              name="fee"
              inputMode="decimal"
              placeholder="500"
              defaultValue={defaultFee ?? ""}
              aria-describedby="consultation-fee-help"
            />
            <p
              id="consultation-fee-help"
              className="text-xs text-muted-foreground"
            >
              Required to complete. Collected at the pharmacy counter, not here.
              Enter 0 for a free follow-up.
            </p>
            {state.fieldErrors?.fee ? (
              <p className="text-xs text-destructive">
                {state.fieldErrors.fee[0]}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          disabled={pending}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <Save />} Save
          Draft
        </Button>
        <Button
          type="submit"
          name="intent"
          value="complete"
          disabled={pending}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <FileCheck2 />}{" "}
          Complete Consultation
        </Button>
      </div>
    </form>
  );
}
