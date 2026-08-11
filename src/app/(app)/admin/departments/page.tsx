import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DepartmentDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function DepartmentsPage() {
  await requireRoute("/admin/departments");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("departments").select("id,name,description,active").order("name");
  return <div><PageHeader title="Departments" description="Clinical departments used for doctors, visits, tokens, and printing" actions={<DepartmentDialog />} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Department</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{(data ?? []).map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.name}</TableCell><TableCell>{item.description ?? "—"}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><DepartmentDialog item={item} /></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></div>;
}
