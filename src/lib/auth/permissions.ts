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
  recordVitals: ["admin", "reception", "op", "doctor"],
  writeConsultation: ["admin", "doctor"],
  // IP staff prepare the structured discharge summary; this is deliberately
  // narrower than writeConsultation, which remains doctor-only for progress
  // notes and consultation records.
  prepareDischarge: ["admin", "doctor", "ip"],
  // Narrower than writeConsultation on purpose: only the consultation form
  // itself (entering exactly what the doctor wrote on paper), not progress
  // notes, discharge summaries, or report uploads -- those stay doctor-only.
  pharmacyEnterConsultation: ["admin", "doctor", "pharmacy"],
  dispense: ["admin", "pharmacy"],
  // A consultant who wrote the prescription on paper never touches the
  // system; pharmacy enters it digitally so it flows through the same
  // pending queue and dispense screen ("Dispense as Per Rx").
  dispenseAsPerRx: ["admin", "pharmacy"],
  manageIp: ["admin", "ip"],
  // Reception owns the register, so an OP visit the doctor referred is
  // converted at their counter; doctors refer rather than admit (their button
  // was removed), but the permission stays for the audited RPC path they
  // still hold for their own visit.
  admitIp: ["admin", "ip", "doctor", "reception"],
  // IP staff or the treating doctor can ask pharmacy for consumables; only
  // pharmacy (via `dispense`) actually fulfils the request and touches stock.
  requestIpInventory: ["admin", "reception", "ip", "doctor"],
  // Reading a request's supply outcome (including a shortage note) is clinical
  // information, so the treating doctor may use it.
  viewIpInventoryRequest: ["admin", "reception", "ip", "doctor", "pharmacy"],
  // The item bill/receipt contains payment amounts and modes, so it follows
  // the same patient-finance boundary as other financial documents.
  viewIpInventoryReceipt: ["admin", "reception", "ip", "pharmacy"],
  configureRooms: ["admin"],
  viewFullFinance: ["admin"],
  viewVisitFinance: ["admin", "reception"],
  // Same fee the pharmacy counter already collects when dispensing medicines
  // (dispense_prescription) -- this covers the visit that has none, which
  // otherwise had no way to ever be settled.
  collectVisitPayment: ["admin", "reception", "pharmacy"],
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
  "/op": ["admin", "reception", "op"],
  "/doctor": ["admin", "doctor"],
  "/pharmacy": ["admin", "pharmacy"],
  "/ip": ["admin", "reception", "ip", "doctor"],
  // Doctors read only: they review the results they ordered. The upload
  // action stays behind the uploadReport permission.
  "/reports": ["admin", "reception", "op", "ip", "doctor"],
  "/visits": ["admin", "reception", "op", "doctor", "pharmacy"],
  // Read-only stock check for clinical/IP care -- not stock management, which
  // stays under /pharmacy.
  "/drug-stock": ["admin", "reception", "doctor", "op", "ip"],
};

export function canAccessRoute(role: AppRole, pathname: string) {
  const entry = Object.entries(ROUTE_ROLES)
    .sort(([a], [b]) => b.length - a.length)
    .find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return !entry || entry[1].includes(role);
}
