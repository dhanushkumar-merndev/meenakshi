import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RoomDialog } from "@/features/rooms/room-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function RoomsAdminPage() {
  await requirePermission("configureRooms");
  const supabase = await createSupabaseServerClient();
  const [{ data: rooms }, { data: occupied }] = await Promise.all([
    supabase
      .from("room_beds")
      .select("id,room_number,bed_number,floor,room_type,active")
      .order("floor")
      .order("room_number")
      .order("bed_number"),
    supabase
      .from("ip_tickets")
      .select("room_bed_id")
      .in("status", ["admitted", "discharge_pending"])
      .not("room_bed_id", "is", null),
  ]);
  const used = new Set((occupied ?? []).map((x) => x.room_bed_id));
  return (
    <div>
      <PageHeader
        title="Rooms & Beds"
        description="Configure assignable beds once; occupancy is controlled by active IP admissions"
        actions={<RoomDialog />}
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                {(rooms ?? []).map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">
                      {room.room_number}
                    </TableCell>
                    <TableCell>{room.bed_number}</TableCell>
                    <TableCell>{room.floor}</TableCell>
                    <TableCell>{room.room_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          !room.active
                            ? "outline"
                            : used.has(room.id)
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {!room.active
                          ? "Inactive"
                          : used.has(room.id)
                            ? "Occupied"
                            : "Available"}
                      </Badge>
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
