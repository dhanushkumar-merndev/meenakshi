import { requirePermission } from "@/lib/auth/dal";
import { PrintButton } from "@/components/shared/print-button";
import { IpBillDocument } from "@/features/ip/bill-document";
import { getIpPrintData } from "@/features/ip/print-data";
export default async function IpTicketPrintPage({params}:{params:Promise<{id:string}>}){await requirePermission("manageIp");const{id}=await params;const ticket=await getIpPrintData(id);return <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-4 text-black sm:p-8"><div data-print-hidden className="mb-4 flex justify-end"><PrintButton label="Print Running Bill"/></div><IpBillDocument ticket={ticket}/></main>}
