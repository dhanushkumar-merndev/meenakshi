import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAge, formatHospitalDate, isHospitalToday } from "@/lib/domain/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { NewPatientDialog } from "@/features/patients/new-patient-dialog";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
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

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRoute("/patients");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(
    1,
    Number(typeof params.page === "string" ? params.page : 1) || 1,
  );
  const pageSize = 20;
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("patients")
    .select(
      "id,name,uhid,phone_normalized,dob,gender,status,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  // UHID is the visible Patient ID, so it is searchable alongside phone and name.
  if (q)
    query = /^mh-?\d/i.test(q)
      ? query.ilike("uhid", `${q.replace(/\s+/g, "")}%`)
      : /^\d+$/.test(q.replace(/\D/g, ""))
        ? query.or(`phone_normalized.like.${q.replace(/\D/g, "")}%,uhid.ilike.%${q.replace(/\D/g, "")}%`)
        : query.ilike("name_normalized", `${q.toLowerCase()}%`);
  const { data, count = 0, error } = await query;
  if (error) throw error;
  const patients = data ?? [];
  const patientIds = patients.map((patient) => patient.id);
  const visitCounts = new Map<string, number>();
  if (patientIds.length) {
    const { data: visits, error: visitsError } = await supabase
      .from("visits")
      .select("patient_id")
      .in("patient_id", patientIds);
    if (visitsError) throw visitsError;
    for (const visit of visits ?? []) {
      visitCounts.set(
        visit.patient_id,
        (visitCounts.get(visit.patient_id) ?? 0) + 1,
      );
    }
  }
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search by UHID, phone or name"
        actions={
          profile.role === "admin" ||
          profile.role === "reception" ||
          profile.role === "ip" ? (
            <NewPatientDialog />
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-0">
          <div className="border-b p-3">
            <DebouncedSearchInput
              className="max-w-md"
              initialValue={q}
              placeholder="UHID, phone or patient name"
              ariaLabel="Search patients by UHID, phone or name"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>UHID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Age/Gender</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.length ? (
                  patients.map((patient) => {
                    const age = patient.dob ? calculateAge(patient.dob) : null;
                    return (
                      <TableRow key={patient.id} historical={!isHospitalToday(patient.created_at)}>
                        <TableCell className="font-medium">
                          {patient.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">
                          {patient.uhid}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {patient.phone_normalized}
                        </TableCell>
                        <TableCell className="capitalize">
                          {age === null ? "—" : `${age} yrs`} / {patient.gender}
                        </TableCell>
                        <TableCell>{visitCounts.get(patient.id) ?? 0}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatHospitalDate(patient.created_at)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={patient.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/patients/${patient.id}`} />}
                          >
                            Open
                          </Button>
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
                      {q
                        ? "No matching patients."
                        : "No patients registered yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
            <span>{count ?? 0} patients</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                render={
                  page > 1 ? (
                    <Link
                      href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}
                    />
                  ) : undefined
                }
              >
                Previous
              </Button>
              <span className="flex items-center px-2">
                {page} / {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                render={
                  page < pages ? (
                    <Link
                      href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}
                    />
                  ) : undefined
                }
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
