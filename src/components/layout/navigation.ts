import type { AppRole } from "@/types/hospital";

export type NavigationItem = { title: string; href: string; icon: string };

export function getActiveNavigationHref(
  items: NavigationItem[],
  pathname: string,
) {
  return items
    .filter(
      (item) =>
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`)),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

const shared = {
  dashboard: { title: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
  patients: { title: "Patients", href: "/patients", icon: "users" },
} satisfies Record<string, NavigationItem>;

export const ROLE_NAVIGATION: Record<AppRole, NavigationItem[]> = {
  admin: [
    shared.dashboard, shared.patients,
    { title: "Reception", href: "/reception", icon: "concierge-bell" },
    { title: "OP", href: "/op", icon: "stethoscope" },
    { title: "Doctors", href: "/doctor", icon: "user-round-check" },
    { title: "IP", href: "/ip", icon: "bed" },
    { title: "Pharmacy", href: "/pharmacy", icon: "pill" },
    { title: "Reports", href: "/admin/analytics", icon: "chart-column" },
    { title: "Users", href: "/admin/users", icon: "user-cog" },
    { title: "Doctor Master", href: "/admin/doctors", icon: "briefcase-medical" },
    { title: "Departments", href: "/admin/departments", icon: "building-2" },
    { title: "Charges", href: "/admin/charges", icon: "badge-indian-rupee" },
    { title: "Rooms", href: "/admin/rooms", icon: "bed-double" },
    { title: "Clinical Directory", href: "/admin/clinical-directory", icon: "book-open" },
    { title: "Medicine Master", href: "/pharmacy/medicines", icon: "notebook-tabs" },
    { title: "Report Categories", href: "/admin/report-categories", icon: "folder-cog" },
    { title: "Patient Reports", href: "/reports", icon: "files" },
    { title: "Monthly Export", href: "/admin/exports", icon: "archive-restore" },
    { title: "Settings", href: "/admin/settings", icon: "settings" },
    { title: "Audit Logs", href: "/audit", icon: "shield-check" },
  ],
  reception: [
    shared.dashboard, shared.patients,
    { title: "Today's Visits", href: "/reception", icon: "calendar-days" },
    { title: "Follow-ups", href: "/reception/follow-ups", icon: "calendar-check" },
    { title: "Reports Ready", href: "/reports", icon: "file-check" },
    { title: "Payments", href: "/reception/payments", icon: "indian-rupee" },
  ],
  op: [
    shared.dashboard,
    { title: "Today's Queue", href: "/op", icon: "list-ordered" },
    { title: "Vitals", href: "/op/vitals", icon: "activity" },
    { title: "Reports", href: "/reports", icon: "files" },
  ],
  doctor: [
    shared.dashboard,
    { title: "My Queue", href: "/doctor", icon: "list-ordered" },
    { title: "My Follow-ups", href: "/doctor/follow-ups", icon: "calendar-check" },
    { title: "My IP Patients", href: "/ip", icon: "bed" },
    { title: "Patient Search", href: "/patients", icon: "search" },
  ],
  ip: [
    shared.dashboard,
    { title: "Admissions", href: "/ip", icon: "log-in" },
    { title: "Current Patients", href: "/ip/current", icon: "bed-double" },
    { title: "Room View", href: "/ip/rooms", icon: "building-2" },
    { title: "IP Tickets", href: "/ip/tickets", icon: "receipt-text" },
    { title: "Discharges", href: "/ip/discharges", icon: "log-out" },
  ],
  pharmacy: [
    shared.dashboard,
    { title: "Pending Prescriptions", href: "/pharmacy", icon: "clipboard-list" },
    { title: "Medicine Master", href: "/pharmacy/medicines", icon: "pill" },
    { title: "Stock & Batches", href: "/pharmacy/stock", icon: "package" },
    { title: "Bulk Import", href: "/pharmacy/import", icon: "file-up" },
    { title: "Sales", href: "/pharmacy/sales", icon: "receipt" },
  ],
};
