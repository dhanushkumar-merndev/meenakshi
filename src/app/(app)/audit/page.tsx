import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { PageHeader } from "@/components/shared/page-header";
import { TablePager } from "@/components/shared/table-pager";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type Audit = {
  id: number;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  profiles: { full_name: string } | null;
};
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRoute("/audit");
  const page = Math.max(1, Number((await searchParams).page) || 1); const size = 50;
  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from("audit_logs")
    .select("id,created_at,action,entity_type,entity_id,profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  const rows = (data ?? []) as unknown as Audit[];
  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Identifiers and action metadata only; clinical content is not copied into logs"
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {formatHospitalDate(log.created_at, true)}
                  </TableCell>
                  <TableCell>{log.profiles?.full_name ?? "System"}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>{log.entity_type ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.entity_id ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table><TablePager page={page} pages={Math.max(1, Math.ceil((count ?? 0) / size))} total={count ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}
