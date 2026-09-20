"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, UserRoundCog } from "lucide-react";
import { assignIpTicket } from "./actions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";

const initial: ActionState = { ok: false };
const UNASSIGNED = "unassigned";

/**
 * Hands a ward patient to a different IP staff member -- a shift handover, or
 * claiming a ticket that came in unassigned. Deliberately allows unassigning:
 * pretending someone is responsible when nobody is is worse than an empty box.
 */
export function AssignStaffDialog({
  ticketId,
  ticketNumber,
  currentStaffId,
  staff,
  selfStaffId,
}: {
  ticketId: string;
  ticketNumber: string;
  currentStaffId: string | null;
  staff: Array<{ id: string; label: string; activePatients: number }>;
  /** Lets an IP staff member claim an unassigned ward patient without guessing
   * their own name from the handover list. */
  selfStaffId?: string;
}) {
  const [state, action, pending] = useActionState(assignIpTicket, initial);
  const [staffId, setStaffId] = useState(currentStaffId ?? UNASSIGNED);
  const { open, setOpen } = useAutoCloseDialog(state, "Assignment updated.");
  const selected = staff.find((member) => member.id === staffId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <UserRoundCog /> Assign
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Assign {ticketNumber}</DialogTitle>
            <DialogDescription>
              Who is looking after this patient on the ward.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input
            type="hidden"
            name="staffId"
            value={staffId === UNASSIGNED ? "" : staffId}
          />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="assign-staff">IP staff</Label>
            <Select value={staffId} onValueChange={(v) => setStaffId(String(v))}>
              <SelectTrigger id="assign-staff" className="w-full">
                <SelectValue>{() => selected?.label ?? "Unassigned"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED} label="Unassigned">
                  Unassigned
                </SelectItem>
                {staff.map((member) => (
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
            {selfStaffId ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStaffId(selfStaffId)}
              >
                Assign to me
              </Button>
            ) : null}
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <UserRoundCog />}{" "}
              Save Assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
