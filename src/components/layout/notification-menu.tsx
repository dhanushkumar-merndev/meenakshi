"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCheck, CircleAlert, Clock3 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { NotificationResponse } from "@/types/notifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const queryKey = ["hospital-notifications"] as const;

async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("Notifications could not be updated");
}

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/notifications", {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Notifications unavailable");
      return (await response.json()) as NotificationResponse;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const markRead = (ids: string[]) => {
    if (!ids.length) return;
    queryClient.setQueryData<NotificationResponse>(queryKey, (current) => {
      if (!current) return current;
      const selected = new Set(ids);
      const items = current.items.map((item) =>
        selected.has(item.id) ? { ...item, read: true } : item,
      );
      return {
        items,
        unreadCount: items.filter((item) => !item.read).length,
      };
    });
    void markNotificationsRead(ids).finally(() =>
      queryClient.invalidateQueries({ queryKey }),
    );
  };

  const unreadIds = data?.items
    .filter((item) => !item.read)
    .map((item) => item.id) ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            className="relative"
            aria-label={
              unreadCount
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell />
        {unreadCount ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <PopoverHeader className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle>Notifications</PopoverTitle>
              <PopoverDescription>
                Live operational alerts for your role
              </PopoverDescription>
            </div>
            {unreadIds.length ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => markRead(unreadIds)}
              >
                <CheckCheck /> Mark read
              </Button>
            ) : null}
          </div>
        </PopoverHeader>
        <Separator />
        <ScrollArea className="max-h-[min(28rem,70vh)]">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {[1, 2, 3].map((item) => (
                <div className="flex gap-3" key={item}>
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.items.length ? (
            <div className="p-1.5">
              {data.items.map((item) => {
                const Icon = item.tone === "critical" ? CircleAlert : Clock3;
                return (
                  <Link
                    href={item.href}
                    key={item.id}
                    className={cn(
                      "flex gap-3 rounded-md p-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !item.read && "bg-accent/50",
                    )}
                    onClick={() => {
                      if (!item.read) markRead([item.id]);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground",
                        item.tone === "critical" &&
                          "bg-destructive/10 text-destructive",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{item.title}</span>
                        {!item.read ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 size-5" />
              No operational alerts right now.
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
