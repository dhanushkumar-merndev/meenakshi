import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Meenakshi Hospital mark. The source artwork sits on an opaque white
 * square, so callers place it on a light surface (print documents already are).
 */
export function HospitalLogo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.webp"
      alt="Meenakshi Hospital"
      width={size}
      height={size}
      priority
      className={cn("object-contain", className)}
    />
  );
}
