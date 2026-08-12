"use client";

import { useActionState } from "react";
import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { saveCharge, saveClinicalTerm, saveDepartment, saveReportCategory } from "./master-actions";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";

const initial: ActionState = { ok: false };
function Feedback({ state }: { state: ActionState }) {
  return state.message && !state.ok ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p> : null;
}
function Active({ value = true }: { value?: boolean }) {
  return <label className="flex items-center gap-2 text-sm"><Checkbox name="active" defaultChecked={value} /> Active</label>;
}

export function DepartmentDialog({ item }: { item?: { id: string; name: string; description: string | null; active: boolean } }) {
  const [state, action, pending] = useActionState(saveDepartment, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Department saved.");
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size={item ? "sm" : "default"} variant={item ? "ghost" : "default"} />}>{item ? <Pencil /> : <Plus />}{item ? "Edit" : "Add Department"}</DialogTrigger><DialogContent><form action={action} className="contents"><DialogHeader><DialogTitle>{item ? "Edit" : "Add"} department</DialogTitle><DialogDescription>Departments are retained and deactivated when no longer in use.</DialogDescription></DialogHeader><input type="hidden" name="id" value={item?.id ?? ""} /><Feedback state={state} /><div className="space-y-4"><div className="space-y-2"><Label htmlFor={`department-name-${item?.id ?? "new"}`}>Name</Label><Input id={`department-name-${item?.id ?? "new"}`} name="name" defaultValue={item?.name} required /></div><div className="space-y-2"><Label htmlFor={`department-description-${item?.id ?? "new"}`}>Description</Label><Textarea id={`department-description-${item?.id ?? "new"}`} name="description" defaultValue={item?.description ?? ""} /></div><Active value={item?.active} /></div><DialogFooter showCloseButton><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Save Department</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function ChargeDialog({ item }: { item?: { id: string; category: string; name: string; amount: string; active: boolean } }) {
  const [state, action, pending] = useActionState(saveCharge, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Charge saved.");
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size={item ? "sm" : "default"} variant={item ? "ghost" : "default"} />}>{item ? <Pencil /> : <Plus />}{item ? "Edit" : "Add Charge"}</DialogTrigger><DialogContent><form action={action} className="contents"><DialogHeader><DialogTitle>{item ? "Edit" : "Add"} charge</DialogTitle><DialogDescription>Doctor-specific fees continue to override generic consultation charges.</DialogDescription></DialogHeader><input type="hidden" name="id" value={item?.id ?? ""} /><Feedback state={state} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Category</Label><Input name="category" defaultValue={item?.category} required /></div><div className="space-y-2"><Label>Charge name</Label><Input name="name" defaultValue={item?.name} required /></div><div className="space-y-2"><Label>Amount (INR)</Label><Input name="amount" inputMode="decimal" defaultValue={item?.amount} required /></div><Active value={item?.active} /></div><DialogFooter showCloseButton><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Save Charge</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function ReportCategoryDialog({ item }: { item?: { id: string; name: string; active: boolean } }) {
  const [state, action, pending] = useActionState(saveReportCategory, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Report category saved.");
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size={item ? "sm" : "default"} variant={item ? "ghost" : "default"} />}>{item ? <Pencil /> : <Plus />}{item ? "Edit" : "Add Category"}</DialogTrigger><DialogContent><form action={action} className="contents"><DialogHeader><DialogTitle>{item ? "Edit" : "Add"} report category</DialogTitle><DialogDescription>Categories organize private patient files and report follow-up.</DialogDescription></DialogHeader><input type="hidden" name="id" value={item?.id ?? ""} /><Feedback state={state} /><div className="space-y-4"><div className="space-y-2"><Label>Category name</Label><Input name="name" defaultValue={item?.name} required /></div><Active value={item?.active} /></div><DialogFooter showCloseButton><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Save Category</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function ClinicalTermDialog({ item }: { item?: { id: string; type: string; displayText: string; aliases: string; source: string; active: boolean } }) {
  const [state, action, pending] = useActionState(saveClinicalTerm, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Clinical term saved.");
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size={item ? "sm" : "default"} variant={item ? "ghost" : "default"} />}>{item ? <Pencil /> : <Plus />}{item ? "Edit" : "Add Term"}</DialogTrigger><DialogContent><form action={action} className="contents"><DialogHeader><DialogTitle>{item ? "Edit" : "Add"} clinical term</DialogTitle><DialogDescription>Local searchable terms remain available without an external clinical API.</DialogDescription></DialogHeader><input type="hidden" name="id" value={item?.id ?? ""} /><Feedback state={state} /><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Type</Label><Input name="type" placeholder="diagnosis" defaultValue={item?.type} required /></div><div className="space-y-2"><Label>Source</Label><Input name="source" defaultValue={item?.source ?? "hospital"} required /></div></div><div className="space-y-2"><Label>Display text</Label><Input name="displayText" defaultValue={item?.displayText} required /></div><div className="space-y-2"><Label>Search aliases (comma separated)</Label><Textarea name="aliases" defaultValue={item?.aliases} /></div><Active value={item?.active} /></div><DialogFooter showCloseButton><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Save Term</Button></DialogFooter></form></DialogContent></Dialog>;
}
