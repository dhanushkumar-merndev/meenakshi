import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ReviewReportButton } from "@/features/reports/review-report-button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = { visit_id: string; assessment: string | null; follow_up_type: string; follow_up_date: string | null; visits: { created_at: string; patients: { name: string; phone_normalized: string } | null; patient_reports: Array<{ id: string; status: string }> } | null };
export default async function DoctorFollowUpsPage() {
  await requireRoute("/doctor/follow-ups"); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("consultations").select("visit_id,assessment,follow_up_type,follow_up_date,visits!inner(created_at,patients(name,phone_normalized),patient_reports(id,status))").neq("follow_up_type", "none").eq("status", "completed").order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as Row[];
  return <div><PageHeader title="My Follow-ups" description="Previous consultations, follow-up triggers, and newly uploaded reports" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Previous Visit</TableHead><TableHead>Reason</TableHead><TableHead>Trigger</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((row) => { const ready = row.visits?.patient_reports.find((report) => report.status === "ready"); return <TableRow key={row.visit_id}><TableCell><span className="font-medium">{row.visits?.patients?.name}</span><span className="block text-xs text-muted-foreground">{row.visits?.patients?.phone_normalized}</span></TableCell><TableCell>{row.visits ? formatHospitalDate(row.visits.created_at) : "—"}</TableCell><TableCell>{row.assessment ?? "Follow-up advised"}</TableCell><TableCell className="capitalize">{row.follow_up_type.replaceAll("_", " ")}</TableCell><TableCell className="text-right">{ready ? <ReviewReportButton reportId={ready.id} /> : <Button size="sm" variant="outline" render={<Link href={`/visits/${row.visit_id}`} />}>Open History</Button>}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No follow-ups recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div>;
}
