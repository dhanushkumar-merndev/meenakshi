import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DepartmentDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { containsSearchPattern } from "@/lib/domain/search";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRoute("/admin/departments");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("departments").select("id,name,description,active").order("name");
  if (q) { const pattern = containsSearchPattern(q); query = query.or(`name.ilike.${pattern},description.ilike.${pattern}`); }
  const { data } = await query;
  const rows = data ?? [];
  return <div><PageHeader title="Departments" description="Clinical departments used for doctors, visits, tokens, and printing" actions={<DepartmentDialog />} /><DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search department or description" ariaLabel="Search departments" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.description ?? "—"}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><DepartmentDialog item={item} /></TableCell></TableRow>)}{!rows.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">{q ? "No departments match this search." : "No departments found."}</TableCell></TableRow> : null}</TableBody></Table></div></CardContent></Card></div>;
}
