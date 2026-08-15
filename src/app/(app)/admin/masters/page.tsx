import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInr } from "@/lib/domain/money";
import { containsSearchPattern } from "@/lib/domain/search";
import {
  ChargeDialog,
  DepartmentDialog,
  ReportCategoryDialog,
} from "@/features/admin/master-dialogs";
import { RoomDialog } from "@/features/rooms/room-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { FilterTabs } from "@/components/shared/filter-tabs";
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

const TABS = [
  { label: "Departments", value: "departments" },
  { label: "Charges", value: "charges" },
  { label: "Rooms & Beds", value: "rooms" },
  { label: "Report Categories", value: "report-categories" },
];

const META: Record<string, { description: string; placeholder: string }> = {
  departments: {
    description:
      "Clinical departments used for doctors, visits, tokens, and printing",
    placeholder: "Search department or description",
  },
  charges: {
    description: "Reusable IP, room, treatment, test, and other charge presets",
    placeholder: "Search charge name or category",
  },
  rooms: {
    description:
      "Configure assignable beds once; occupancy is controlled by active IP admissions",
    placeholder: "Search room, bed, or floor",
  },
  "report-categories": {
    description:
      "Categories available when staff uploads a private patient report",
    placeholder: "Search report category",
  },
};

function EmptyRow({ span, searched }: { span: number; searched: boolean }) {
  return (
    <TableRow>
      <TableCell
        colSpan={span}
        className="h-32 text-center text-muted-foreground"
      >
        {searched ? "No records match this search." : "No records found yet."}
      </TableCell>
    </TableRow>
  );
}

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  await requireRoute("/admin/masters");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const tab = TABS.some((entry) => entry.value === params.tab)
    ? params.tab!
    : "departments";
  const supabase = await createSupabaseServerClient();
  const pattern = containsSearchPattern(q);

  return (
    <div>
      <PageHeader
        title="Masters"
        description={META[tab].description}
        actions={
          tab === "departments" ? (
            <DepartmentDialog />
          ) : tab === "charges" ? (
            <ChargeDialog />
          ) : tab === "rooms" ? (
            <RoomDialog />
          ) : (
            <ReportCategoryDialog />
          )
        }
      />
      <FilterTabs
        ariaLabel="Select master data table"
        active={tab}
        param="tab"
        params={{ q }}
        tabs={TABS}
      />
      <DebouncedSearchInput
        className="mb-4 max-w-md"
        initialValue={q}
        placeholder={META[tab].placeholder}
        ariaLabel={META[tab].placeholder}
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {tab === "departments" ? (
              <DepartmentsTable supabase={supabase} q={q} pattern={pattern} />
            ) : tab === "charges" ? (
              <ChargesTable supabase={supabase} q={q} pattern={pattern} />
            ) : tab === "rooms" ? (
              <RoomsTable supabase={supabase} q={q} pattern={pattern} />
            ) : (
              <ReportCategoriesTable
                supabase={supabase}
                q={q}
                pattern={pattern}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type TableProps = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  q: string;
  pattern: string;
};

async function DepartmentsTable({ supabase, q, pattern }: TableProps) {
  let query = supabase
    .from("departments")
    .select("id,name,description,active")
    .order("name");
  if (q) query = query.or(`name.ilike.${pattern},description.ilike.${pattern}`);
  const { data } = await query;
  const rows = data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Department</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>{item.description ?? "—"}</TableCell>
            <TableCell>
              <StatusBadge status={item.active ? "active" : "inactive"} />
            </TableCell>
            <TableCell className="text-right">
              <DepartmentDialog item={item} />
            </TableCell>
          </TableRow>
        ))}
        {rows.length ? null : <EmptyRow span={4} searched={Boolean(q)} />}
      </TableBody>
    </Table>
  );
}

async function ChargesTable({ supabase, q, pattern }: TableProps) {
  let query = supabase
    .from("charges")
    .select("id,category,charge_name,amount_paise,active")
    .order("category")
    .order("charge_name");
  if (q)
    query = query.or(`category.ilike.${pattern},charge_name.ilike.${pattern}`);
  const { data } = await query;
  const rows = data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Charge Name</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.category}</TableCell>
            <TableCell className="font-medium">{item.charge_name}</TableCell>
            <TableCell>{formatInr(item.amount_paise)}</TableCell>
            <TableCell>
              <StatusBadge status={item.active ? "active" : "inactive"} />
            </TableCell>
            <TableCell className="text-right">
              <ChargeDialog
                item={{
                  id: item.id,
                  category: item.category,
                  name: item.charge_name,
                  amount: (item.amount_paise / 100).toFixed(2),
                  active: item.active,
                }}
              />
            </TableCell>
          </TableRow>
        ))}
        {rows.length ? null : <EmptyRow span={5} searched={Boolean(q)} />}
      </TableBody>
    </Table>
  );
}

async function RoomsTable({ supabase, q, pattern }: TableProps) {
  let roomQuery = supabase
    .from("room_beds")
    .select("id,room_number,bed_number,floor,room_type,active")
    .order("floor")
    .order("room_number")
    .order("bed_number");
  if (q)
    roomQuery = roomQuery.or(
      `room_number.ilike.${pattern},bed_number.ilike.${pattern},floor.ilike.${pattern}`,
    );
  const [{ data: rooms }, { data: occupied }] = await Promise.all([
    roomQuery,
    supabase
      .from("ip_tickets")
      .select("room_bed_id")
      .in("status", ["admitted", "discharge_pending"])
      .not("room_bed_id", "is", null),
  ]);
  const used = new Set((occupied ?? []).map((entry) => entry.room_bed_id));
  const rows = rooms ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Room</TableHead>
          <TableHead>Bed</TableHead>
          <TableHead>Floor</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((room) => (
          <TableRow key={room.id}>
            <TableCell className="font-medium">{room.room_number}</TableCell>
            <TableCell>{room.bed_number}</TableCell>
            <TableCell>{room.floor}</TableCell>
            <TableCell>{room.room_type ?? "—"}</TableCell>
            <TableCell>
              <StatusBadge
                status={
                  !room.active
                    ? "inactive"
                    : used.has(room.id)
                      ? "occupied"
                      : "available"
                }
              />
            </TableCell>
            <TableCell className="text-right">
              <RoomDialog
                room={{
                  id: room.id,
                  roomNumber: room.room_number,
                  bedNumber: room.bed_number,
                  floor: room.floor,
                  roomType: room.room_type,
                  active: room.active,
                }}
              />
            </TableCell>
          </TableRow>
        ))}
        {rows.length ? null : <EmptyRow span={6} searched={Boolean(q)} />}
      </TableBody>
    </Table>
  );
}

async function ReportCategoriesTable({ supabase, q, pattern }: TableProps) {
  let query = supabase
    .from("report_categories")
    .select("id,name,active,created_at")
    .order("name");
  if (q) query = query.ilike("name", pattern);
  const { data } = await query;
  const rows = data ?? [];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>
              <StatusBadge status={item.active ? "active" : "inactive"} />
            </TableCell>
            <TableCell className="text-right">
              <ReportCategoryDialog item={item} />
            </TableCell>
          </TableRow>
        ))}
        {rows.length ? null : <EmptyRow span={3} searched={Boolean(q)} />}
      </TableBody>
    </Table>
  );
}
