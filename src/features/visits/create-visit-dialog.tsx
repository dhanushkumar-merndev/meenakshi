"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { LoaderCircle, Plus, Printer } from "lucide-react";
import { createVisit } from "./actions";
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

type DoctorOption = {
  id: string;
  displayName: string;
  department: string;
  opFeePaise: number;
  followUpFeePaise: number;
};
type VisitOption = { id: string; label: string };
const initial: ActionState = { ok: false };

export function CreateVisitDialog({
  patientId,
  patientName,
  doctors,
  previousVisits,
}: {
  patientId: string;
  patientName: string;
  doctors: DoctorOption[];
  previousVisits: VisitOption[];
}) {
  const [open, setOpen] = useState(false);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [visitType, setVisitType] = useState("op");
  const [previousVisitId, setPreviousVisitId] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(createVisit, initial);
  const doctor = useMemo(
    () => doctors.find((item) => item.id === doctorId),
    [doctors, doctorId],
  );

  // No fee is captured at registration: the consulting doctor sets it when the
  // consultation is completed, and reception or pharmacy collects it afterwards.
  function updateVisitType(nextVisitType: string) {
    setVisitType(nextVisitType);
  }

  function updateDoctor(nextDoctorId: string) {
    setDoctorId(nextDoctorId);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> Create Visit
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {state.ok ? (
          <>
            <DialogHeader>
              <DialogTitle>Visit created</DialogTitle>
              <DialogDescription>
                {patientName} has been added to the doctor queue.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-secondary p-6 text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Token number
              </p>
              <p className="mt-1 text-5xl font-bold text-primary">
                {state.data?.token}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                render={<Link href={`/print/token/${state.data?.visitId}`} />}
              >
                <Printer /> Print Token
              </Button>
              <Button render={<Link href={`/visits/${state.data?.visitId}`} />}>
                Open Visit
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form action={action} className="contents">
            <DialogHeader>
              <DialogTitle>Create visit</DialogTitle>
              <DialogDescription>
                Token generation and the first offline payment are saved
                atomically.
              </DialogDescription>
            </DialogHeader>
            {state.message ? (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {state.message}
              </p>
            ) : null}
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="doctorId" value={doctorId} />
            <input type="hidden" name="visitType" value={visitType} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Patient</Label>
                <Input value={patientName} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="visit-type">Visit type</Label>
                <Select
                  value={visitType}
                  onValueChange={(value) => updateVisitType(String(value))}
                >
                  <SelectTrigger id="visit-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="op">OP</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visit-doctor">Doctor</Label>
                <Select
                  value={doctorId}
                  onValueChange={(value) => updateDoctor(String(value))}
                >
                  <SelectTrigger id="visit-doctor" className="w-full">
                    <SelectValue placeholder="Select doctor">
                      {() => doctor?.displayName ?? "Select doctor"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={item.id}
                        label={item.displayName}
                      >
                        {item.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visit-department">Department</Label>
                <Input
                  id="visit-department"
                  value={doctor?.department ?? "—"}
                  readOnly
                />
              </div>
              {visitType === "follow_up" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="previous-visit">Related previous visit</Label>
                  <input
                    type="hidden"
                    name="previousVisitId"
                    value={previousVisitId}
                  />
                  <Select
                    value={previousVisitId}
                    onValueChange={(value) =>
                      setPreviousVisitId(value as string)
                    }
                  >
                    <SelectTrigger id="previous-visit" className="w-full">
                      <SelectValue placeholder="Select previous visit">{() => previousVisits.find((item) => item.id === previousVisitId)?.label ?? "Select previous visit"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {previousVisits.map((item) => (
                        <SelectItem key={item.id} value={item.id} label={item.label}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-destructive">
                    {state.fieldErrors?.previousVisitId?.[0]}
                  </p>
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="visit-notes">Notes</Label>
                <Textarea id="visit-notes" name="notes" rows={2} />
              </div>
            </div>
            <DialogFooter showCloseButton>
              <Button disabled={pending || !doctorId} type="submit">
                {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
                Create Visit
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
