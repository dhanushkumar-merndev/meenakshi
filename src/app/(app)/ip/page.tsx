import { redirect } from "next/navigation";
import { requireRoute } from "@/lib/auth/dal";
import IpWorkspacePage from "@/features/ip/ip-workspace-page";

export default async function IpPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    q?: string;
    view?: string;
  }>;
}) {
  const profile = await requireRoute("/ip");
  if (profile.role === "ip") redirect("/ip/current");
  return <IpWorkspacePage profile={profile} searchParams={searchParams} />;
}
