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
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";
import { formatInr } from "@/lib/domain/money";
import {
  PatientCombobox,
  type PatientOption,
} from "@/components/shared/patient-combobox";
const initial: ActionState = { ok: false };
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
  initialPatient = null,
  initialDoctorId = "",
  sourceVisitId = "",
  triggerLabel = "New Admission",
}: {
  doctors: Array<{ id: string; label: string }>;
  rooms?: Array<{ id: string; label: string }>;
  initialPatient?: PatientOption | null;
  initialDoctorId?: string;
  sourceVisitId?: string;
  triggerLabel?: string;
}) {
  const [state, action, pending] = useActionState(createAdmission, initial);
  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [emergency, setEmergency] = useState(false);
  const [doctor, setDoctor] = useState(initialDoctorId);
  const [roomBedId, setRoomBedId] = useState("");
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
const CUSTOM_CHARGE_CATEGORIES: Array<[string, string]> = [
  ["doctor", "Doctor"],
  ["ward", "Ward"],
  ["room", "Room"],
  ["bed", "Bed"],
  ["treatment", "Treatment"],
  ["test", "Test"],
  ["pharmacy", "Pharmacy"],
  ["other", "Other"],
];
export function ChargeDialog({ ticketId, presets }: { ticketId: string; presets: Array<{ id: string; category: string; name: string; rate: string }> }) {
  const [state, action, pending] = useActionState(addIpCharge, initial);
  // Every preset charge comes from the configured Charges master, so most
  // billing only ever uses rates the hospital has approved. "Custom" is the
  // escape hatch for the one-off item that isn't in that master -- name,
  // quantity and amount typed in directly (addIpCharge already supports this
  // path; only the dialog never offered it).
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "custom");
  const isCustom = presetId === "custom";
  const initialPreset = presets[0];
  const [category, setCategory] = useState(initialPreset?.category ?? "treatment");
  const [item, setItem] = useState(initialPreset?.name ?? "");
  const [rate, setRate] = useState(initialPreset?.rate ?? "");
  const [key] = useState(() => crypto.randomUUID());
  const { open, setOpen } = useAutoCloseDialog(state, "IP charge added.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus /> Add Charge
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Add IP charge</DialogTitle>
            <DialogDescription>
              Charges remain traceable and are never overwritten.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="chargePresetId" value={presetId} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message && !state.ok ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p> : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="charge-preset">Charge preset</Label>
              <Select
                value={presetId}
                onValueChange={(value) => {
                  const id = String(value);
                  setPresetId(id);
                  if (id === "custom") {
                    setItem("");
                    setRate("");
                    setCategory("other");
                    return;
                  }
                  const preset = presets.find((entry) => entry.id === id);
                  if (preset) {
                    setCategory(preset.category);
                    setItem(preset.name);
                    setRate(preset.rate);
                  }
                }}
              >
                <SelectTrigger id="charge-preset" className="w-full">
                  {/* Without a render function the trigger shows the stored
                      preset id rather than its name. */}
                  <SelectValue placeholder="Select configured charge">
                    {() => {
                      if (isCustom) return "Custom (enter manually)";
                      const preset = presets.find((entry) => entry.id === presetId);
                      return preset ? `${preset.name} · ₹${preset.rate}` : "Select configured charge";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom" label="Custom (enter manually)">
                    Custom (enter manually)
                  </SelectItem>
                  {presets.map((preset) => <SelectItem key={preset.id} value={preset.id} label={`${preset.name} · ₹${preset.rate}`}>{preset.name} · ₹{preset.rate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isCustom ? (
              <div className="space-y-2">
                <Label htmlFor="charge-category">Category</Label>
                <Select value={category} onValueChange={(value) => setCategory(String(value))}>
                  <SelectTrigger id="charge-category" className="w-full">
                    <SelectValue>{() => CUSTOM_CHARGE_CATEGORIES.find(([v]) => v === category)?.[1] ?? category}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_CHARGE_CATEGORIES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="item">Item</Label>
              <Input
                id="item"
                name="item"
                value={item}
                onChange={isCustom ? (event) => setItem(event.target.value) : undefined}
                placeholder={isCustom ? "e.g. Wheelchair rental" : undefined}
                readOnly={!isCustom}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">{isCustom ? "Amount (₹)" : "Rate"}</Label>
                <Input
                  id="rate"
                  name="rate"
                  inputMode="decimal"
                  value={rate}
                  onChange={isCustom ? (event) => setRate(event.target.value) : undefined}
                  placeholder={isCustom ? "0.00" : undefined}
                  readOnly={!isCustom}
                  required
                />
              </div>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || !presetId || (isCustom && (!item.trim() || !rate.trim()))} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
              Add Charge
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
}: {
  ticketId: string;
  totalPaise?: number;
  paidPaise?: number;
}) {
  const [state, action, pending] = useActionState(addIpPayment, initial);
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
  const balance = Math.max(0, totalPaise - paidPaise);
  // Pre-filled with what is outstanding, which is what is collected most of the
  // time; a part payment is just typed over it.
  const [amount, setAmount] = useState(() => (balance > 0 ? (balance / 100).toFixed(2) : ""));
  const { open, setOpen } = useAutoCloseDialog(state, "IP payment recorded.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total charges</p>
                <p className="font-medium tabular-nums">{formatInr(totalPaise)}</p>
              </div>
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
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {balance > 0
                  ? `${formatInr(balance)} is still pending. Type a smaller amount for a part payment.`
                  : "This ticket is fully settled; any amount recorded here is an extra payment."}
              </p>
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
            <Button disabled={pending} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <IndianRupee />
              )}{" "}
              Record Payment
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
              Describe what&apos;s needed; pharmacy sources it and bills the
              ticket once fulfilled. Stock does not change here.
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
