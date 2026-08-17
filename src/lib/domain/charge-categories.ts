/**
 * The Admin -> Charges master (AGENTS.md 51) and the IP ticket's charge log
 * (AGENTS.md 34, `public.charge_category` enum) use two different vocabularies
 * for the same idea: the master shows hospital-friendly labels like "IP
 * Doctor" or "General Ward", the IP ticket stores a fixed lowercase enum
 * (`doctor`, `ward`, ...) so charges can be summed and reported on reliably.
 *
 * `charges.category` used to be free text with no link to that enum at all,
 * so an admin typing "IP Doctor" produced a preset the "Add IP charge"
 * dialog could never find -- the dropdown was always empty. Constraining the
 * master to this fixed list, and mapping every entry straight to the enum
 * value it feeds, keeps the two in sync from now on.
 */
export const CHARGE_MASTER_CATEGORIES = [
  "OP",
  "Follow-up",
  "IP Doctor",
  "Ward",
  "Room",
  "Bed",
  "Treatment",
  "Test",
  "Other",
] as const;
export type ChargeMasterCategory = (typeof CHARGE_MASTER_CATEGORIES)[number];

/** `public.charge_category` enum values (supabase/migrations/20260811170000). */
export type IpChargeCategory =
  | "doctor"
  | "ward"
  | "room"
  | "bed"
  | "treatment"
  | "test"
  | "pharmacy"
  | "other";

/**
 * Master categories that can become an IP ticket charge. "OP" and
 * "Follow-up" are consultation charges, not IP charges, so they are
 * deliberately absent -- a preset in one of those categories never appears in
 * the "Add IP charge" dialog.
 */
export const IP_CHARGE_CATEGORY_MAP: Partial<Record<ChargeMasterCategory, IpChargeCategory>> = {
  "IP Doctor": "doctor",
  Ward: "ward",
  Room: "room",
  Bed: "bed",
  Treatment: "treatment",
  Test: "test",
  Other: "other",
};

/** The master category labels eligible for an IP charge preset, in one place so the ticket page's query and the dialog's map stay in sync. */
export const IP_CHARGE_MASTER_CATEGORIES = Object.keys(
  IP_CHARGE_CATEGORY_MAP,
) as ChargeMasterCategory[];
