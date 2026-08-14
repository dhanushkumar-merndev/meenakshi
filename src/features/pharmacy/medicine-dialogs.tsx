"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, PackagePlus, Pencil, Plus } from "lucide-react";
import { saveMedicine, saveMedicineBatch } from "./actions";
import type { ActionState } from "@/types/hospital";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAutoCloseDialog } from "@/hooks/use-auto-close-dialog";
import { DeleteMasterButton } from "@/features/admin/delete-master-button";

const initial: ActionState = { ok: false };
export function MedicineDialog({
  item,
  canDelete = false,
}: {
  item?: {
    id: string;
    brandName: string;
    genericName: string | null;
    strength: string | null;
    dosageForm: string;
    manufacturer: string | null;
    active: boolean;
  };
  canDelete?: boolean;
}) {
  const [state, action, pending] = useActionState(saveMedicine, initial);
  const { open, setOpen } = useAutoCloseDialog(state, "Medicine saved.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size={item ? "sm" : "default"}
            variant={item ? "ghost" : "default"}
          />
        }
      >
        {item ? <Pencil /> : <Plus />}
        {item ? "Edit" : "Add Medicine"}
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>{item ? "Edit" : "Add"} medicine</DialogTitle>
            <DialogDescription>
              The directory is separate from physical batch stock.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={item?.id ?? ""} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["brandName", "Medicine name", item?.brandName ?? ""],
              ["genericName", "Generic name", item?.genericName ?? ""],
              ["strength", "Strength", item?.strength ?? ""],
              ["dosageForm", "Dosage form", item?.dosageForm ?? ""],
              ["manufacturer", "Manufacturer", item?.manufacturer ?? ""],
            ].map(([name, label, value]) => (
              <div className="space-y-2" key={name}>
                <Label>{label}</Label>
                <Input
                  name={name}
                  defaultValue={value}
                  required={["brandName", "dosageForm"].includes(name)}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 self-end text-sm">
              <Checkbox name="active" defaultChecked={item?.active ?? true} />{" "}
              Active
            </label>
          </div>
          <DialogFooter showCloseButton>
            {item && canDelete ? <DeleteMasterButton entity="medicine" id={item.id} label={item.brandName} /> : null}
            <Button disabled={pending} type="submit">
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}{" "}
              Save Medicine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type MedicineOption = { id: string; name: string };
export function BatchDialog({
  medicines,
  item,
  canDelete = false,
}: {
  medicines: MedicineOption[];
  item?: {
    id: string;
    medicineId: string;
    batchNumber: string;
    expiryDate: string;
    purchasePrice: string;
    sellingPrice: string;
    lowStockThreshold: number;
    active: boolean;
  };
  canDelete?: boolean;
}) {
  const [state, action, pending] = useActionState(saveMedicineBatch, initial);
  const [medicineId, setMedicineId] = useState(
    item?.medicineId ?? medicines[0]?.id ?? "",
  );
  const [key] = useState(() => crypto.randomUUID());
  const { open, setOpen } = useAutoCloseDialog(state, "Medicine batch saved.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size={item ? "sm" : "default"}
            variant={item ? "ghost" : "outline"}
          />
        }
      >
        {item ? <Pencil /> : <PackagePlus />}
        {item ? "Edit / Adjust" : "Add Batch"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form action={action} className="contents">
          <DialogHeader>
            <DialogTitle>
              {item ? "Edit batch / adjust stock" : "Add medicine batch"}
            </DialogTitle>
            <DialogDescription>
              Quantity is changed through an atomic stock ledger entry. Use a
              negative adjustment only for a documented correction.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="batchId" value={item?.id ?? ""} />
          <input type="hidden" name="medicineId" value={medicineId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          {state.message && !state.ok ? (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Medicine</Label>
              <Select
                value={medicineId}
                onValueChange={(value) => setMedicineId(value as string)}
                disabled={Boolean(item)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{() => medicines.find((medicine) => medicine.id === medicineId)?.name ?? "Select medicine"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {medicines.map((medicine) => (
                    <SelectItem key={medicine.id} value={medicine.id} label={medicine.name}>
                      {medicine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[
              ["batchNumber", "Batch number", item?.batchNumber ?? "", "text"],
              ["expiryDate", "Expiry date", item?.expiryDate ?? "", "date"],
              [
                "purchasePrice",
                "Purchase price",
                item?.purchasePrice ?? "0",
                "text",
              ],
              [
                "sellingPrice",
                "Selling price",
                item?.sellingPrice ?? "",
                "text",
              ],
              [
                "lowStockThreshold",
                "Low stock threshold",
                String(item?.lowStockThreshold ?? 10),
                "number",
              ],
              [
                "quantityDelta",
                item ? "Stock adjustment (+/-)" : "Opening quantity",
                "0",
                "number",
              ],
              [
                "reason",
                "Adjustment reason",
                item ? "Stock count adjustment" : "Opening stock",
                "text",
              ],
            ].map(([name, label, value, type]) => (
              <div
                className={`space-y-2 ${name === "reason" ? "sm:col-span-2" : ""}`}
                key={name}
              >
                <Label>{label}</Label>
                <Input name={name} type={type} defaultValue={value} required />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="active" defaultChecked={item?.active ?? true} />{" "}
              Active
            </label>
          </div>
          <DialogFooter showCloseButton>
            {item && canDelete ? <DeleteMasterButton entity="medicine_batch" id={item.id} label={`batch ${item.batchNumber}`} /> : null}
            <Button disabled={pending || !medicineId} type="submit">
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PackagePlus />
              )}{" "}
              Save Batch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
