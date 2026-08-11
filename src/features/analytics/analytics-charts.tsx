"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const visitsConfig = { visits: { label: "Visits", color: "var(--chart-1)" } } satisfies ChartConfig;
const collectionConfig = { op: { label: "OP", color: "var(--chart-1)" }, ip: { label: "IP", color: "var(--chart-2)" }, pharmacy: { label: "Pharmacy", color: "var(--chart-3)" } } satisfies ChartConfig;
export function VisitTrendChart({ data }: { data: Array<{ date: string; visits: number }> }) {
  return <ChartContainer config={visitsConfig} className="h-64 w-full"><LineChart accessibilityLayer data={data} margin={{ left: 8, right: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(5)} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="visits" type="monotone" stroke="var(--color-visits)" strokeWidth={2} dot={false} /></LineChart></ChartContainer>;
}
export function CollectionsChart({ data }: { data: Array<{ date: string; op: number; ip: number; pharmacy: number }> }) {
  const rows = data.map((row) => ({ ...row, op: row.op / 100, ip: row.ip / 100, pharmacy: row.pharmacy / 100 }));
  return <ChartContainer config={collectionConfig} className="h-64 w-full"><BarChart accessibilityLayer data={rows}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(5)} /><YAxis tickLine={false} axisLine={false} width={48} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="op" fill="var(--color-op)" radius={3} /><Bar dataKey="ip" fill="var(--color-ip)" radius={3} /><Bar dataKey="pharmacy" fill="var(--color-pharmacy)" radius={3} /></BarChart></ChartContainer>;
}
