import Link from "next/link";
import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClinicalTermDialog } from "@/features/admin/master-dialogs";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { containsSearchPattern } from "@/lib/domain/search";
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
export default async function ClinicalDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRoute("/admin/clinical-directory");
  const q = (await searchParams).q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("clinical_terms")
    .select("id,term_type,display_text,search_aliases,active,source,code,code_system")
    .order("term_type")
    .order("display_text")
    .range(0, 99);
  // Code and code_system are searchable too -- "SNOMED" or "J45" finds a
  // coded term the same way a display-text search does.
  if (q) { const pattern = containsSearchPattern(q); query = query.or(`display_text.ilike.${pattern},term_type.ilike.${pattern},source.ilike.${pattern},code.ilike.${pattern},code_system.ilike.${pattern}`); }
  const { data } = await query;
  const rows = data ?? [];
  return (
    <div>
      <PageHeader
        title="Clinical Directory"
        description="Local offline-ready terminology for doctor autocomplete"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href="/admin/clinical-directory/import" />}>
              <FileSpreadsheet /> Bulk Import
            </Button>
            <ClinicalTermDialog />
          </div>
        }
      />
      <DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search clinical term, type or source" ariaLabel="Search clinical directory" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Display Text</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Code System</TableHead>
                <TableHead>Search Aliases</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="capitalize">{term.term_type}</TableCell>
                  <TableCell className="font-medium">
                    {term.display_text}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{term.code || "—"}</TableCell>
                  <TableCell>{term.code_system || "—"}</TableCell>
                  <TableCell>{term.search_aliases.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={term.active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>{term.source}</TableCell>
                  <TableCell>
                    <ClinicalTermDialog item={{ id: term.id, type: term.term_type, displayText: term.display_text, aliases: term.search_aliases.join(", "), source: term.source, code: term.code, codeSystem: term.code_system, active: term.active }} />
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">{q ? "No clinical terms match this search." : "No clinical terms found."}</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
