import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OperationalLiveSync } from "@/components/layout/operational-live-sync";
import { getCurrentProfile } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden" data-app-viewport>
      <OperationalLiveSync role={profile.role} />
      <AppSidebar profile={profile} />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <AppHeader />
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-6"
          data-app-workspace
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
