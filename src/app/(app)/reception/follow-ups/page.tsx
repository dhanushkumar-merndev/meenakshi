import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { FollowUpDialog } from "@/features/visits/follow-up-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FollowUp = { visit_id: string; assessment: string | null; follow_up_type: string; follow_up_date: string | null; follow_up_days: number | null; visits: { created_at: string; patient_id: string; doctor_id: string; patients: { name: string; phone_normalized: string } | null; doctors: { display_name: string; follow_up_fee_paise: number } | null } | null };
export default async function FollowUpsPage() {
  await requireRoute("/reception/follow-ups");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("consultations").select("visit_id,assessment,follow_up_type,follow_up_date,follow_up_days,visits!inner(created_at,patient_id,doctor_id,patients(name,phone_normalized),doctors(display_name,follow_up_fee_paise))").neq("follow_up_type", "none").eq("status", "completed").order("updated_at", { ascending: false }).limit(100);
  const source = (data ?? []) as unknown as FollowUp[];
  const { data: createdFollowUps } = source.length ? await supabase.from("visits").select("related_previous_visit_id").in("related_previous_visit_id", source.map((row) => row.visit_id)) : { data: [] };
  const completed = new Set((createdFollowUps ?? []).map((row) => row.related_previous_visit_id));
  const rows = source.filter((row) => !completed.has(row.visit_id));
  return <div><PageHeader title="Follow-ups" description="Due, after-report, and scheduled follow-ups create a new linked visit" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Phone</TableHead><TableHead>Doctor</TableHead><TableHead>Previous Visit</TableHead><TableHead>Due / Trigger</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((row) => <TableRow key={row.visit_id}><TableCell className="font-medium">{row.visits?.patients?.name}</TableCell><TableCell>{row.visits?.patients?.phone_normalized}</TableCell><TableCell>{row.visits?.doctors?.display_name}</TableCell><TableCell>{row.visits ? formatHospitalDate(row.visits.created_at) : "—"}</TableCell><TableCell className="capitalize">{row.follow_up_type === "specific_date" ? row.follow_up_date : row.follow_up_type.replaceAll("_", " ")}</TableCell><TableCell className="max-w-64 truncate">{row.assessment ?? "Follow-up advised"}</TableCell><TableCell className="text-right">{row.visits?.patients && row.visits.doctors ? <FollowUpDialog followUp={{ patientId: row.visits.patient_id, patientName: row.visits.patients.name, previousVisitId: row.visit_id, doctorId: row.visits.doctor_id, doctorName: row.visits.doctors.display_name, feePaise: row.visits.doctors.follow_up_fee_paise, reason: row.assessment ?? "Follow-up" }} /> : null}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No follow-ups awaiting a new visit.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div>;
}
