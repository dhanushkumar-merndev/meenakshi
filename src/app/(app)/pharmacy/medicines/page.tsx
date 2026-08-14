import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MedicineDialog } from "@/features/pharmacy/medicine-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Medicine = { id: string; brand_name: string; generic_name: string | null; strength: string | null; dosage_form: string; manufacturer: string | null; active: boolean; total_count: number };

export default async function MedicinesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireRoute("/pharmacy/medicines");
  const params = await searchParams; const q = params.q?.trim() ?? ""; const page = Math.max(1, Number(params.page) || 1); const size = 20;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("list_medicine_directory", { p_query: q, p_limit: size, p_offset: (page - 1) * size });
  const rows = (data ?? []) as unknown as Medicine[]; const count = Number(rows[0]?.total_count ?? 0); const pages = Math.max(1, Math.ceil(count / size));
  return <div><PageHeader title="Medicine Master" description={`${count} medicine definitions · quantities and batches are managed under Stock & Batches`} actions={<MedicineDialog />} /><DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search medicine, generic, strength" ariaLabel="Search medicine master" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead>Generic</TableHead><TableHead>Strength</TableHead><TableHead>Form</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.brand_name}</TableCell><TableCell>{item.generic_name ?? "—"}</TableCell><TableCell>{item.strength ?? "—"}</TableCell><TableCell>{item.dosage_form}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><MedicineDialog item={{ id: item.id, brandName: item.brand_name, genericName: item.generic_name, strength: item.strength, dosageForm: item.dosage_form, manufacturer: item.manufacturer, active: item.active }} /></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No medicines found.</TableCell></TableRow>}</TableBody></Table></div><div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground"><span>Page {page} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} render={page > 1 ? <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`} /> : undefined}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pages} render={page < pages ? <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`} /> : undefined}>Next</Button></div></div></CardContent></Card></div>;
}
