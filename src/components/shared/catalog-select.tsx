"use client";

import { useEffect, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "@/lib/domain/search";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CatalogOption<T> = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  data: T;
};

type Results<T> = {
  key: string;
  items: CatalogOption<T>[];
  nextOffset: number | null;
  refine?: boolean;
  error?: boolean;
};

/** Bounded server search, independent of the surrounding table's page/filter. */
export function CatalogSelect<T>({ endpoint, value, onChange, placeholder, disabled, options = [], id }: {
  endpoint: string;
  value: Pick<CatalogOption<T>, "value" | "label"> | null;
  onChange: (option: CatalogOption<T>) => void;
  placeholder: string;
  disabled?: boolean;
  options?: CatalogOption<T>[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState({ query: "", offset: 0 });
  const [results, setResults] = useState<Results<T> | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([endpoint, request.query, request.offset, retry]);
  const isBrowsing = request.query.trim().length === 0;
  const canSearch = isBrowsing || request.query.trim().length >= 2;
  const loading = open && canSearch && results?.key !== requestKey;
  // Old query results must not stay selectable while a new search is pending.
  const items = canSearch && (results?.key === requestKey || request.offset > 0) ? results?.items ?? [] : [];

  useEffect(() => {
    if (!open || !canSearch) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(request.query.trim())}&offset=${request.offset}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Search unavailable");
        const body = await response.json() as Omit<Results<T>, "key">;
        if (controller.signal.aborted) return;
        setResults((previous) => ({
          ...body,
          key: requestKey,
          items: request.offset > 0
            ? Array.from(new Map([...(previous?.items ?? []), ...body.items].map((item) => [item.value, item])).values())
            : body.items,
        }));
      } catch {
        if (!controller.signal.aborted) setResults((previous) => ({
          key: requestKey,
          items: request.offset > 0 ? previous?.items ?? [] : [],
          nextOffset: null,
          error: true,
        }));
      }
    }, isBrowsing || request.offset > 0 ? 0 : SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, open, canSearch, isBrowsing, request.query, request.offset, requestKey]);

  return <Select
    open={open}
    onOpenChange={(next) => {
      setOpen(next);
      if (next) { setRequest({ query: "", offset: 0 }); setResults(null); }
    }}
    value={value?.value ?? null}
    disabled={disabled}
    filter={null}
    inputValue={request.query}
    onInputValueChange={(query) => setRequest({ query, offset: 0 })}
    onValueChange={(selected) => {
      const option = [...options, ...items].find((item) => item.value === selected);
      if (option && !option.disabled) onChange(option);
    }}
  >
    <SelectTrigger id={id} aria-label={placeholder} className="w-full">
      <SelectValue>{() => value?.label ?? placeholder}</SelectValue>
    </SelectTrigger>
    <SelectContent
      searchPlaceholder="Type at least 2 characters…"
      emptyMessage={!canSearch ? "Type at least 2 characters to search." : loading ? "Searching…" : results?.error ? "Search unavailable. Please retry." : "No matching items."}
      footer={canSearch ? <div className="shrink-0 border-t p-2 text-xs text-muted-foreground" aria-live="polite">
        {!canSearch ? "Type at least 2 characters to search." : loading ? "Searching…" : results?.error
          ? <Button type="button" size="sm" variant="ghost" onClick={() => setRetry((n) => n + 1)}>Retry search</Button>
          : results?.nextOffset != null
            ? <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => setRequest((current) => ({ ...current, offset: results.nextOffset! }))}>Show more items</Button>
            : results?.refine ? "Type more of the name to narrow the results." : "Type to search or select an item."}
      </div> : null}
    >
      {[...options, ...items].map((option) => <SelectItem key={option.value} value={option.value} label={option.label} disabled={option.disabled}>
        <span className="block">{option.label}</span>
        {option.description ? <span className="block text-xs text-muted-foreground">{option.description}</span> : null}
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
