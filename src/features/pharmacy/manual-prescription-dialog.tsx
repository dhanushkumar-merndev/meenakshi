"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, FileEdit, LoaderCircle, NotebookPen, Plus, Trash2 } from "lucide-react";
import { createManualPrescription } from "./manual-prescription-actions";
import { MedicineCombobox } from "@/features/clinical/medicine-combobox";
import { DURATION_PRESETS, FREQUENCY_PRESETS, PresetSelect } from "@/features/clinical/preset-select";
import { calculatePrescriptionQuantity } from "@/lib/domain/medicine-quantity";
import type { ActionState } from "@/types/hospital";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";

const initial: ActionState = { ok: false };

type OpVisit = {
  visit_id: string;
  patient_name: string;
  patient_phone: string;
  token_number: number;
  doctor_name: string;
  fee_paise: number;
};
type IpTicket = {
  ip_ticket_id: string;
  patient_name: string;
  patient_phone: string;
  ticket_number: string;
  doctor_name: string;
  room: string | null;
  bed: string | null;
};
type MedicineLine = {
  key: string;
  medicine_id?: string;
  medicine_name: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  quantity: number;
  quantityAuto: boolean;
};
const newMedicine = (): MedicineLine => ({
  key: crypto.randomUUID(),
  medicine_name: "",
  dose: "",
  frequency: "BD (1-0-1)",
  duration: "3 days",
  route: "Oral",
  quantity: 1,
  quantityAuto: true,
});

