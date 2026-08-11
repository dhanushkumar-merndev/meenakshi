"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { createPatient } from "./actions";
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
const ErrorText = ({ errors }: { errors?: string[] }) =>
  errors?.map((item) => (
    <p className="text-xs text-destructive" key={item}>
      {item}
    </p>
  ));

export function NewPatientDialog() {
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState("unknown");
  const [state, action, pending] = useActionState(createPatient, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.data?.patientId) {
      toast.success("Patient created");
      router.push(`/patients/${state.data.patientId}`);
    }
  }, [state, router]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> Add Patient
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Add patient</DialogTitle>
            <DialogDescription>
              Phone is shown as the Patient ID. It can be corrected later
              without losing history.
            </DialogDescription>
          </DialogHeader>
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="patient-name">Name *</Label>
              <Input id="patient-name" name="name" required autoFocus />
              <ErrorText errors={state.fieldErrors?.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-phone">Phone *</Label>
              <Input
                id="patient-phone"
                name="phone"
                inputMode="numeric"
                placeholder="9876543210"
                required
              />
              <ErrorText errors={state.fieldErrors?.phone} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-dob">Date of birth</Label>
              <Input id="patient-dob" name="dob" type="date" />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <input type="hidden" name="gender" value={gender} />
              <Select
                value={gender}
                onValueChange={(value) => setGender(value as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not specified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="blood-group">Blood group</Label>
              <Input id="blood-group" name="bloodGroup" placeholder="O+" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" rows={2} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="allergies">Known allergies</Label>
              <Textarea id="allergies" name="allergies" rows={2} />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
              Create Patient
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
