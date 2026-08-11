import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/shared/print-button";

export default async function TokenPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("visits")
    .select(
      "token_number,created_at,visit_date,patients(name,phone_normalized),doctors(display_name),departments(name)",
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const visit = data as unknown as {
    token_number: number;
    created_at: string;
    patients: { name: string; phone_normalized: string } | null;
    doctors: { display_name: string } | null;
    departments: { name: string } | null;
  };
  const at = new Date(visit.created_at);
  return (
    <main className="mx-auto min-h-screen max-w-sm bg-white p-5 text-black">
      <div data-print-hidden className="mb-5 flex justify-end">
        <PrintButton label="Print Token" />
      </div>
      <article className="border border-black p-6 text-center font-sans">
        <h1 className="text-lg font-bold uppercase tracking-wide">
          Meenakshi Hospital
        </h1>
        <div className="my-5 border-y border-black py-4">
          <p className="text-xs font-semibold uppercase">Token No</p>
          <p className="text-6xl font-bold">{visit.token_number}</p>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-3 text-left text-sm">
          <dt className="font-semibold">Patient</dt>
          <dd>{visit.patients?.name}</dd>
          <dt className="font-semibold">Patient ID</dt>
          <dd>{visit.patients?.phone_normalized}</dd>
          <dt className="font-semibold">Doctor</dt>
          <dd>{visit.doctors?.display_name}</dd>
          <dt className="font-semibold">Department</dt>
          <dd>{visit.departments?.name ?? "—"}</dd>
          <dt className="font-semibold">Date</dt>
          <dd>
            {at.toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
            })}
          </dd>
          <dt className="font-semibold">Time</dt>
          <dd>
            {at.toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </dd>
        </dl>
        <p className="mt-6 border-t border-dashed border-black pt-4 text-xs">
          Please wait until your token is called.
        </p>
      </article>
    </main>
  );
}
