import { Mail, MapPin, Phone } from "lucide-react";
import { HospitalLogo } from "@/components/shared/hospital-logo";
import type { HospitalIdentity } from "@/lib/print/hospital-identity";
import { cn } from "@/lib/utils";

/**
 * The printed letterhead, identical on every document the hospital hands out —
 * token, prescription, receipt, IP bill, discharge summary.
 *
 * One fixed layout, matching the hospital's own stationery card:
 *
 *     [ logo ]  NAME                                address
 *               motto                                phone
 *                                                     email
 *
 * The logo sits beside the name, not above it, so the lockup reads as one
 * unit at a glance. Everything that identifies the hospital sits on the
 * left, everything needed to contact it on the right, and the document's own
 * details go underneath.
 */
export function HospitalLetterhead({
  identity,
  logoSize = 56,
  className,
}: {
  identity: HospitalIdentity;
  logoSize?: number;
  className?: string;
}) {
  const name = identity.name.trim();
  // "Meenakshi Hospital" prints as a two-line lockup; anything the hospital
  // renames itself to prints as a single line rather than being chopped.
  const words = name.split(/\s+/);
  const lockup =
    words.length > 1 && words.at(-1)?.toLowerCase() === "hospital"
      ? { top: words.slice(0, -1).join(" "), bottom: words.at(-1) as string }
      : { top: name, bottom: null };

  return (
    <div className={cn("flex w-full items-center justify-between gap-6", className)}>
      <div className="flex shrink-0 items-center gap-3">
        <HospitalLogo size={logoSize} className="shrink-0" />
        <div>
          <p className="text-lg leading-tight font-bold tracking-wide text-primary uppercase">
            {lockup.top}
          </p>
          {/* Matches the hospital's own stationery: "HOSPITAL" sits directly
              under "MEENAKSHI" at the same weight and size, not letter-spaced
              apart. */}
          {lockup.bottom ? (
            <p className="text-lg leading-tight font-bold tracking-wide text-primary uppercase">
              {lockup.bottom}
            </p>
          ) : null}
          {identity.tagline ? (
            // The motto is one phrase; on a narrow token slip it would
            // otherwise break after every bullet.
            <p className="mt-0.5 text-[10px] leading-tight font-medium whitespace-nowrap text-primary/80">
              {identity.tagline}
            </p>
          ) : null}
        </div>
      </div>
      <ContactBlock identity={identity} />
    </div>
  );
}

function ContactBlock({ identity }: { identity: HospitalIdentity }) {
  const lines: Array<[React.ComponentType<{ className?: string }>, string]> = [];
  if (identity.address) lines.push([MapPin, identity.address]);
  if (identity.phone) lines.push([Phone, identity.phone]);
  if (identity.email) lines.push([Mail, identity.email]);
  if (!lines.length) return null;

  return (
    <div className="min-w-0 space-y-0.5 text-[9.5px] leading-snug">
      {lines.map(([Icon, value]) => (
        // The icon is inline rather than a flex sibling: a wrapping address
        // otherwise left the pin stranded on its own at the far left.
        <p className="max-w-[62mm] text-right" key={value}>
          <Icon className="mr-1 inline size-2.5 align-[-1.5px] text-primary" />
          {value}
        </p>
      ))}
    </div>
  );
}
