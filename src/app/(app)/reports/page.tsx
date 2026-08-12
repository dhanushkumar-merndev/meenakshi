import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { containsSearchPattern, EMPTY_UUID } from "@/lib/domain/search";
import { findMatchingPatientIds } from "@/lib/search/patients";
import { PageHeader } from "@/components/shared/page-header";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { TablePager } from "@/components/shared/table-pager";
import { UploadReportDialog } from "@/features/reports/upload-report-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type Report = {
  id: string;
  report_name: string;
  report_date: string;
  display_name: string;
  status: string;
  patients: { name: string; phone_normalized: string } | null;
  report_categories: { name: string } | null;
};
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const profile = await requireRoute("/reports");
  const params = await searchParams; const page = Math.max(1, Number(params.page) || 1); const size = 50; const q = params.q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const patientIds = q ? await findMatchingPatientIds(supabase, q) : [];
  let reportsQuery = supabase
    .from("patient_reports")
    .select(
      "id,report_name,report_date,display_name,status,patients(name,phone_normalized),report_categories(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (q) {
    const pattern = containsSearchPattern(q);
    reportsQuery = reportsQuery.or([
      `report_name.ilike.${pattern}`,
      `display_name.ilike.${pattern}`,
      patientIds.length ? `patient_id.in.(${patientIds.join(",")})` : `patient_id.eq.${EMPTY_UUID}`,
    ].join(","));
  }
  const [{ data, count }, { data: categories }, { data: testOrders }] =
    await Promise.all([
      reportsQuery,
      supabase
        .from("report_categories")
        .select("id,name")
        .eq("active", true)
        .order("name"),
      supabase.from("test_orders").select("id,patient_id,visit_id,ip_ticket_id,test_name,patients(name,phone_normalized)").in("status", ["ordered", "report_pending"]).order("created_at").limit(100),
    ]);
  const rows = (data ?? []) as unknown as Report[];
  return (
    <div>
      <PageHeader
        title="Patient Reports"
        description="Private report metadata and report-ready follow-up workflow"
        actions={
          ["admin", "reception", "op", "ip"].includes(profile.role) ? (
            <UploadReportDialog
              categories={categories ?? []}
              testOrders={(testOrders ?? []).map((item) => {
                const patient = item.patients as unknown as {
                  name: string;
                  phone_normalized: string;
                } | null;
                return {
                  id: item.id,
                  patientId: item.patient_id,
                  patientLabel: patient
                    ? `${patient.name} · ${patient.phone_normalized}`
                    : "Patient",
                  visitId: item.visit_id,
                  ipTicketId: item.ip_ticket_id,
                  label: `${item.test_name} · ${patient?.name ?? "Patient"}`,
                };
              })}
            />
          ) : undefined
        }
      />
      <DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search patient, phone or report name" ariaLabel="Search patient reports" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        {formatHospitalDate(report.report_date)}
                      </TableCell>
                      <TableCell>{report.patients?.name}</TableCell>
                      <TableCell>{report.patients?.phone_normalized}</TableCell>
                      <TableCell className="font-medium">
                        {report.report_name}
                      </TableCell>
                      <TableCell>{report.report_categories?.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={report.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          render={
                            <a
                              href={`/api/reports/${report.id}`}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          Open Securely
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      {q ? "No reports match this search." : "No reports uploaded."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div><TablePager page={page} pages={Math.max(1, Math.ceil((count ?? 0) / size))} total={count ?? 0} params={{ q }} />
        </CardContent>
      </Card>
    </div>
  );
}
