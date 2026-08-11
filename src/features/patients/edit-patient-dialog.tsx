"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { updatePatient } from "./actions";
import type { ActionState } from "@/types/hospital";
import { DatePickerField } from "@/components/shared/date-picker-field";
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

type EditablePatient = {
  id: string;
  name: string;
  phone: string;
  dob: string | null;
  gender: string;
  bloodGroup: string | null;
  address: string | null;
  allergies: string | null;
  status: string;
};

export function EditPatientDialog({ patient }: { patient: EditablePatient }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updatePatient, {
    ok: false,
  } as ActionState);
  const [fields, setFields] = useState({
    name: patient.name,
    phone: patient.phone,
    dob: patient.dob ?? "",
    gender: patient.gender,
    bloodGroup: patient.bloodGroup ?? "",
    address: patient.address ?? "",
    allergies: patient.allergies ?? "",
    status: patient.status,
  });
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    toast.success("Patient updated");
    router.refresh();
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [router, state.ok]);

  const updateField = (name: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil /> Edit Patient
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Edit patient</DialogTitle>
            <DialogDescription>
              The visible Patient ID is the normalized phone number; historical
              relationships continue using the internal UUID.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="patientId" value={patient.id} />
          <input type="hidden" name="gender" value={fields.gender} />
          <input type="hidden" name="status" value={fields.status} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-patient-name">Name</Label>
              <Input
                id="edit-patient-name"
                name="name"
                value={fields.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-patient-phone">Phone Patient ID</Label>
              <Input
                id="edit-patient-phone"
                name="phone"
                inputMode="tel"
                value={fields.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-patient-dob">Date of birth</Label>
              <DatePickerField
                id="edit-patient-dob"
                name="dob"
                value={fields.dob}
                onValueChange={(value) => updateField("dob", value)}
                placeholder="Select date of birth"
                disableFuture
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={fields.gender}
                onValueChange={(value) => updateField("gender", String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unknown">Not specified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-blood-group">Blood group</Label>
              <Input
                id="edit-blood-group"
                name="bloodGroup"
                value={fields.bloodGroup}
                onChange={(event) =>
                  updateField("bloodGroup", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={fields.status}
                onValueChange={(value) => updateField("status", String(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-patient-address">Address</Label>
              <Textarea
                id="edit-patient-address"
                name="address"
                value={fields.address}
                onChange={(event) => updateField("address", event.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-patient-allergies">Allergies</Label>
              <Textarea
                id="edit-patient-allergies"
                name="allergies"
                value={fields.allergies}
                onChange={(event) =>
                  updateField("allergies", event.target.value)
                }
              />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
              Save Patient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
