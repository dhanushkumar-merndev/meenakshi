import { Activity, BedDouble, ClipboardCheck, Clock3, IndianRupee, PackageX, UserRound, Users } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getDashboardData } from "@/features/dashboard/data";
import { formatInr } from "@/lib/domain/money";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatPrescriptionNumber } from "@/lib/domain/prescription";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const metricSets = {
  admin: [
    ["patients_today", "Patients Today", Users], ["visits_today", "OP Visits Today", UserRound],
    ["waiting", "Waiting", Clock3], ["current_ip", "Current IP", BedDouble],
    ["collected_today_paise", "Collected Today", IndianRupee], ["low_stock", "Low Stock", PackageX],
  ],
  reception: [
    ["patients_today", "Registrations Today", Users], ["visits_today", "Visits Today", UserRound],
    ["waiting", "Waiting", Clock3], ["followups_due", "Follow-ups Due", ClipboardCheck],
    ["reports_ready", "Reports Ready", Activity], ["collected_today_paise", "Collected Today", IndianRupee],
  ],
  op: [["waiting", "Waiting", Clock3], ["vitals_pending", "Vitals Pending", Activity], ["ready", "Ready for Doctor", ClipboardCheck], ["completed", "Completed Today", UserRound], ["reports_pending", "Reports Pending", Activity]],
  doctor: [["waiting", "Waiting for Me", Clock3], ["ready", "Ready for Me", ClipboardCheck], ["completed", "Completed Today", UserRound], ["followups_due", "Follow-ups Today", Activity], ["reports_ready", "Reports to Review", ClipboardCheck], ["current_ip", "My IP Patients", BedDouble]],
  ip: [["current_ip", "Currently Admitted", BedDouble], ["admissions_today", "Admissions Today", UserRound], ["discharges_today", "Discharges Today", ClipboardCheck], ["ip_balance_paise", "Running Balance", IndianRupee]],
  pharmacy: [["pending_prescriptions", "Pending Prescriptions", ClipboardCheck], ["pharmacy_sales_today_paise", "Today's Sales", IndianRupee], ["low_stock", "Low Stock", PackageX], ["out_of_stock", "Out of Stock", PackageX], ["expiring_soon", "Expiring Soon", Clock3], ["dispensed_today", "Dispensed Today", Activity]],
} as const;

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const { summary, activity } = await getDashboardData(profile);
  const metrics = metricSets[profile.role];
  return (
    <div>
      <PageHeader title={`Good day, ${profile.fullName.split(" ")[0]}`} description={`${profile.role[0].toUpperCase() + profile.role.slice(1)} dashboard · live hospital operations`} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map(([key, label, Icon]) => {
          const value = summary[key] ?? 0;
          const formatted = key.endsWith("_paise") ? formatInr(value) : new Intl.NumberFormat("en-IN").format(value);
          return <Card key={key}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatted}</p></div><span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-4" /></span></CardContent></Card>;
        })}
      </section>
      <DashboardActivity activity={activity} />
    </div>
  );
}

function DashboardActivity({ activity }: { activity: Awaited<ReturnType<typeof getDashboardData>>["activity"] }) {
  if (activity.kind === "pharmacy") return <Card className="mt-5 overflow-hidden"><CardHeader><CardTitle className="text-base">Pending prescriptions</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Prescription</TableHead><TableHead>Patient</TableHead><TableHead>Source</TableHead><TableHead>Doctor</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{activity.rows.length ? activity.rows.map((row) => { const visit = row.visits as unknown as { patients: { name: string } | null } | null; const ip = row.ip_tickets as unknown as { patients: { name: string } | null } | null; return <TableRow key={row.id}><TableCell className="font-mono text-xs font-medium">{formatPrescriptionNumber(row.prescription_number)}</TableCell><TableCell className="font-medium">{visit?.patients?.name ?? ip?.patients?.name ?? "—"}</TableCell><TableCell className="uppercase">{row.ip_ticket_id ? "IP" : "OP"}</TableCell><TableCell>{(row.doctors as unknown as { display_name: string } | null)?.display_name ?? "—"}</TableCell><TableCell>{row.prescription_items?.length ?? 0}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell>{formatHospitalDate(row.created_at, true)}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">No prescriptions are waiting.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>;
  if (activity.kind === "ip") return <Card className="mt-5 overflow-hidden"><CardHeader><CardTitle className="text-base">Current IP patients</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Room/Bed</TableHead><TableHead>Status</TableHead><TableHead>Admitted</TableHead></TableRow></TableHeader><TableBody>{activity.rows.length ? activity.rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.ticket_number}</TableCell><TableCell>{(row.patients as unknown as { name: string } | null)?.name ?? (row.is_emergency ? "Unidentified emergency" : "—")}</TableCell><TableCell>{(row.doctors as unknown as { display_name: string } | null)?.display_name ?? "—"}</TableCell><TableCell>{row.room ?? "—"}/{row.bed ?? "—"}</TableCell><TableCell><StatusBadge status={row.status} /></TableCell><TableCell>{formatHospitalDate(row.admission_at)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No patients currently admitted.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>;
  return <Card className="mt-5 overflow-hidden"><CardHeader><CardTitle className="text-base">Recent visits</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Token</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{activity.rows.length ? activity.rows.map((visit) => <TableRow key={visit.id}><TableCell className="font-medium">#{visit.token_number}</TableCell><TableCell>{visit.patients?.name ?? "—"}</TableCell><TableCell>{visit.doctors?.display_name ?? "—"}</TableCell><TableCell>{visit.visit_type}</TableCell><TableCell><StatusBadge status={visit.status} /></TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{formatHospitalDate(visit.created_at, true)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No visits yet today.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>;
}
