import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReportCategoryDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { containsSearchPattern } from "@/lib/domain/search";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ReportCategoriesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRoute("/admin/report-categories");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("report_categories").select("id,name,active,created_at").order("name");
  if (q) query = query.ilike("name", containsSearchPattern(q));
  const { data } = await query; const rows = data ?? [];
  return <div><PageHeader title="Report Categories" description="Categories available when staff uploads a private patient report" actions={<ReportCategoryDialog />} /><DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search report category" ariaLabel="Search report categories" /><Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><ReportCategoryDialog item={item} /></TableCell></TableRow>)}{!rows.length ? <TableRow><TableCell colSpan={3} className="h-32 text-center text-muted-foreground">{q ? "No report categories match this search." : "No report categories found."}</TableCell></TableRow> : null}</TableBody></Table></CardContent></Card></div>;
}
