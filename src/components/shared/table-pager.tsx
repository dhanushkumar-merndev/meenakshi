import Link from "next/link";
import { Button } from "@/components/ui/button";

export function TablePager({ page, pages, total, params = {} }: { page: number; pages: number; total: number; params?: Record<string, string | undefined> }) {
  const href = (next: number) => { const search = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value) search.set(key, value); search.set("page", String(next)); return `?${search}`; };
  return <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground"><span>{total.toLocaleString("en-IN")} records</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} render={page > 1 ? <Link href={href(page - 1)} /> : undefined}>Previous</Button><span className="px-1">{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} render={page < pages ? <Link href={href(page + 1)} /> : undefined}>Next</Button></div></div>;
}
