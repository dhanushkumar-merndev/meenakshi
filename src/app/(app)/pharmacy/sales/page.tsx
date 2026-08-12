import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { EMPTY_UUID } from "@/lib/domain/search";
import { findMatchingPatientIds } from "@/lib/search/patients";
import { PageHeader } from "@/components/shared/page-header";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { TablePager } from "@/components/shared/table-pager";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Sale = { id: string; created_at: string; source: string; total_paise: number; patients: { name: string; phone_normalized: string } | null; profiles: { full_name: string } | null; pharmacy_sale_items: Array<{ id: string }> };
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requireRoute("/pharmacy/sales");
  const params = await searchParams; const page = Math.max(1, Number(params.page) || 1); const size = 50; const q = params.q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const patientIds = q ? await findMatchingPatientIds(supabase, q) : [];
  let query = supabase.from("pharmacy_sales").select("id,created_at,source,total_paise,patients(name,phone_normalized),profiles!pharmacy_sales_dispensed_by_fkey(full_name),pharmacy_sale_items(id)", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  if (q) query = patientIds.length ? query.in("patient_id", patientIds) : query.eq("patient_id", EMPTY_UUID);
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as Sale[];
  return <div><PageHeader title="Pharmacy Sales" description="Immutable OP and IP dispensing records with actual quantities and amounts" /><DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search patient name or phone" ariaLabel="Search pharmacy sales" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date/Time</TableHead><TableHead>Patient</TableHead><TableHead>Source</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Dispensed By</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((sale) => <TableRow key={sale.id}><TableCell>{formatHospitalDate(sale.created_at, true)}</TableCell><TableCell><span className="font-medium">{sale.patients?.name}</span><span className="block text-xs text-muted-foreground">{sale.patients?.phone_normalized}</span></TableCell><TableCell className="uppercase">{sale.source}</TableCell><TableCell>{sale.pharmacy_sale_items.length}</TableCell><TableCell>{formatInr(sale.total_paise)}</TableCell><TableCell>{sale.profiles?.full_name ?? "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{q ? "No pharmacy sales match this search." : "No pharmacy sales recorded."}</TableCell></TableRow>}</TableBody></Table></div><TablePager page={page} pages={Math.max(1, Math.ceil((count ?? 0) / size))} total={count ?? 0} params={{ q }} /></CardContent></Card></div>;
}
