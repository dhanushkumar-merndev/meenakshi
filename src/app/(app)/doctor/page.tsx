import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge } from "@/lib/domain/date";
import { PageHeader } from "@/components/shared/page-header";
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

type DoctorQueue = {
  id: string;
  token_number: number;
  created_at: string;
  visit_type: string;
  status: string;
  patients: { name: string; dob: string | null; gender: string } | null;
  vitals: Array<{
    bp_systolic: number | null;
    bp_diastolic: number | null;
    temperature_c: number | null;
    spo2: number | null;
  }>;
};
export default async function DoctorQueuePage() {
  const profile = await requireRoute("/doctor");
  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  let query = supabase
    .from("visits")
    .select(
      "id,token_number,created_at,visit_type,status,patients(name,dob,gender),vitals(bp_systolic,bp_diastolic,temperature_c,spo2)",
    )
    .eq("visit_date", today)
    .in("status", ["ready", "in_consultation", "waiting", "vitals_pending"])
    .order("token_number");
  if (profile.doctorId) query = query.eq("doctor_id", profile.doctorId);
  const { data } = await query;
  const rows = (data ?? []) as unknown as DoctorQueue[];
  return (
    <div>
      <PageHeader
        title="My Queue"
        description="Patients assigned to you today"
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Age/Gender</TableHead>
                  <TableHead>Visit Type</TableHead>
                  <TableHead>Vitals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((visit) => {
                    const v = visit.vitals?.[0];
                    return (
                      <TableRow key={visit.id}>
                        <TableCell className="text-lg font-semibold">
                          #{visit.token_number}
                        </TableCell>
                        <TableCell className="font-medium">
                          {visit.patients?.name}
                        </TableCell>
                        <TableCell className="capitalize">
                          {visit.patients?.dob
                            ? `${calculateAge(visit.patients.dob)} yrs`
                            : "—"}{" "}
                          / {visit.patients?.gender}
                        </TableCell>
                        <TableCell className="capitalize">
                          {visit.visit_type.replaceAll("_", " ")}
                        </TableCell>
                        <TableCell>
                          {v
                            ? `BP ${v.bp_systolic ?? "—"}/${v.bp_diastolic ?? "—"} · ${v.temperature_c ?? "—"}°C`
                            : "Pending"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={visit.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            render={<Link href={`/visits/${visit.id}`} />}
                            size="sm"
                          >
                            {visit.status === "in_consultation"
                              ? "Continue"
                              : "Consult"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Your queue is clear.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
