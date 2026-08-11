"use client";
import { useActionState, useState } from "react";
import { BedDouble, IndianRupee, LoaderCircle, Plus } from "lucide-react";
import { addIpCharge, addIpPayment, createAdmission } from "./actions";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
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
const initial: ActionState = { ok: false };
const modes = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank_transfer", "Bank Transfer"],
  ["other", "Other"],
];
export function AdmissionDialog({
  patients,
  doctors,
}: {
  patients: Array<{ id: string; label: string }>;
  doctors: Array<{ id: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(createAdmission, initial);
  const [patient, setPatient] = useState("");
  const [doctor, setDoctor] = useState("");
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <Plus /> New Admission
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
          <input type="hidden" name="patientId" value={patient} />
          <input type="hidden" name="doctorId" value={doctor} />
          <input type="hidden" name="paymentMode" value={mode} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message ? (
            <p
              className={`rounded-md p-3 text-sm ${state.ok ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}
            >
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Patient</Label>
              <Select
                value={patient}
                onValueChange={(v) => setPatient(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Doctor</Label>
              <Select
                value={doctor}
                onValueChange={(v) => setDoctor(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="room">Room</Label>
              <Input id="room" name="room" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bed">Bed</Label>
              <Input id="bed" name="bed" />
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
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
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
            <Button disabled={pending || !patient || !doctor} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <BedDouble />
              )}{" "}
              Admit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ChargeDialog({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(addIpCharge, initial);
  const [category, setCategory] = useState("treatment");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Dialog>
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
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message ? <p className="text-sm">{state.message}</p> : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "doctor",
                    "ward",
                    "room",
                    "bed",
                    "treatment",
                    "test",
                    "other",
                  ].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item">Item</Label>
              <Input id="item" name="item" required />
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
                <Label htmlFor="rate">Rate</Label>
                <Input id="rate" name="rate" inputMode="decimal" required />
              </div>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
              Add Charge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function IpPaymentDialog({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(addIpPayment, initial);
  const [mode, setMode] = useState("cash");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <Dialog>
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
          {state.message ? <p className="text-sm">{state.message}</p> : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" inputMode="decimal" required />
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
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
