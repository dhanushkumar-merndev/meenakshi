import { IpRoleWorkspacePage } from "@/features/ip/ip-workspace-page";

export default function AllIpTicketsPage(props: PageProps<"/ip/all-tickets">) {
  return IpRoleWorkspacePage({
    searchParams: props.searchParams,
    fixedStatus: "all",
  });
}
