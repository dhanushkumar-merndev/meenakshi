import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReportCategoryDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ReportCategoriesPage() {
  await requireRoute("/admin/report-categories");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("report_categories").select("id,name,active,created_at").order("name");
  return <div><PageHeader title="Report Categories" description="Categories available when staff uploads a private patient report" actions={<ReportCategoryDialog />} /><Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{(data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><ReportCategoryDialog item={item} /></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>;
}
