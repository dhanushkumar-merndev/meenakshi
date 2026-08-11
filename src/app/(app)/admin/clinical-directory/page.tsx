import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClinicalTermDialog } from "@/features/admin/master-dialogs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function ClinicalDirectoryPage() {
  await requireRoute("/admin/clinical-directory");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clinical_terms")
    .select("id,term_type,display_text,search_aliases,active,source")
    .order("term_type")
    .order("display_text")
    .range(0, 99);
  return (
    <div>
      <PageHeader
        title="Clinical Directory"
        description="Local offline-ready terminology for doctor autocomplete"
        actions={<ClinicalTermDialog />}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Display Text</TableHead>
                <TableHead>Search Aliases</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((term) => (
                <TableRow key={term.id}>
                  <TableCell className="capitalize">{term.term_type}</TableCell>
                  <TableCell className="font-medium">
                    {term.display_text}
                  </TableCell>
                  <TableCell>{term.search_aliases.join(", ") || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={term.active ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell>{term.source}</TableCell>
                  <TableCell>
                    <ClinicalTermDialog item={{ id: term.id, type: term.term_type, displayText: term.display_text, aliases: term.search_aliases.join(", "), source: term.source, active: term.active }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
