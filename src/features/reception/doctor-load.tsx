import { Badge } from "@/components/ui/badge";

/**
 * How busy a consultant already is, shown inside the dropdown so reception
 * can spread the load instead of guessing. "OP" is today's live queue
 * (waiting or in consultation), "IP" is the patients they are currently
 * carrying on the ward.
 */
export function DoctorLoad({
  opActive,
  ipActive,
}: {
  opActive?: number | undefined;
  ipActive?: number | undefined;
}) {
  if (opActive === undefined && ipActive === undefined) return null;
  const op = opActive ?? 0;
  const ip = ipActive ?? 0;
  if (!op && !ip)
    return <span className="text-xs text-muted-foreground">free</span>;
  return (
    <span className="flex items-center gap-1">
      {op ? (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          OP {op}
        </Badge>
      ) : null}
      {ip ? (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          IP {ip}
        </Badge>
      ) : null}
    </span>
  );
}
