import { IpRoleWorkspacePage } from "@/features/ip/ip-workspace-page";

export default function DischargedIpPatientsPage(
  props: PageProps<"/ip/discharged">,
) {
  return IpRoleWorkspacePage({
    searchParams: props.searchParams,
    fixedStatus: "discharged",
  });
}
