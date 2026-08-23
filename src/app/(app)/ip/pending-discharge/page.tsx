import { IpRoleWorkspacePage } from "@/features/ip/ip-workspace-page";

export default function PendingIpDischargePage(
  props: PageProps<"/ip/pending-discharge">,
) {
  return IpRoleWorkspacePage({
    searchParams: props.searchParams,
    fixedStatus: "discharge_pending",
  });
}
