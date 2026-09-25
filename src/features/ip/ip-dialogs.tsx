"use client";
import { useActionState, useState } from "react";
import { BedDouble, IndianRupee, LoaderCircle, Package, Plus, Trash2, UserRoundCheck } from "lucide-react";
import { addIpCharge, addIpPayment, assignIpPatient, createAdmission } from "./actions";
import { requestIpInventory } from "./inventory-request-actions";
import { MedicineCombobox } from "@/features/clinical/medicine-combobox";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";
import { formatInr, rupeesToPaise } from "@/lib/domain/money";
import { maxDiscountPaise } from "@/lib/domain/discount";
import {
  DiscountField,
  useDiscount,
  type DiscountPolicyProps,
} from "@/components/shared/discount-field";
import {
  PatientCombobox,
  type PatientOption,
} from "@/components/shared/patient-combobox";
const initial: ActionState = { ok: false };
const CUSTOM_CHARGE_VALUE = "custom";
type IpChargeRow = {
  id: string;
  presetId: string;
  item: string;
  quantity: string;
  rate: string;
};

function newChargeRow(
  preset?: { id: string; name: string; rate: string },
  custom = false,
): IpChargeRow {
  return {
    id: crypto.randomUUID(),
    presetId: custom || !preset ? CUSTOM_CHARGE_VALUE : preset.id,
    item: custom || !preset ? "" : preset.name,
    quantity: "1",
    rate: custom || !preset ? "" : preset.rate,
  };
}
const modes = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank_transfer", "Bank Transfer"],
  ["other", "Other"],
];
export function AdmissionDialog({
  doctors,
  rooms = [],
  ipStaff = [],
  initialPatient = null,
  initialDoctorId = "",
  initialIpStaffId = "",
  sourceVisitId = "",
  triggerLabel = "New Admission",
}: {
  doctors: Array<{ id: string; label: string }>;
  rooms?: Array<{ id: string; label: string }>;
  /** IP staff who can own the admission, with their current ward load. */
  ipStaff?: Array<{ id: string; label: string; activePatients: number }>;
  initialPatient?: PatientOption | null;
  initialDoctorId?: string;
  /** Pre-selected owner -- the IP staff member taking a referral is themselves. */
  initialIpStaffId?: string;
  sourceVisitId?: string;
  triggerLabel?: string;
}) {
  const [state, action, pending] = useActionState(createAdmission, initial);
  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [emergency, setEmergency] = useState(false);
  const [doctor, setDoctor] = useState(initialDoctorId);
  const [roomBedId, setRoomBedId] = useState("");
  const [ipStaffId, setIpStaffId] = useState(initialIpStaffId);
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
  const { open, setOpen } = useAutoCloseDialog(state, "Patient admitted.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Admit patient</DialogTitle>
            <DialogDescription>
              Creates one IP ticket and records the optional offline deposit
              atomically.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="patientId" value={patient?.id ?? ""} />
          <input type="hidden" name="isEmergency" value={String(emergency)} />
          <input type="hidden" name="doctorId" value={doctor} />
          <input type="hidden" name="sourceVisitId" value={sourceVisitId} />
          <input type="hidden" name="roomBedId" value={roomBedId} />
          <input type="hidden" name="assignedIpStaffId" value={ipStaffId} />
          <input type="hidden" name="paymentMode" value={mode} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={emergency}
                  onCheckedChange={(checked) => {
                    const nextEmergency = checked === true;
                    setEmergency(nextEmergency);
                    if (nextEmergency) setPatient(null);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Emergency admission — patient unknown
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Create the IP ticket now and assign the patient later.
                  </span>
                </span>
              </label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admission-patient">
                Patient {emergency ? "(assign later)" : "*"}
              </Label>
              {emergency ? (
                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  This ticket will be marked as an unidentified emergency patient.
                </div>
              ) : (
                <PatientCombobox
                  id="admission-patient"
                  value={patient}
                  onChange={setPatient}
                />
              )}
              <p className="text-xs text-destructive">
                {state.fieldErrors?.patientId?.[0]}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admission-doctor">Doctor</Label>
              <Select
                value={doctor}
                onValueChange={(v) => setDoctor(v as string)}
              >
                <SelectTrigger id="admission-doctor" className="w-full">
                  <SelectValue placeholder="Select doctor">{() => doctors.find((item) => item.id === doctor)?.label ?? "Select doctor"}</SelectValue>
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
            {ipStaff.length ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="admission-ip-staff">IP staff</Label>
                <Select
                  value={ipStaffId}
                  onValueChange={(v) => setIpStaffId(String(v))}
                >
                  <SelectTrigger id="admission-ip-staff" className="w-full">
                    <SelectValue placeholder="Unassigned">
                      {() =>
                        ipStaff.find((member) => member.id === ipStaffId)?.label ??
                        "Unassigned"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ipStaff.map((member) => (
                      <SelectItem key={member.id} value={member.id} label={member.label}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{member.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {member.activePatients
                              ? `${member.activePatients} patients`
                              : "free"}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Who looks after this patient on the ward. Can be left
                  unassigned and claimed later.
                </p>
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="admission-room-bed">Available room / bed</Label>
              <Select value={roomBedId} onValueChange={(v)=>setRoomBedId(String(v))}><SelectTrigger id="admission-room-bed" className="w-full"><SelectValue placeholder="Select available room / bed">{() => rooms.find((room) => room.id === roomBedId)?.label ?? "Select available room / bed"}</SelectValue></SelectTrigger><SelectContent>{rooms.map(room=><SelectItem key={room.id} value={room.id} label={room.label}>{room.label}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">Only active, currently free beds are shown.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">Admission reason *</Label>
              <Textarea id="reason" name="reason" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit">Deposit offline</Label>
              <Input
                id="deposit"
                name="deposit"
                inputMode="decimal"
                defaultValue="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-mode">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as string)}>
                <SelectTrigger id="payment-mode" className="w-full">
                  <SelectValue>{() => modes.find(([v]) => v === mode)?.[1] ?? mode}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modes.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || (!emergency && !patient?.id) || !doctor} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <BedDouble />
              )}{" "}
              {emergency ? "Create Emergency Ticket" : "Admit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ChargeDialog({
  ticketId,
  presets,
}: {
  ticketId: string;
  presets: Array<{ id: string; category: string; name: string; rate: string }>;
}) {
  const [state, action, pending] = useActionState(addIpCharge, initial);
  const initialPreset = presets[0];
  const [rows, setRows] = useState<IpChargeRow[]>(() => [
    newChargeRow(initialPreset),
  ]);
  const { open, setOpen } = useAutoCloseDialog(state, "IP charges added.");
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !open) {
      // A retry within one opening keeps every row key. Reopening starts a
      // new batch, so consecutive additions never replay old rows.
      setRows([newChargeRow(initialPreset)]);
    }
    setOpen(nextOpen);
  };
  const updateRow = (id: string, patch: Partial<IpChargeRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const invalid = rows.some((row) => {
    const custom = row.presetId === CUSTOM_CHARGE_VALUE;
    return (
      !row.presetId ||
      !/^\d+$/.test(row.quantity) ||
      Number(row.quantity) < 1 ||
      (custom && (!row.item.trim() || !row.rate.trim()))
    );
  });
  const serializedRows = JSON.stringify(
    rows.map((row) => ({
      chargeMode: row.presetId === CUSTOM_CHARGE_VALUE ? "custom" : "preset",
      chargePresetId:
        row.presetId === CUSTOM_CHARGE_VALUE ? "" : row.presetId,
      item: row.item,
      quantity: row.quantity,
      rate: row.rate,
      idempotencyKey: row.id,
    })),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus /> Add Charge
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Add IP charges</DialogTitle>
            <DialogDescription>
              Add up to 25 items together. Each item remains a separate,
              traceable charge row.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="charges" value={serializedRows} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              {rows.map((row, index) => {
                const custom = row.presetId === CUSTOM_CHARGE_VALUE;
                const preset = presets.find((entry) => entry.id === row.presetId);
                return (
                  <div
                    key={row.id}
                    data-charge-row
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Charge {index + 1}</p>
                      {rows.length > 1 ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove charge ${index + 1}`}
                          onClick={() =>
                            setRows((current) =>
                              current.filter((entry) => entry.id !== row.id),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`charge-preset-${row.id}`}>
                        Charge option
                      </Label>
                      <Select
                        value={row.presetId}
                        onValueChange={(value) => {
                          const id = String(value);
                          if (id === CUSTOM_CHARGE_VALUE) {
                            updateRow(row.id, {
                              presetId: id,
                              item: "",
                              rate: "",
                            });
                            return;
                          }
                          const selected = presets.find(
                            (entry) => entry.id === id,
                          );
                          if (selected)
                            updateRow(row.id, {
                              presetId: id,
                              item: selected.name,
                              rate: selected.rate,
                            });
                        }}
                      >
                        <SelectTrigger
                          id={`charge-preset-${row.id}`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select charge">
                            {() =>
                              custom
                                ? "Custom charge"
                                : preset
                                  ? `${preset.name} · ₹${preset.rate}`
                                  : "Select charge"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {presets.map((entry) => (
                            <SelectItem
                              key={entry.id}
                              value={entry.id}
                              label={`${entry.name} · ₹${entry.rate}`}
                            >
                              {entry.name} · ₹{entry.rate}
                            </SelectItem>
                          ))}
                          <SelectItem
                            value={CUSTOM_CHARGE_VALUE}
                            label="Custom charge"
                          >
                            Custom charge
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
                      <div className="space-y-2">
                        <Label htmlFor={`charge-item-${row.id}`}>Item</Label>
                        <Input
                          id={`charge-item-${row.id}`}
                          value={row.item}
                          onChange={(event) =>
                            updateRow(row.id, { item: event.target.value })
                          }
                          readOnly={!custom}
                          required={custom}
                          placeholder={custom ? "Enter item name" : undefined}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`charge-quantity-${row.id}`}>
                          Quantity
                        </Label>
                        <Input
                          id={`charge-quantity-${row.id}`}
                          type="number"
                          min={1}
                          max={100000}
                          value={row.quantity}
                          onChange={(event) =>
                            updateRow(row.id, { quantity: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`charge-rate-${row.id}`}>Rate</Label>
                        <Input
                          id={`charge-rate-${row.id}`}
                          inputMode="decimal"
                          value={row.rate}
                          onChange={(event) =>
                            updateRow(row.id, { rate: event.target.value })
                          }
                          readOnly={!custom}
                          required={custom}
                          placeholder={custom ? "0.00" : undefined}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={rows.length >= 25}
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    newChargeRow(undefined, true),
                  ])
                }
              >
                <Plus /> Add another charge
              </Button>
            </div>
          </ScrollArea>
          <DialogFooter showCloseButton>
            <Button disabled={pending || invalid} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />} {" "}
              {rows.length === 1 ? "Add Charge" : `Add ${rows.length} Charges`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IpPaymentDialog({
  ticketId,
  totalPaise = 0,
  paidPaise = 0,
  discountPaise = 0,
  discountPolicy,
}: {
  ticketId: string;
  totalPaise?: number;
  paidPaise?: number;
  /** Discount already given on this ticket (settles part of the bill). */
  discountPaise?: number;
  discountPolicy: DiscountPolicyProps;
}) {
  const [state, action, pending] = useActionState(addIpPayment, initial);
  const [mode, setMode] = useState("cash");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const balance = Math.max(0, totalPaise - paidPaise - discountPaise);
  const discount = useDiscount({
    grossPaise: totalPaise,
    maxPaise: Math.min(
      balance,
      maxDiscountPaise(totalPaise, discountPolicy.limitPercent, discountPolicy.unlimited, discountPaise),
    ),
    policy: discountPolicy,
  });
  // Pre-filled with what is outstanding after any discount, which is what is
  // collected most of the time; a part payment is just typed over it.
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const amount =
    typedAmount ??
    (balance - discount.paise > 0 ? ((balance - discount.paise) / 100).toFixed(2) : "0");
  const { open, setOpen } = useAutoCloseDialog(state, "IP payment recorded.");
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !open) {
      // One key represents one intended payment. Keep it for retries while the
      // dialog remains open, then rotate it for the next separate collection.
      setKey(crypto.randomUUID());
      setTypedAmount(null);
      discount.reset();
    }
    setOpen(nextOpen);
  };
  let enteredPaise: number | null = null;
  if (amount.trim()) {
    try {
      enteredPaise = rupeesToPaise(amount);
    } catch {
      enteredPaise = null;
    }
  }
  const settlesPaise = (enteredPaise ?? 0) + discount.paise;
  const remainingAfterPayment = balance - settlesPaise;
  const exceedsBalance = enteredPaise !== null && settlesPaise > balance;
  const validPayment =
    enteredPaise !== null && settlesPaise > 0 && settlesPaise <= balance && discount.valid;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <IndianRupee /> Add Payment
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Record offline payment</DialogTitle>
            <DialogDescription>
              A new payment row is appended to the IP ticket.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message && !state.ok ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p> : null}
          <div className="space-y-4">
            {/* Whoever is taking the money needs to see what is still owed
                without leaving the dialog to read the summary behind it. */}
            <div className={`grid gap-2 rounded-lg border p-3 text-sm ${discountPaise > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
              <div>
                <p className="text-xs text-muted-foreground">Total charges</p>
                <p className="font-medium tabular-nums">{formatInr(totalPaise)}</p>
              </div>
              {discountPaise > 0 ? (
                <div>
                  <p className="text-xs text-muted-foreground">Discount</p>
                  <p className="font-medium tabular-nums">−{formatInr(discountPaise)}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="font-medium tabular-nums">{formatInr(paidPaise)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`font-semibold tabular-nums ${balance > 0 ? "text-destructive" : ""}`}>
                  {formatInr(balance)}
                </p>
              </div>
            </div>
            <DiscountField discount={discount} id={`ip-${ticketId}`} />
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setTypedAmount(event.target.value)}
                aria-invalid={Boolean(amount.trim()) && !validPayment}
                aria-describedby="payment-balance-preview"
                required
              />
              <div
                id="payment-balance-preview"
                aria-live="polite"
                className={`rounded-md border p-3 text-sm ${exceedsBalance ? "border-destructive/40 bg-destructive/5" : "bg-muted/40"}`}
              >
                {!amount.trim() ? (
                  <p>
                    Pending balance: <strong>{formatInr(balance)}</strong>
                  </p>
                ) : enteredPaise === null ? (
                  <p className="text-destructive">
                    Enter a valid amount with up to two decimal places.
                  </p>
                ) : settlesPaise <= 0 ? (
                  <p className="text-destructive">
                    Enter a payment amount or a discount.
                  </p>
                ) : exceedsBalance ? (
                  <p className="text-destructive">
                    {discount.paise > 0 ? "Amount and discount exceed" : "Amount exceeds"} the pending balance by{" "}
                    <strong>{formatInr(Math.abs(remainingAfterPayment))}</strong>.
                  </p>
                ) : remainingAfterPayment === 0 ? (
                  <p className="font-medium text-primary">
                    {discount.paise > 0 ? "Settled in full with the discount" : "Paid in full"} — no balance will remain.
                  </p>
                ) : (
                  <p>
                    After this {discount.paise > 0 ? "payment and discount" : "payment"},{" "}
                    <strong>{formatInr(remainingAfterPayment)}</strong> will
                    remain pending.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => modes.find(([v]) => v === mode)?.[1] ?? mode}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modes.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || !validPayment} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <IndianRupee />
              )}{" "}
              {enteredPaise === 0 && discount.paise > 0 ? "Record Discount" : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignPatientDialog({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(assignIpPatient, initial);
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const { open, setOpen } = useAutoCloseDialog(
    state,
    "Patient assigned to the IP ticket.",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <UserRoundCheck /> Assign Patient
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Assign emergency IP ticket</DialogTitle>
            <DialogDescription>
              Search the confirmed patient by phone or name. This creates an
              audited permanent link to the emergency ticket.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="patientId" value={patient?.id ?? ""} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`assign-patient-${ticketId}`}>Patient</Label>
            <PatientCombobox
              id={`assign-patient-${ticketId}`}
              value={patient}
              onChange={setPatient}
            />
            <p className="text-xs text-destructive">
              {state.fieldErrors?.patientId?.[0]}
            </p>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || !patient?.id} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <UserRoundCheck />
              )}{" "}
              Assign Patient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RequestLine = { key: string; name: string; quantity: number };
const newRequestLine = (): RequestLine => ({ key: crypto.randomUUID(), name: "", quantity: 1 });

/**
 * IP staff or the treating doctor asking pharmacy for consumables. Typing
 * searches live stock (same combobox the doctor's own prescription uses) so
 * the requester can see what pharmacy actually has while asking -- but
 * nothing here is a catalog lock: typed text that matches nothing can still
 * be sent, since pharmacy always matches or manually prices at fulfilment.
 * Stock never changes from this dialog either way.
 */
export function RequestInventoryDialog({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(requestIpInventory, initial);
  const [lines, setLines] = useState<RequestLine[]>([newRequestLine()]);
  const [notes, setNotes] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const { open, setOpen } = useAutoCloseDialog(state, "Item request sent to pharmacy.");
  const payload = lines
    .filter((line) => line.name.trim() && line.quantity > 0)
    .map((line) => ({ name: line.name.trim(), quantity: line.quantity }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Package /> Request Items
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Request pharmacy items</DialogTitle>
            <DialogDescription>
              Describe what&apos;s needed; pharmacy chooses the settlement when it
              fulfils the request: add it to the IP ticket or collect at the
              pharmacy counter. Stock does not change here.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input type="hidden" name="lines" value={JSON.stringify(payload)} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div className="flex gap-2" key={line.key}>
                <div className="flex-1">
                  <MedicineCombobox
                    value={{ medicine_name: line.name }}
                    searchEndpoint="/api/search/pharmacy-items"
                    emptyMessage="No stocked medicine or inventory item found. Typed text can still be requested."
                    onChange={(next) =>
                      setLines((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, name: next.medicine_name } : row)),
                      )
                    }
                  />
                </div>
                <Input
                  className="w-20"
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, quantity: Math.max(1, Number(event.target.value)) } : row,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove item"
                  disabled={lines.length === 1}
                  onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setLines((rows) => [...rows, newRequestLine()])}>
              <Plus /> Add Item
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`request-notes-${ticketId}`}>Notes</Label>
            <Textarea id={`request-notes-${ticketId}`} name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || payload.length === 0} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Package />} Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
