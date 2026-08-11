"use client";
import { useActionState, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { uploadReport } from "./actions";
import { compressPatientDocument } from "./compress-document";
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
export function UploadReportDialog({
  patients,
  categories,
  testOrders = [],
}: {
  patients: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; name: string }>;
  testOrders?: Array<{ id: string; patientId: string; visitId: string | null; ipTicketId: string | null; label: string }>;
}) {
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) {
        try {
          formData.set("file", await compressPatientDocument(file));
        } catch (error) {
          return { ok: false, fieldErrors: { file: [(error as Error).message] } };
        }
      }
      return uploadReport(previous, formData);
    },
    initial,
  );
  const [patient, setPatient] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [testOrder, setTestOrder] = useState("");
  const linkedTest = testOrders.find((item) => item.id === testOrder);
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <FileUp /> Upload Report
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>Upload patient report</DialogTitle>
            <DialogDescription>
              Files are stored in a private bucket and opened using short-lived
              authenticated links.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="patientId" value={patient} />
          <input type="hidden" name="categoryId" value={category} />
          <input type="hidden" name="testOrderId" value={testOrder} />
          <input type="hidden" name="visitId" value={linkedTest?.visitId ?? ""} />
          <input type="hidden" name="ipTicketId" value={linkedTest?.ipTicketId ?? ""} />
          {state.message ? (
            <p className="rounded-md bg-secondary p-3 text-sm">
              {state.message}
            </p>
          ) : null}
          <div className="space-y-4">
            {testOrders.length ? <div className="space-y-2"><Label>Related ordered test (optional)</Label><Select value={testOrder || "none"} onValueChange={(value) => { const id = value === "none" ? "" : value as string; setTestOrder(id); const selected = testOrders.find((item) => item.id === id); if (selected) setPatient(selected.patientId); }}><SelectTrigger className="w-full"><SelectValue placeholder="Not linked to an order" /></SelectTrigger><SelectContent><SelectItem value="none">Not linked to an order</SelectItem>{testOrders.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div> : null}
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label htmlFor="report-name">Report name</Label>
              <Input id="report-name" name="reportName" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-date">Report date</Label>
                <Input
                  id="report-date"
                  name="reportDate"
                  type="date"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-file">File</Label>
              <Input
                id="report-file"
                name="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
              />
              <p className="text-xs text-destructive">
                {state.fieldErrors?.file?.[0]}
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum 1 MB. Large camera images are resized locally before upload; PDFs over 1 MB are rejected.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-notes">Notes</Label>
              <Textarea id="report-notes" name="notes" rows={2} />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button disabled={pending || !patient || !category} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <FileUp />}{" "}
              Upload Privately
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
