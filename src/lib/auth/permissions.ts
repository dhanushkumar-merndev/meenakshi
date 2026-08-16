import type { AppRole } from "@/types/hospital";

export const PERMISSIONS = {
  manageUsers: ["admin"],
  manageDoctors: ["admin"],
  viewPatients: ["admin", "reception", "op", "doctor", "ip"],
  createPatient: ["admin", "reception", "ip"],
  createVisit: ["admin", "reception"],
  recordVitals: ["admin", "op", "doctor"],
  writeConsultation: ["admin", "doctor"],
  dispense: ["admin", "pharmacy"],
  manageIp: ["admin", "ip"],
  admitIp: ["admin", "ip", "doctor"],
  configureRooms: ["admin"],
  viewFullFinance: ["admin"],
  viewVisitFinance: ["admin", "reception"],
  uploadReport: ["admin", "reception", "op", "ip"],
  manageMedicine: ["admin", "pharmacy"],
  viewAudit: ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: AppRole, permission: Permission) {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}

export const ROUTE_ROLES: Record<string, readonly AppRole[]> = {
  "/admin": ["admin"],
  "/audit": ["admin"],
  "/patients": ["admin", "reception", "op", "doctor", "ip"],
  // Bulk register import writes patient records, so it is narrower than the
  // patient directory itself and matches the bulk_import_patients RPC guard.
  "/patients/import": ["admin", "reception"],
  "/reception": ["admin", "reception"],
  "/op": ["admin", "op"],
  "/doctor": ["admin", "doctor"],
  "/pharmacy": ["admin", "pharmacy"],
  "/ip": ["admin", "ip", "doctor"],
  "/reports": ["admin", "reception", "op", "ip"],
  "/visits": ["admin", "reception", "op", "doctor"],
};

export function canAccessRoute(role: AppRole, pathname: string) {
  const entry = Object.entries(ROUTE_ROLES)
    .sort(([a], [b]) => b.length - a.length)
    .find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !entry || entry[1].includes(role);
}
