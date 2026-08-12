import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatHospitalDate } from "@/lib/domain/date";
import { containsSearchPattern } from "@/lib/domain/search";
import { AddUserDialog, EditStaffDialog } from "@/features/admin/admin-dialogs";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DebouncedSearchInput } from "@/components/shared/debounced-search-input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  doctors: { display_name: string } | null;
};
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRoute("/admin/users");
  const q = (await searchParams).q?.trim() ?? "";
  const admin = createSupabaseAdminClient();
  let profilesQuery = admin
    .from("profiles")
    .select(
      "id,full_name,email,role,status,doctors!profiles_doctor_id_fkey(display_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) {
    const pattern = containsSearchPattern(q);
    const filters = [
      `full_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
    ];
    const role = q.toLowerCase().replace(/\s+/g, "_");
    if (["admin", "reception", "op", "doctor", "ip", "pharmacy"].includes(role)) {
      filters.push(`role.eq.${role}`);
    }
    profilesQuery = profilesQuery.or(filters.join(","));
  }
  const [{ data: profiles }, { data: authData }] = await Promise.all([
    profilesQuery,
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
  ]);
  const signIns = new Map(
    authData?.users.map((user) => [user.id, user.last_sign_in_at]),
  );
  const rows = (profiles ?? []) as unknown as UserRow[];
  return (
    <div>
      <PageHeader
        title="Staff Users"
        description="Authentication accounts, roles, doctor links, and access status"
        actions={<AddUserDialog />}
      />
      <DebouncedSearchInput className="mb-4 max-w-md" initialValue={q} placeholder="Search name, email or role" ariaLabel="Search staff users" />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Linked Doctor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="capitalize">{user.role}</TableCell>
                    <TableCell>{user.doctors?.display_name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} />
                    </TableCell>
                    <TableCell>
                      {signIns.get(user.id)
                        ? formatHospitalDate(signIns.get(user.id)!, true)
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role === "doctor" ? <span className="text-xs text-muted-foreground">Use Doctor Master</span> : <EditStaffDialog user={{ id: user.id, fullName: user.full_name, role: user.role, status: user.status }} />}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{q ? "No staff users match this search." : "No staff users found."}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
