import type { AppRole } from "@/types/hospital";

export const PERMISSIONS = {
  manageUsers: ["admin"],
  manageDoctors: ["admin"],
  // Identity-only search (name/phone/UHID), used by the patient-picker
  // combobox everywhere it appears -- including the pharmacy counter's
  // procedure billing, which needs to attach a bill to a patient the same
  // way reception or IP does. This is not the /patients directory route,
  // which stays narrower (see ROUTE_ROLES below).
  viewPatients: ["admin", "reception", "op", "doctor", "ip", "pharmacy"],
  // Reception owns the patient register; IP staff admit patients that already
  // exist, so two desks cannot create the same person twice.
  createPatient: ["admin", "reception"],
  createVisit: ["admin", "reception"],
  recordVitals: ["admin", "op", "doctor"],
  writeConsultation: ["admin", "doctor"],
  dispense: ["admin", "pharmacy"],
  // A consultant who wrote the prescription on paper never touches the
  // system; pharmacy enters it digitally so it flows through the same
  // pending queue and dispense screen ("Dispense as Per Rx").
  dispenseAsPerRx: ["admin", "pharmacy"],
  manageIp: ["admin", "ip"],
  admitIp: ["admin", "ip", "doctor"],
  // IP staff or the treating doctor can ask pharmacy for consumables; only
  // pharmacy (via `dispense`) actually fulfils the request and touches stock.
  requestIpInventory: ["admin", "ip", "doctor"],
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
  // Doctors read only: they review the results they ordered. The upload
  // action stays behind the uploadReport permission.
  "/reports": ["admin", "reception", "op", "ip", "doctor"],
  "/visits": ["admin", "reception", "op", "doctor"],
};

export function canAccessRoute(role: AppRole, pathname: string) {
  const entry = Object.entries(ROUTE_ROLES)
    .sort(([a], [b]) => b.length - a.length)
    .find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !entry || entry[1].includes(role);
}
