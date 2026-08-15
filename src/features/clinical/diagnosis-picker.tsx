"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ClinicalTerm = { display_text: string; code: string | null; code_system: string | null };

/**
 * Diagnosis entry backed by the local ICD-10 directory.
 *
 * Search, select and free-text entry all happen in one box: anything the doctor
 * types that has no coded match can still be added as-is, so an unusual case is
 * never blocked by a missing code. Selections are serialised into a hidden
 * input so the surrounding server action needs no client state.
 */
export function DiagnosisPicker({
  name,
  initialValue = "",
  termType = "diagnosis",
  placeholder = "Search diagnosis or ICD-10 code",
}: {
  name: string;
  initialValue?: string;
  termType?: string;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    initialValue.split("\n").map((line) => line.trim()).filter(Boolean),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ClinicalTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search/clinical-terms?type=${termType}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        setItems(body.items ?? []);
      } catch {
        // Aborted or offline: the doctor can still type a free-text diagnosis.
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, termType]);

  const add = (value: string) => {
    const text = value.trim();
    if (!text || selected.includes(text)) return;
    setSelected((rows) => [...rows, text]);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected.join("\n")} />
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <Badge key={item} variant="secondary" className="gap-1 py-1">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="rounded-sm hover:text-destructive"
                onClick={() => setSelected((rows) => rows.filter((row) => row !== item))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="outline" className="w-full justify-start font-normal" />}
        >
          <Plus className="size-4" /> Add diagnosis
        </PopoverTrigger>
        <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Searching
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {query.trim().length < 2
                      ? "Type at least 2 characters."
                      : "No coded match. Press Add to record it as typed."}
                  </CommandEmpty>
                  <CommandGroup>
                    {/* Derived, not cleared in an effect: a short query simply
                        shows nothing rather than triggering a cascading render. */}
                    {(query.trim().length < 2 ? [] : items).map((item) => {
                      const label = item.code ? `${item.display_text} (${item.code})` : item.display_text;
                      return (
                        <CommandItem key={label} value={label} onSelect={() => add(label)}>
                          <span className="flex-1">{item.display_text}</span>
                          {item.code ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {item.code}
                            </span>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                    {query.trim().length >= 2 ? (
                      <CommandItem value={`__free__${query}`} onSelect={() => add(query)}>
                        <Plus className="size-4" />
                        Add &ldquo;{query.trim()}&rdquo; as typed
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
