import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";
import { ChargeDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { containsSearchPattern } from "@/lib/domain/search";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRoute("/admin/charges");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("charges").select("id,category,charge_name,amount_paise,active").order("category").order("charge_name");
  if (q) { const pattern = containsSearchPattern(q); query = query.or(`category.ilike.${pattern},charge_name.ilike.${pattern}`); }
  const { data } = await query;
  const rows = data ?? [];
  return <div><PageHeader title="Charges" description="Reusable OP, IP, room, treatment, test, and other charge presets" actions={<ChargeDialog />} /><DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search charge name or category" ariaLabel="Search charges" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Charge Name</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell>{item.category}</TableCell><TableCell className="font-medium">{item.charge_name}</TableCell><TableCell>{formatInr(item.amount_paise)}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><ChargeDialog item={{ id: item.id, category: item.category, name: item.charge_name, amount: (item.amount_paise / 100).toFixed(2), active: item.active }} /></TableCell></TableRow>)}{!rows.length ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">{q ? "No charges match this search." : "No charges found."}</TableCell></TableRow> : null}</TableBody></Table></div></CardContent></Card></div>;
}
