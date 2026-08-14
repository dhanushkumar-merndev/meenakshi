"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { LogOut } from "lucide-react";
import { HospitalLogo } from "@/components/shared/hospital-logo";
import { signOut } from "@/app/(auth)/login/actions";
import { getActiveNavigationHref, ROLE_NAVIGATION } from "./navigation";
import type { Profile } from "@/types/hospital";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function NavIcon({ name }: { name: string }) {
  const key = name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("") as keyof typeof Icons;
  const Icon = Icons[key] as React.ComponentType<{ className?: string }> | undefined;
  return Icon ? <Icon className="size-4" /> : <Icons.Circle className="size-4" />;
}

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const items = ROLE_NAVIGATION[profile.role];
  const activeHref = getActiveNavigationHref(items, pathname);
  const groups = profile.role === "admin" ? [
    { label: "Hospital", items: items.slice(0, 8) },
    { label: "Administration", items: items.slice(8, -1) },
    { label: "Security", items: items.slice(-1) },
  ] : [{ label: "Workspace", items }];
  return (
    <Sidebar collapsible="icon" className="min-h-0" data-app-shell>
      <SidebarHeader className="border-b border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
        <Link
          className="flex min-h-10 items-center gap-3 overflow-hidden group-data-[collapsible=icon]:justify-center"
          href="/dashboard"
        >
          <span className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white group-data-[collapsible=icon]:size-9">
            <HospitalLogo size={52} className="size-full p-0.5" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-semibold">Meenakshi Hospital</span>
            <span className="block truncate text-xs text-sidebar-foreground/65">Care operations</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="overscroll-contain group-data-[collapsible=icon]:overflow-y-auto!">
        {groups.map((group) => <SidebarGroup className="group-data-[collapsible=icon]:px-2" key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9!"
                    render={<Link href={item.href} />}
                    isActive={activeHref === item.href}
                    tooltip={{ children: item.title, sideOffset: 10 }}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>)}
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border bg-sidebar p-2">
        <div className="flex items-center gap-2 p-1 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8">
            <AvatarFallback>
              {profile.fullName
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">{profile.fullName}</p>
            <Badge variant="secondary" className="mt-0.5 capitalize">
              {profile.role}
            </Badge>
          </div>
          <form action={signOut} className="group-data-[collapsible=icon]:hidden">
            <button
              aria-label="Sign out"
              className="rounded-md p-2 hover:bg-sidebar-accent"
              type="submit"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
