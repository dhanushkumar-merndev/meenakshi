import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, minutesSince } from "@/lib/domain/date";
import { VitalsDialog } from "@/features/op/vitals-dialog";
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

type QueueRow = {
  id: string;
  token_number: number;
  created_at: string;
  status: string;
  patients: { name: string; dob: string | null; gender: string } | null;
  doctors: { display_name: string } | null;
  vitals: Array<{
    weight_kg: number | null;
    height_cm: number | null;
    temperature_c: number | null;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    pulse: number | null;
    spo2: number | null;
    respiratory_rate: number | null;
    notes: string | null;
  }>;
};
export default async function OpQueuePage() {
  await requireRoute("/op");
  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const { data } = await supabase
    .from("visits")
    .select(
      "id,token_number,created_at,status,patients(name,dob,gender),doctors(display_name),vitals(weight_kg,height_cm,temperature_c,bp_systolic,bp_diastolic,pulse,spo2,respiratory_rate,notes)",
    )
    .eq("visit_date", today)
    .neq("status", "cancelled")
    .order("token_number");
  const rows = (data ?? []) as unknown as QueueRow[];
  return (
    <div>
      <PageHeader
        title="Today's OP Queue"
        description="Record vitals and move patients to the doctor queue"
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
                  <TableHead>Doctor</TableHead>
                  <TableHead>Vitals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((visit) => {
                    const vitals = visit.vitals?.[0];
                    const waiting = minutesSince(visit.created_at);
                    const values = vitals
                      ? {
                          weight: vitals.weight_kg,
                          height: vitals.height_cm,
                          temperature: vitals.temperature_c,
                          systolic: vitals.bp_systolic,
                          diastolic: vitals.bp_diastolic,
                          pulse: vitals.pulse,
                          spo2: vitals.spo2,
                          respiratoryRate: vitals.respiratory_rate,
                          notes: vitals.notes,
                        }
                      : undefined;
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
                        <TableCell>{visit.doctors?.display_name}</TableCell>
                        <TableCell>
                          {vitals
                            ? `${vitals.bp_systolic ?? "—"}/${vitals.bp_diastolic ?? "—"} · SpO₂ ${vitals.spo2 ?? "—"}`
                            : "Pending"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={visit.status} />
                        </TableCell>
                        <TableCell>{waiting} min</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              render={<Link href={`/visits/${visit.id}`} />}
                            >
                              Open
                            </Button>
                            {visit.status !== "completed" ? (
                              <VitalsDialog
                                visitId={visit.id}
                                patientName={visit.patients?.name ?? "Patient"}
                                initialVitals={values}
                              />
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No patients in today&apos;s queue.
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
