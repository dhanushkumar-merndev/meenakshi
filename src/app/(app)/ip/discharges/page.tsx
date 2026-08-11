import { redirect } from "next/navigation";
export default function IpDischargesPage() { redirect("/ip?status=discharge_pending"); }
