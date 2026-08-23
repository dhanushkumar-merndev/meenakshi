import { IpRoleWorkspacePage } from "@/features/ip/ip-workspace-page";

export default function CurrentIpPatientsPage(props: PageProps<"/ip/current">) {
  return IpRoleWorkspacePage({
    searchParams: props.searchParams,
    fixedStatus: "active",
  });
}
