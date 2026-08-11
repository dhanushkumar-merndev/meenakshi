import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatHospitalDate } from "@/lib/domain/date";
import { formatInr } from "@/lib/domain/money";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Payment = { id: string; created_at: string; amount_paise: number; mode: string; reference: string | null; visits: { id: string; token_number: number; patients: { name: string; phone_normalized: string } | null; doctors: { display_name: string } | null } | null; profiles: { full_name: string } | null };
export default async function ReceptionPaymentsPage() {
  await requireRoute("/reception/payments"); const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("visit_payments").select("id,created_at,amount_paise,mode,reference,visits(id,token_number,patients(name,phone_normalized),doctors(display_name)),profiles!visit_payments_collected_by_fkey(full_name)").order("created_at", { ascending: false }).range(0, 49);
  const rows = (data ?? []) as unknown as Payment[];
  return <div><PageHeader title="OP Payments" description="Offline collection entries are immutable and displayed newest first" /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date/Time</TableHead><TableHead>Patient</TableHead><TableHead>Token</TableHead><TableHead>Doctor</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Collected By</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.length ? rows.map((payment) => <TableRow key={payment.id}><TableCell>{formatHospitalDate(payment.created_at, true)}</TableCell><TableCell><span className="font-medium">{payment.visits?.patients?.name}</span><span className="block text-xs text-muted-foreground">{payment.visits?.patients?.phone_normalized}</span></TableCell><TableCell>#{payment.visits?.token_number}</TableCell><TableCell>{payment.visits?.doctors?.display_name}</TableCell><TableCell>{formatInr(payment.amount_paise)}</TableCell><TableCell className="capitalize">{payment.mode.replaceAll("_", " ")}</TableCell><TableCell>{payment.profiles?.full_name ?? "—"}</TableCell><TableCell className="text-right">{payment.visits ? <Button size="sm" variant="outline" render={<Link href={`/visits/${payment.visits.id}`} />}>Open</Button> : null}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No payments recorded.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div>;
}
