"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CalendarPlus, LoaderCircle, Printer } from "lucide-react";
import { createVisit } from "./actions";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FollowUpDialog({ followUp }: { followUp: { patientId: string; patientName: string; previousVisitId: string; doctorId: string; doctorName: string; feePaise: number; reason: string } }) {
  const [state, action, pending] = useActionState(createVisit, { ok: false } as ActionState);
  const [mode, setMode] = useState("cash"); const [key] = useState(() => crypto.randomUUID());
  if (state.ok) return <div className="flex justify-end gap-1"><Button size="sm" variant="outline" render={<Link href={`/print/token/${state.data?.visitId}`} />}><Printer /> Token #{state.data?.token}</Button><Button size="sm" render={<Link href={`/visits/${state.data?.visitId}`} />}>Open</Button></div>;
  return <Dialog><DialogTrigger render={<Button size="sm" />}><CalendarPlus /> Create Follow-up</DialogTrigger><DialogContent><form action={action} className="contents"><DialogHeader><DialogTitle>Create linked follow-up</DialogTitle><DialogDescription>The old completed visit remains unchanged. A new token and visit are created for {followUp.doctorName}.</DialogDescription></DialogHeader><input type="hidden" name="patientId" value={followUp.patientId} /><input type="hidden" name="doctorId" value={followUp.doctorId} /><input type="hidden" name="visitType" value="follow_up" /><input type="hidden" name="previousVisitId" value={followUp.previousVisitId} /><input type="hidden" name="fee" value={(followUp.feePaise / 100).toFixed(2)} /><input type="hidden" name="paymentMode" value={mode} /><input type="hidden" name="idempotencyKey" value={key} /><input type="hidden" name="notes" value={followUp.reason} />{state.message ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p> : null}<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Patient</Label><Input value={followUp.patientName} readOnly /></div><div className="space-y-2"><Label>Doctor</Label><Input value={followUp.doctorName} readOnly /></div><div className="space-y-2"><Label>Follow-up fee</Label><Input value={(followUp.feePaise / 100).toFixed(2)} readOnly /></div><div className="space-y-2"><Label>Amount collected offline</Label><Input name="collected" inputMode="decimal" defaultValue={(followUp.feePaise / 100).toFixed(2)} /></div></div><div className="space-y-2"><Label>Payment mode</Label><Select value={mode} onValueChange={(value) => setMode(value as string)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["bank_transfer", "Bank Transfer"], ["other", "Other"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter showCloseButton><Button disabled={pending} type="submit">{pending ? <LoaderCircle className="animate-spin" /> : <CalendarPlus />} Create Follow-up</Button></DialogFooter></form></DialogContent></Dialog>;
}
