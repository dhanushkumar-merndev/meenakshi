import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prefixSearchPattern, searchDigits } from "@/lib/domain/search";
import { EMPTY_UUID } from "@/lib/domain/search";

export async function findMatchingPatientIds(
  supabase: SupabaseClient,
  value: string,
  limit = 50,
) {
  const digits = searchDigits(value);
  let query = supabase.from("patients").select("id").limit(limit);

  query = digits.length >= 2
    ? query.like("phone_normalized", `${digits.slice(-10)}%`)
    : query.ilike("name_normalized", prefixSearchPattern(value).toLowerCase());

  const { data, error } = await query;
  if (error) throw new Error("Patient search could not be completed.");
  return (data ?? []).map((patient) => String(patient.id));
}

export async function findMatchingVisitIds(
  supabase: SupabaseClient,
  value: string,
  limit = 100,
) {
  const patientIds = await findMatchingPatientIds(supabase, value, limit);
  const filters = patientIds.length
    ? [`patient_id.in.(${patientIds.join(",")})`]
    : [`patient_id.eq.${EMPTY_UUID}`];
  if (/^#?\d{1,4}$/.test(value.trim())) {
    filters.push(`token_number.eq.${Number(searchDigits(value))}`);
  }

  const { data, error } = await supabase
    .from("visits")
    .select("id")
    .or(filters.join(","))
    .limit(limit);
  if (error) throw new Error("Visit search could not be completed.");
  return (data ?? []).map((visit) => String(visit.id));
}
