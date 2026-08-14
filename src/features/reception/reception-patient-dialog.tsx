"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, Plus, Printer, Search, UserPlus } from "lucide-react";
import { createPatient } from "@/features/patients/actions";
import { createVisit } from "@/features/visits/actions";
import type { ActionState } from "@/types/hospital";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Doctor = { id: string; displayName: string; department: string; opFeePaise: number; followUpFeePaise: number };
type Patient = { id: string; name: string; phone_normalized: string; dob: string | null; gender: string };
const initial: ActionState = { ok: false };

export function ReceptionPatientDialog({ doctors }: { doctors: Doctor[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"search" | "add" | "visit">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [patientState, patientAction, patientPending] = useActionState(createPatient, initial);
  const [visitState, visitAction, visitPending] = useActionState(createVisit, initial);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [visitType, setVisitType] = useState("op");
  const [mode, setMode] = useState("cash");
  const [collected, setCollected] = useState(String((doctors[0]?.opFeePaise ?? 0) / 100));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const doctor = useMemo(() => doctors.find((item) => item.id === doctorId), [doctorId, doctors]);
  const fee = ((visitType === "follow_up" ? doctor?.followUpFeePaise : doctor?.opFeePaise) ?? 0) / 100;

  useEffect(() => {
    if (!open || step !== "search" || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/search/patients?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const body = await response.json();
        if (response.ok) setResults(body.items ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      if (!controller.signal.aborted) controller.abort();
    };
  }, [open, query, step]);

  useEffect(() => {
    const patientId = patientState.data?.patientId;
    if (patientState.ok && typeof patientId === "string") {
      // The server action result is the external event that advances this workflow.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected({ id: patientId, name: newName.trim(), phone_normalized: newPhone.replace(/\D/g, "").slice(-10), dob: null, gender: "unknown" });
      setStep("visit");
    }
  }, [patientState, newName, newPhone]);

  function choosePatient(patient: Patient) { setSelected(patient); setStep("visit"); }
  function updateDoctor(value: string) {
    setDoctorId(value);
    const next = doctors.find((item) => item.id === value);
    setCollected(String(((visitType === "follow_up" ? next?.followUpFeePaise : next?.opFeePaise) ?? 0) / 100));
  }
  function updateVisitType(value: string) {
    setVisitType(value);
    setCollected(String(((value === "follow_up" ? doctor?.followUpFeePaise : doctor?.opFeePaise) ?? 0) / 100));
  }
  function reset() { setStep("search"); setSelected(null); setQuery(""); setResults([]); }

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
    <DialogTrigger render={<Button />}><UserPlus /> Find or Add Patient</DialogTrigger>
    <DialogContent className="flex h-[min(680px,calc(100dvh-2rem))] flex-col overflow-hidden sm:max-w-2xl">
      {visitState.ok ? <>
        <DialogHeader><DialogTitle>Visit created</DialogTitle><DialogDescription>{selected?.name} has been added to the doctor queue.</DialogDescription></DialogHeader>
        <div className="flex flex-1 items-center justify-center"><div className="w-full rounded-lg border bg-secondary p-8 text-center"><p className="text-xs font-medium uppercase text-muted-foreground">Token number</p><p className="mt-1 text-6xl font-bold text-primary">{visitState.data?.token}</p></div></div>
        <DialogFooter><Button variant="outline" render={<Link href={`/print/token/${visitState.data?.visitId}`} />}><Printer /> Print Token</Button><Button render={<Link href={`/visits/${visitState.data?.visitId}`} />}>Open Visit</Button></DialogFooter>
      </> : step === "search" ? <>
        <DialogHeader><DialogTitle>Find or add patient</DialogTitle><DialogDescription>Search by phone Patient ID or name. Results appear after 500 ms.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Phone or patient name" autoFocus />{searching ? <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"/> : null}</div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {results.length ? results.map((patient) => <button type="button" key={patient.id} onClick={() => choosePatient(patient)} className="flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block font-medium">{patient.name}</span><span className="text-sm text-muted-foreground">{patient.phone_normalized}</span></span>{!patient.dob || patient.gender === "unknown" ? <Badge variant="outline">Details pending</Badge> : <span className="text-sm text-muted-foreground">Select</span>}</button>) : <div className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">{query.trim().length < 2 ? "Enter at least 2 characters to search." : searching ? "Searching patients…" : "No matching patient. Add a quick patient record below."}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { setNewName(/\D/.test(query) ? query : ""); setNewPhone(/^\d/.test(query) ? query : ""); setStep("add"); }}><Plus /> Add new patient</Button></DialogFooter>
      </> : step === "add" ? <form action={patientAction} className="contents">
        <DialogHeader><DialogTitle>Quick patient registration</DialogTitle><DialogDescription>Create the visit now. Date of birth, gender, address, and clinical details can be completed later and will be marked pending.</DialogDescription></DialogHeader>
        <input type="hidden" name="gender" value="unknown" />
        {patientState.message && !patientState.ok ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{patientState.message}</p> : null}
        <div className="flex-1 space-y-4"><div className="space-y-2"><Label htmlFor="quick-name">Patient name *</Label><Input id="quick-name" name="name" value={newName} onChange={(event) => setNewName(event.target.value)} required autoFocus/><p className="text-xs text-destructive">{patientState.fieldErrors?.name?.[0]}</p></div><div className="space-y-2"><Label htmlFor="quick-phone">Phone / Patient ID *</Label><Input id="quick-phone" name="phone" inputMode="numeric" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="9876543210" required/><p className="text-xs text-destructive">{patientState.fieldErrors?.phone?.[0]}</p></div><div className="rounded-md border bg-muted/50 p-3 text-sm"><Badge variant="outline">Details pending</Badge><p className="mt-2 text-muted-foreground">Reception can complete the remaining patient details from the pending row after the visit is created.</p></div></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setStep("search")}><ArrowLeft /> Back</Button><Button type="submit" disabled={patientPending}>{patientPending ? <LoaderCircle className="animate-spin"/> : <Plus />} Create & continue</Button></DialogFooter>
      </form> : <form action={visitAction} className="contents">
        <DialogHeader><DialogTitle>Create visit</DialogTitle><DialogDescription>Token generation and the first offline payment are saved atomically.</DialogDescription></DialogHeader>
        <input type="hidden" name="patientId" value={selected?.id ?? ""}/><input type="hidden" name="idempotencyKey" value={idempotencyKey}/><input type="hidden" name="doctorId" value={doctorId}/><input type="hidden" name="visitType" value={visitType}/><input type="hidden" name="paymentMode" value={mode}/>
        {visitState.message ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{visitState.message}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Patient</Label><div className="flex h-10 items-center justify-between rounded-md border bg-muted/40 px-3"><span>{selected?.name} · {selected?.phone_normalized}</span>{!selected?.dob || selected.gender === "unknown" ? <Badge variant="outline">Details pending</Badge> : null}</div></div><div className="space-y-2"><Label>Visit type</Label><Select value={visitType} onValueChange={(v) => updateVisitType(String(v))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="op">OP</SelectItem><SelectItem value="follow_up" disabled>Follow-up (open patient history)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Doctor</Label><Select value={doctorId} onValueChange={(v) => updateDoctor(String(v))}><SelectTrigger className="w-full"><SelectValue>{() => doctor?.displayName ?? "Select doctor"}</SelectValue></SelectTrigger><SelectContent>{doctors.map((item) => <SelectItem key={item.id} value={item.id} label={item.displayName}>{item.displayName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Department</Label><Input value={doctor?.department ?? "—"} readOnly/></div><div className="space-y-2"><Label>Consultation fee</Label><Input name="fee" value={fee} readOnly/></div><div className="space-y-2"><Label>Amount collected offline</Label><Input name="collected" inputMode="decimal" value={collected} onChange={(e) => setCollected(e.target.value)}/><p className="text-xs text-destructive">{visitState.fieldErrors?.collected?.[0]}</p></div><div className="space-y-2"><Label>Payment mode</Label><Select value={mode} onValueChange={(v) => setMode(String(v))}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[["cash","Cash"],["upi","UPI"],["card","Card"],["bank_transfer","Bank Transfer"],["other","Other"]].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2}/></div></div></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setStep("search")}><ArrowLeft /> Change patient</Button><Button type="submit" disabled={visitPending || !doctorId}>{visitPending ? <LoaderCircle className="animate-spin"/> : <Plus />} Create Visit</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
