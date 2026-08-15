import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = { label: string; value: string; count?: number };

/**
 * Link-based tab bar for server-rendered pages. Each tab is a URL, so the
 * active view stays shareable and only the selected tab's data is fetched.
 */
export function FilterTabs({
  tabs,
  active,
  param = "status",
  params = {},
  ariaLabel,
}: {
  tabs: FilterTab[];
  active: string;
  param?: string;
  params?: Record<string, string | undefined>;
  ariaLabel: string;
}) {
  const href = (value: string) => {
    const search = new URLSearchParams();
    for (const [key, entry] of Object.entries(params))
      if (entry && key !== param && key !== "page") search.set(key, entry);
    search.set(param, value);
    return `?${search}`;
  };
  return (
    <nav
      aria-label={ariaLabel}
      className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.value === active;
        return (
          <Link
            key={tab.value}
            href={href(tab.value)}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
