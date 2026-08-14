import { requireRoute } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/features/admin/settings-form";
import { PageHeader } from "@/components/shared/page-header";

export default async function SettingsPage() {
  await requireRoute("/admin/settings");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("hospital_settings").select("hospital_name,address,phone,email,prescription_footer,token_footer,digital_prescription_text").eq("id", true).single();
  const settings = data ?? { hospital_name: "Meenakshi Hospital", address: null, phone: null, email: null, prescription_footer: null, token_footer: null, digital_prescription_text: null };
  return <div><PageHeader title="Settings" description="Hospital identity and printable document text" /><SettingsForm settings={settings} /></div>;
}
