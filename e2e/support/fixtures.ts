import { createClient } from "@supabase/supabase-js";

/**
 * Real row ids for the record-scoped routes (a token, a bill, a discharge
 * summary), looked up when the suite runs.
 *
 * These used to be a hardcoded block of demo UUIDs, which meant the whole
 * surface audit reported ten 404s the moment it ran against a database that
 * had been cleaned or reseeded -- a broken fixture reading exactly like a
 * broken print route. Looking them up instead makes the audit tell the truth
 * on any database: it covers every record type that exists, and says plainly
 * which ones it could not cover because the hospital has none yet.
 */
export type FixtureIds = Partial<{
  patient: string;
  visit: string;
  ipTicket: string;
  prescription: string;
  sale: string;
  procedureSale: string;
  inventoryRequest: string;
}>;

export async function lookupFixtureIds(): Promise<FixtureIds> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Service role, because the point is to find a row for EVERY role's audit,
  // including ones a given role's RLS would hide. It never leaves the test
  // process, and it only ever reads an id.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const newest = async (table: string) => {
    const { data } = await db.from(table).select("id").order("created_at", { ascending: false }).limit(1);
    return (data?.[0] as { id: string } | undefined)?.id;
  };
  // Cancelled placeholders have no dispenseable items or printable clinical
  // document. The surface audit needs a real prescription, not merely the
  // newest row in this table.
  const newestPrintablePrescription = async () => {
    const { data } = await db
      .from("prescriptions")
      .select("id")
      .in("status", ["pending", "partially_dispensed", "dispensed"])
      .order("created_at", { ascending: false })
      .limit(1);
    return (data?.[0] as { id: string } | undefined)?.id;
  };
  const [patient, visit, ipTicket, prescription, sale, procedureSale, inventoryRequest] =
    await Promise.all([
      newest("patients"), newest("visits"), newest("ip_tickets"),
      newestPrintablePrescription(), newest("pharmacy_sales"),
      newest("procedure_sales"), newest("ip_inventory_requests"),
    ]);
  return { patient, visit, ipTicket, prescription, sale, procedureSale, inventoryRequest };
}

/**
 * A prescription of each shape the print routes have to handle.
 *
 * Same reasoning as above: these were two hardcoded UUIDs, so once the rows
 * behind them were cleared the print check reported 404 -- which reads as
 * "the print route is broken" rather than "the fixture is gone".
 *
 * `undispensed` is the one the outside-purchase slip needs: a prescription
 * with at least one item nothing has been dispensed against. Undefined when
 * the database has none, so the caller can skip instead of failing.
 */
export async function lookupPrescriptions(): Promise<{
  ip?: string;
  op?: string;
  undispensed?: string;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const newestPrintableWhere = async (column: string, isNull: boolean) => {
    const query = db
      .from("prescriptions")
      .select("id")
      .in("status", ["pending", "partially_dispensed", "dispensed"])
      .order("created_at", { ascending: false })
      .limit(1);
    const { data } = await (isNull ? query.is(column, null) : query.not(column, "is", null));
    return (data?.[0] as { id: string } | undefined)?.id;
  };

  // One query for the items, not one per prescription: the undispensed
  // prescription is whichever of the newest items still reads 0 dispensed.
  const { data: items } = await db
    .from("prescription_items")
    .select("prescription_id,dispensed_quantity")
    .eq("dispensed_quantity", 0)
    .order("created_at", { ascending: false })
    .limit(1);

  const [ip, op] = await Promise.all([
    newestPrintableWhere("ip_ticket_id", false),
    newestPrintableWhere("ip_ticket_id", true),
  ]);
  return {
    ip,
    op,
    undispensed: (items?.[0] as { prescription_id: string } | undefined)?.prescription_id,
  };
}

/**
 * The newest visit that is still open, i.e. one reception could convert to IP
 * or a doctor could prescribe on.
 *
 * Three specs carried the same literal visit id -- one of them under a comment
 * claiming it was looked up. Once that row went, "Convert to IP is visible"
 * failed as though the override had been removed from the product.
 */
export async function lookupOpenVisit(): Promise<string | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await db
    .from("visits")
    .select("id")
    .in("status", ["waiting", "vitals_pending", "ready", "in_consultation"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id;
}

/**
 * Pick a live directory entry by its dosage form, rather than relying on a
 * named demo medicine that may legitimately be removed by the hospital.
 */
export async function lookupMedicineByDosageForm(form: string): Promise<string | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await db
    .from("medicine_directory")
    .select("brand_name")
    .eq("active", true)
    .ilike("dosage_form", `%${form}%`)
    .order("brand_name")
    .limit(1);
  return (data?.[0] as { brand_name: string } | undefined)?.brand_name;
}

/** One live inventory item and one medicine-directory entry for the unified
 * IP request picker. Names are deliberately discovered: hospital stock is a
 * local master, not a fixed demo catalogue. */
export async function lookupIpStockSearchFixtures(): Promise<{
  inventory?: string;
  medicine?: string;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return {};
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: inventory }, { data: medicines }] = await Promise.all([
    db.from("inventory_items").select("name").eq("active", true).order("name").limit(1),
    db.from("medicine_directory").select("brand_name").eq("active", true).order("brand_name").limit(1),
  ]);
  return {
    inventory: (inventory?.[0] as { name: string } | undefined)?.name,
    medicine: (medicines?.[0] as { brand_name: string } | undefined)?.brand_name,
  };
}
