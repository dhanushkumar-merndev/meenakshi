import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { APP_ROLES, type AppRole, type Profile } from "@/types/hospital";
import { canAccessRoute, hasPermission, type Permission } from "./permissions";

export const getCurrentProfile = cache(async (): Promise<Profile> => {
  if (!hasSupabaseEnv()) redirect("/setup");
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, doctor_id")
    .eq("id", authData.user.id)
    .single();

  if (error || !data || data.status !== "active") redirect("/login?inactive=1");
  if (!APP_ROLES.includes(data.role as AppRole)) redirect("/login?invalidRole=1");

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    role: data.role as AppRole,
    status: data.status,
    doctorId: data.doctor_id,
  };
});

export async function requirePermission(permission: Permission) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile.role, permission)) throw new Error("Forbidden");
  return profile;
}

export async function requireRoute(pathname: string) {
  const profile = await getCurrentProfile();
  if (!canAccessRoute(profile.role, pathname)) redirect("/dashboard?forbidden=1");
  return profile;
}
