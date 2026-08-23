import { IpRoleWorkspacePage } from "@/features/ip/ip-workspace-page";

export default function MyIpPatientsPage(props: PageProps<"/ip/my-patients">) {
  return IpRoleWorkspacePage({
    searchParams: props.searchParams,
    fixedStatus: "mine",
  });
}
