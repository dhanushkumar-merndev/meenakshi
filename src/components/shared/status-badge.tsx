import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const positive = ["active", "completed", "paid", "ready", "dispensed", "admitted", "in_stock"].includes(status);
  const negative = ["inactive", "cancelled", "expired", "out_of_stock", "failed"].includes(status);
  return <Badge variant={negative ? "destructive" : positive ? "default" : "secondary"} className="whitespace-nowrap capitalize">{status.replaceAll("_", " ")}</Badge>;
}
