"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Result = { id: string; name: string; phone_normalized: string; dob: string | null; gender: string };
export function HeaderPatientSearch() {
  const router = useRouter(); const [input, setInput] = useState(""); const [query, setQuery] = useState(""); const [focused, setFocused] = useState(false); const [active, setActive] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setQuery(input.trim()), 225); return () => clearTimeout(timer); }, [input]);
  const { data, isFetching } = useQuery({ queryKey: ["patient-search", query], enabled: query.length >= 2, queryFn: async ({ signal }) => { const response = await fetch(`/api/search/patients?q=${encodeURIComponent(query)}`, { signal }); if (!response.ok) throw new Error("Search unavailable"); return (await response.json()) as { items: Result[] }; }, staleTime: 30_000 });
  const rows = data?.items ?? []; const open = focused && query.length >= 2;
  const select = (row: Result) => { setFocused(false); setInput(""); router.push(`/patients/${row.id}`); };
  return <div className="relative min-w-0 max-w-md flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={input} onChange={(event) => { setInput(event.target.value); setActive(0); }} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} onKeyDown={(event) => { if (!open) return; if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(rows.length - 1, value + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); } if (event.key === "Enter" && rows[active]) { event.preventDefault(); select(rows[active]); } if (event.key === "Escape") setFocused(false); }} className="h-9 pl-9" placeholder="Search patient by phone or name" aria-label="Search patient" role="combobox" aria-expanded={open} />{open ? <Card className="absolute top-11 z-50 w-full gap-1 p-1 shadow-lg">{isFetching && !data ? <div className="space-y-2 p-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : rows.length ? rows.map((row, index) => <Button key={row.id} variant={index === active ? "secondary" : "ghost"} className="h-auto w-full justify-start px-3 py-2 text-left" onMouseDown={(event) => event.preventDefault()} onClick={() => select(row)}><span className="min-w-0"><span className="block truncate font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">Patient ID {row.phone_normalized} · {row.gender}</span></span></Button>) : <p className="p-3 text-sm text-muted-foreground">No matching patient.</p>}</Card> : null}</div>;
}
