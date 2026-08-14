"use client";

import { useActionState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { deleteMasterRecord } from "@/features/admin/master-actions";
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Entity = "department" | "charge" | "report_category" | "clinical_term" | "room_bed" | "medicine" | "medicine_batch";

export function DeleteMasterButton({ entity, id, label }: { entity: Entity; id: string; label: string }) {
  const [state, action, pending] = useActionState(deleteMasterRecord, { ok: false } as ActionState);
  const { open, setOpen } = useAutoCloseDialog(state, "Item permanently deleted.");
  return <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" />}><Trash2 /> Delete</AlertDialogTrigger>
    <AlertDialogContent>
      <form action={action} className="contents">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes this unused master record. If any hospital history uses it, deletion will be blocked and you can deactivate it instead.</AlertDialogDescription>
        </AlertDialogHeader>
        <input type="hidden" name="entity" value={entity} />
        <input type="hidden" name="id" value={id} />
        {state.message && !state.ok ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" variant="destructive" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Delete permanently</AlertDialogAction>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>;
}
