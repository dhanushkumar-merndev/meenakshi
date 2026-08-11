"use client";
import { useActionState, useState } from "react";
import { FileCheck2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { saveConsultation } from "./actions";
import { MedicineCombobox } from "./medicine-combobox";
import type { ActionState } from "@/types/hospital";
import { DatePickerField } from "@/components/shared/date-picker-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};
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
};
const initialState: ActionState = { ok: false };
const newMedicine = (): MedicineLine => ({
  key: crypto.randomUUID(),
  medicine_name: "",
  dose: "",
  frequency: "1-0-1",
  duration: "3 days",
  route: "Oral",
  notes: "After food",
  quantity: 1,
});

export function ConsultationEditor({
  visitId,
  initial,
  initialMedicines = [],
  initialTests = [],
}: {
  visitId: string;
  initial?: InitialConsultation;
  initialMedicines?: Omit<MedicineLine, "key">[];
  initialTests?: Omit<TestLine, "key">[];
}) {
  const [state, action, pending] = useActionState(
    saveConsultation,
    initialState,
  );
  const [medicines, setMedicines] = useState<MedicineLine[]>(
    initialMedicines.map((line) => ({ ...line, key: crypto.randomUUID() })),
  );
  const [tests, setTests] = useState<TestLine[]>(
    initialTests.map((line) => ({ ...line, key: crypto.randomUUID() })),
  );
  const [followUp, setFollowUp] = useState(initial?.follow_up_type ?? "none");
  const [followUpDate, setFollowUpDate] = useState(
    initial?.follow_up_date ?? "",
  );
  const updateMedicine = (key: string, patch: Partial<MedicineLine>) =>
    setMedicines((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
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
          <div className="space-y-2">
            <Label htmlFor="assessment">Assessment / Diagnosis *</Label>
            <Textarea
              id="assessment"
              name="assessment"
              defaultValue={initial?.assessment ?? ""}
              rows={3}
              required
            />
            <p className="text-xs text-destructive">
              {state.fieldErrors?.assessment?.[0]}
            </p>
          </div>
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
                  medicines.map((row) => (
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
                        <Input
                          value={row.frequency}
                          onChange={(e) =>
                            updateMedicine(row.key, {
                              frequency: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.duration}
                          onChange={(e) =>
                            updateMedicine(row.key, {
                              duration: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.route}
                          onChange={(e) =>
                            updateMedicine(row.key, { route: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.notes}
                          onChange={(e) =>
                            updateMedicine(row.key, { notes: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-20"
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateMedicine(row.key, {
                              quantity: Math.max(1, Number(e.target.value)),
                            })
                          }
                        />
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
                  ))
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