/** Searches today's OP visits or admitted IP tickets, one at a time. */
function PatientSearch({
  mode,
  onPick,
}: {
  mode: "op" | "ip";
  onPick: (visit: OpVisit | null, ticket: IpTicket | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [opItems, setOpItems] = useState<OpVisit[]>([]);
  const [ipItems, setIpItems] = useState<IpTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const url =
      mode === "op"
        ? `/api/search/op-visits-today?q=${encodeURIComponent(query)}`
        : `/api/search/ip-tickets-admitted?q=${encodeURIComponent(query)}`;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();
        if (mode === "op") setOpItems(body.items ?? []);
        else setIpItems(body.items ?? []);
      } catch {
        // Aborted or offline; the list just stays empty.
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, mode]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="w-full justify-between font-normal" type="button" />
        }
      >
        <span className="truncate">{label || "Search patient"}</span>
        <ChevronsUpDown className="opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={mode === "op" ? "Token, name or phone" : "Ticket, name or phone"}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Searching
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {mode === "op"
                    ? "No matching OP visit still needing entry today."
                    : "No matching admitted patient."}
                </CommandEmpty>
                <CommandGroup>
                  {mode === "op"
                    ? opItems.map((visit) => (
                        <CommandItem
                          key={visit.visit_id}
                          value={visit.visit_id}
                          onSelect={() => {
                            onPick(visit, null);
                            setLabel(`#${visit.token_number} · ${visit.patient_name}`);
                            setOpen(false);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              #{visit.token_number} · {visit.patient_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {visit.doctor_name}
                            </p>
                          </div>
                        </CommandItem>
                      ))
                    : ipItems.map((ticket) => (
                        <CommandItem
                          key={ticket.ip_ticket_id}
                          value={ticket.ip_ticket_id}
                          onSelect={() => {
                            onPick(null, ticket);
                            setLabel(`${ticket.ticket_number} · ${ticket.patient_name}`);
                            setOpen(false);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              {ticket.ticket_number} · {ticket.patient_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ticket.doctor_name}
                              {ticket.room ? ` · Room ${ticket.room}${ticket.bed ? `/${ticket.bed}` : ""}` : ""}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ManualPrescriptionDialog({
  doctors,
}: {
  doctors: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(createManualPrescription, initial);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<"op" | "ip">("op");
  const [visit, setVisit] = useState<OpVisit | null>(null);
  const [ticket, setTicket] = useState<IpTicket | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [medicines, setMedicines] = useState<MedicineLine[]>([newMedicine()]);
  const { open, setOpen } = useAutoCloseDialog(state, "Prescription entered.");

  // Fresh form each time the dialog is opened, triggered directly by the
  // click rather than an effect watching `open` (avoids a render-then-reset
  // flash and a setState-in-effect lint violation).
  const resetForm = () => {
    setKey(crypto.randomUUID());
    setVisit(null);
    setTicket(null);
    setDoctorId("");
    setMedicines([newMedicine()]);
  };
  const pickPatient = (v: OpVisit | null, t: IpTicket | null) => {
    setVisit(v);
    setTicket(t);
  };

  const updateMedicine = (medKey: string, patch: Partial<MedicineLine>) =>
    setMedicines((rows) =>
      rows.map((row) => {
        if (row.key !== medKey) return row;
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
  const validLines = useMemo(
    () => medicines.filter((m) => m.medicine_name.trim().length > 0),
    [medicines],
  );
  const patientLabel = visit
    ? `#${visit.token_number} · ${visit.patient_name}`
    : ticket
      ? `${ticket.ticket_number} · ${ticket.patient_name}`
      : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" onClick={resetForm} />}>
        <FileEdit /> Enter Doctor&apos;s Prescription
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <form action={mode === "op" ? undefined : action} className="contents">
          <DialogHeader>
            <DialogTitle>Enter Doctor&apos;s Prescription</DialogTitle>
            <DialogDescription>
              For a prescription the consultant wrote on paper.{" "}
              {mode === "op"
                ? "Pick the patient, then fill it in on the same consultation form the doctor uses."
                : "Enter it here; it then appears in the pending queue to dispense like any other."}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="visitId" value={visit?.visit_id ?? ""} />
          <input type="hidden" name="ipTicketId" value={ticket?.ip_ticket_id ?? ""} />
          <input type="hidden" name="doctorId" value={doctorId} />
          <input
            type="hidden"
            name="lines"
            value={JSON.stringify(
              validLines.map((m) => ({
                medicine_id: m.medicine_id,
                medicine_name: m.medicine_name,
                dose: m.dose,
                frequency: m.frequency,
                duration: m.duration,
                route: m.route,
                quantity: m.quantity,
              })),
            )}
          />
          {state.message && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "op" ? "default" : "outline"}
              onClick={() => {
                setMode("op");
                setTicket(null);
              }}
            >
              OP visit
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "ip" ? "default" : "outline"}
              onClick={() => {
                setMode("ip");
                setVisit(null);
              }}
            >
              IP ticket
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Patient *</Label>
            <PatientSearch mode={mode} onPick={pickPatient} />
            {mode === "op" ? (
              <p className="text-xs text-muted-foreground">
                Only shows OP visits still needing entry -- one already completed
                digitally has nothing left to do here.
              </p>
            ) : null}
          </div>

          {mode === "op" && visit ? (
            // Pharmacy now has the same access a doctor does to the full
            // consultation form (symptoms, diagnosis, medicines, everything) --
            // no separate thinner form to duplicate it. This just gets them
            // there with the right patient already open.
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-medium">{patientLabel}</p>
              <p className="mt-1 text-muted-foreground">{visit.doctor_name}</p>
              <Button
                className="mt-3"
                render={<Link href={`/visits/${visit.visit_id}`} target="_blank" />}
              >
                <NotebookPen /> Open Consultation
              </Button>
            </div>
          ) : null}

          {mode === "ip" && patientLabel ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Consulting doctor</Label>
                <Select value={doctorId} onValueChange={(v) => setDoctorId(String(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={ticket?.doctor_name ?? "Select"}>
                      {() =>
                        doctors.find((d) => d.id === doctorId)?.label ??
                        ticket?.doctor_name ??
                        "Select"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id} label={d.label}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="self-end text-xs text-muted-foreground">
                IP charges are billed on the ticket separately, not collected here.
              </p>
            </div>
          ) : null}

          {mode === "ip" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Medicines</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMedicines((rows) => [...rows, newMedicine()])}
              >
                <Plus /> Add Medicine
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Medicine</TableHead>
                    <TableHead>Dose</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medicines.map((row) => {
                    const suggested = calculatePrescriptionQuantity(row);
                    return (
                      <TableRow key={row.key}>
                        <TableCell>
                          <MedicineCombobox value={row} onChange={(v) => updateMedicine(row.key, v)} />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-24"
                            value={row.dose}
                            onChange={(e) => updateMedicine(row.key, { dose: e.target.value })}
                            placeholder="1 tablet"
                          />
                        </TableCell>
                        <TableCell className="min-w-36">
                          <PresetSelect
                            ariaLabel="Frequency"
                            presets={FREQUENCY_PRESETS}
                            value={row.frequency}
                            onChange={(frequency) => updateMedicine(row.key, { frequency })}
                          />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <PresetSelect
                            ariaLabel="Duration"
                            presets={DURATION_PRESETS}
                            value={row.duration}
                            onChange={(duration) => updateMedicine(row.key, { duration })}
                          />
                        </TableCell>
                        <TableCell className="min-w-24">
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
                          {suggested !== null && row.quantityAuto && row.quantity === suggested ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">Auto: {suggested}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Remove medicine"
                            onClick={() =>
                              setMedicines((rows) => rows.filter((m) => m.key !== row.key))
                            }
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          ) : null}

          <DialogFooter showCloseButton>
            {mode === "ip" ? (
              <Button disabled={pending || !patientLabel || validLines.length === 0} type="submit">
                {pending ? <LoaderCircle className="animate-spin" /> : <Check />} Save Prescription
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
