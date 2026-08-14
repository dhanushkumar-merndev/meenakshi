import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";
import { BarChart, RankedBarChart, RoseChart, TrendChart, ValueVolumeChart } from "@/features/analytics/analytics-charts";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Analytics = {
  total_visits: number; unique_patients: number; new_patients: number;
  op_collected_paise: number; ip_collected_paise: number; pharmacy_collected_paise: number; outstanding_paise: number; current_ip: number;
  visits_by_day: Array<{ date: string; visits: number }>;
  collections_by_day: Array<{ date: string; op: number; ip: number; pharmacy: number }>;
  visits_by_hour: Array<{ hour: number; visits: number }>;
  visits_by_status: Array<{ status: string; visits: number }>;
  doctor_visit_mix: Array<{ doctor: string; op: number; follow_up: number }>;
  ip_flow_by_day: Array<{ date: string; admissions: number; discharges: number }>;
  ip_by_category: Array<{ category: string; amount_paise: number }>;
  pharmacy_sales_by_day: Array<{ date: string; amount_paise: number; items: number }>;
  top_medicines: Array<{ medicine: string; quantity: number }>;
  collections_by_mode: Array<{ mode: string; amount_paise: number }>;
  source_balance: Array<{ source: string; collected_paise: number; outstanding_paise: number }>;
  patients_by_day: Array<{ date: string; new_patients: number; returning_patients: number }>;
};

function dateValue(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date); }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function hourLabel(hour: number) { const suffix = hour < 12 ? "AM" : "PM"; const display = hour % 12 === 0 ? 12 : hour % 12; return `${display} ${suffix}`; }

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRoute("/admin/analytics");
  const params = await searchParams;
  const today = new Date(); const start = new Date(today); start.setDate(start.getDate() - 29);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : dateValue(start);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : dateValue(today);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_admin_overview", { p_from: from, p_to: to });
  if (error) throw new Error("Analytics could not be loaded.");
  const report = data as unknown as Analytics;

  const metrics: Array<[string, number, boolean]> = [["Total Visits", report.total_visits, false], ["Unique Patients", report.unique_patients, false], ["New Patients", report.new_patients, false], ["OP Collected", report.op_collected_paise, true], ["IP Collected", report.ip_collected_paise, true], ["Pharmacy Collected", report.pharmacy_collected_paise, true], ["Outstanding", report.outstanding_paise, true], ["Current IP", report.current_ip, false]];
  const collectionDays = report.collections_by_day.map((row) => row.date);
  const ipFlowDays = report.ip_flow_by_day.map((row) => row.date);
  const pharmacyDays = report.pharmacy_sales_by_day.map((row) => row.date);
  const patientDays = report.patients_by_day.map((row) => row.date);
  const balanceSources = report.source_balance.map((row) => row.source);

  return (
    <div>
      <PageHeader title="Hospital Analytics" description="Server-aggregated operational and collection reporting without clinical performance scores" />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><label className="text-xs font-medium">From</label><Input name="from" type="date" defaultValue={from} /></div>
        <div className="space-y-1"><label className="text-xs font-medium">To</label><Input name="to" type="date" defaultValue={to} /></div>
        <Button type="submit">Apply Range</Button>
      </form>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, money]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money ? formatInr(value) : new Intl.NumberFormat("en-IN").format(value)}</p></CardContent></Card>
        ))}
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="op">OP</TabsTrigger>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="ip">IP</TabsTrigger>
          <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Patient visits" description="Visits recorded each day in the selected range">
              <TrendChart dates={report.visits_by_day.map((row) => row.date)} values={report.visits_by_day.map((row) => row.visits)} name="Visits" label="Patient visits per day" />
            </ChartCard>
            <ChartCard title="Collections by day" description="Offline money recorded against OP, IP and pharmacy each day">
              <BarChart categories={collectionDays} dateAxis money label="Daily collections by source" series={[{ name: "OP", values: report.collections_by_day.map((row) => row.op) }, { name: "IP", values: report.collections_by_day.map((row) => row.ip) }, { name: "Pharmacy", values: report.collections_by_day.map((row) => row.pharmacy) }]} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="op">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Arrivals by hour" description="Registration load across the working day — use it to plan counter staffing">
              <BarChart categories={report.visits_by_hour.map((row) => hourLabel(row.hour))} label="Visits by hour of day" series={[{ name: "Visits", values: report.visits_by_hour.map((row) => row.visits) }]} />
            </ChartCard>
            <ChartCard title="Queue outcome" description="Where visits in this range ended up across the OP workflow">
              <RoseChart data={report.visits_by_status.map((row) => ({ name: titleCase(row.status), value: row.visits }))} label="Visits by status" />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="doctors">
          <ChartCard title="Doctor workload" description="Each doctor's caseload split between first consultations and follow-ups">
            <BarChart horizontal stacked height={Math.max(280, report.doctor_visit_mix.length * 34 + 60)} categories={report.doctor_visit_mix.map((row) => row.doctor).reverse()} label="Consultations and follow-ups by doctor" series={[{ name: "OP", values: report.doctor_visit_mix.map((row) => row.op).reverse() }, { name: "Follow-up", values: report.doctor_visit_mix.map((row) => row.follow_up).reverse() }]} />
          </ChartCard>
        </TabsContent>

        <TabsContent value="ip">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Admissions and discharges" description="Daily bed flow — admissions against discharges">
              <BarChart categories={ipFlowDays} dateAxis label="IP admissions and discharges per day" series={[{ name: "Admissions", values: report.ip_flow_by_day.map((row) => row.admissions) }, { name: "Discharges", values: report.ip_flow_by_day.map((row) => row.discharges) }]} />
            </ChartCard>
            <ChartCard title="Charges by category" description="What IP tickets are actually billed for in this range">
              <RoseChart money data={report.ip_by_category.map((row) => ({ name: titleCase(row.category), value: row.amount_paise }))} label="IP charges by category" />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="pharmacy">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Dispensing per day" description="Units handed over against the value of those sales">
              <ValueVolumeChart dates={pharmacyDays} volumes={report.pharmacy_sales_by_day.map((row) => row.items)} amounts={report.pharmacy_sales_by_day.map((row) => row.amount_paise)} volumeName="Items dispensed" amountName="Sale value" label="Pharmacy items and sale value per day" />
            </ChartCard>
            <ChartCard title="Top dispensed medicines" description="Highest quantities actually dispensed, not prescribed">
              <RankedBarChart data={report.top_medicines.map((row) => ({ name: row.medicine, value: row.quantity }))} label="Dispensed quantity by medicine" />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="collections">
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Payment mode mix" description="How patients paid across OP, IP and pharmacy counters">
              <RoseChart money data={report.collections_by_mode.map((row) => ({ name: titleCase(row.mode), value: row.amount_paise }))} label="Collections by payment mode" />
            </ChartCard>
            <ChartCard title="Collected against outstanding" description="Money received versus the balance still due per source">
              <BarChart horizontal money height={260} categories={balanceSources} label="Collected and outstanding by source" series={[{ name: "Collected", values: report.source_balance.map((row) => row.collected_paise) }, { name: "Outstanding", values: report.source_balance.map((row) => row.outstanding_paise) }]} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="patients">
          <ChartCard title="New against returning patients" description="Patients attending each day, split by whether they registered that day">
            <BarChart stacked dateAxis categories={patientDays} label="New and returning patients per day" series={[{ name: "New", values: report.patients_by_day.map((row) => row.new_patients) }, { name: "Returning", values: report.patients_by_day.map((row) => row.returning_patients) }]} />
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
