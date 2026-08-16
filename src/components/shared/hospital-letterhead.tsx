import { Mail, MapPin, Phone } from "lucide-react";
import { HospitalLogo } from "@/components/shared/hospital-logo";
import type { HospitalIdentity } from "@/lib/print/hospital-identity";
import { cn } from "@/lib/utils";

/**
 * The printed letterhead: mark, wordmark, motto and contact block, matching the
 * hospital's stationery. Every printed document (token, prescription, IP bill,
 * discharge summary) opens with this so a patient can identify and contact the
 * hospital from the paper alone.
 *
 * `align` follows the document: the prescription puts the doctor on the left
 * and the hospital on the right (AGENTS.md 24), the token is centred, and the
 * IP documents keep the hospital on the left with document details opposite.
 */
export function HospitalLetterhead({
  identity,
  align = "left",
  logoSize = 54,
  className,
}: {
  identity: HospitalIdentity;
  align?: "left" | "right" | "center";
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
    <div
      className={cn(
        "flex items-center gap-3",
        align === "right" && "flex-row-reverse text-right",
        align === "center" && "flex-col gap-2 text-center",
        className,
      )}
    >
      <HospitalLogo size={logoSize} className="shrink-0" />
      <div className={cn("min-w-0", align === "center" && "w-full")}>
        <p className="text-lg leading-tight font-bold tracking-wide text-primary uppercase">
          {lockup.top}
        </p>
        {lockup.bottom ? (
          <p className="text-sm leading-tight font-medium tracking-[0.3em] text-primary uppercase">
            {lockup.bottom}
          </p>
        ) : null}
        {identity.tagline ? (
          <p className="mt-0.5 text-[10px] leading-tight font-medium text-primary/80">
            {identity.tagline}
          </p>
        ) : null}
        <ContactBlock identity={identity} align={align} />
      </div>
    </div>
  );
}

function ContactBlock({
  identity,
  align,
}: {
  identity: HospitalIdentity;
  align: "left" | "right" | "center";
}) {
  const lines: Array<[React.ComponentType<{ className?: string }>, string]> = [];
  if (identity.address) lines.push([MapPin, identity.address]);
  if (identity.phone) lines.push([Phone, identity.phone]);
  if (identity.email) lines.push([Mail, identity.email]);
  if (!lines.length) return null;

  return (
    <div
      className={cn(
        "mt-1.5 space-y-0.5 text-[9.5px] leading-snug",
        align === "center" && "flex flex-col items-center",
      )}
    >
      {lines.map(([Icon, value]) => (
        <p
          className={cn(
            "flex max-w-[62mm] items-start gap-1",
            align === "right" && "flex-row-reverse",
            align === "center" && "max-w-full justify-center",
          )}
          key={value}
        >
          <Icon className="mt-px size-2.5 shrink-0 text-primary" />
          <span>{value}</span>
        </p>
      ))}
    </div>
  );
}
