import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";
import { ChargeDialog } from "@/features/admin/master-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ChargesPage() {
  await requireRoute("/admin/charges");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("charges").select("id,category,charge_name,amount_paise,active").order("category").order("charge_name");
  return <div><PageHeader title="Charges" description="Reusable OP, IP, room, treatment, test, and other charge presets" actions={<ChargeDialog />} /><Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Charge Name</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{(data ?? []).map((item) => <TableRow key={item.id}><TableCell>{item.category}</TableCell><TableCell className="font-medium">{item.charge_name}</TableCell><TableCell>{formatInr(item.amount_paise)}</TableCell><TableCell><StatusBadge status={item.active ? "active" : "inactive"} /></TableCell><TableCell className="text-right"><ChargeDialog item={{ id: item.id, category: item.category, name: item.charge_name, amount: (item.amount_paise / 100).toFixed(2), active: item.active }} /></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></div>;
}
