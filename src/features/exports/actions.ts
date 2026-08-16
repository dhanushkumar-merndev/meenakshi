"use server";

import { PassThrough } from "node:stream";
import { createHash } from "node:crypto";
import { ZipArchive } from "archiver";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunkRows } from "@/lib/domain/bulk-import";
import type { ActionState } from "@/types/hospital";

type Row = Record<string, unknown>;
const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), includeDocuments: z.string().optional() });
function csv(rows: Row[]) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const value = (input: unknown) => { const text = input === null || input === undefined ? "" : typeof input === "object" ? JSON.stringify(input) : String(input); return `"${text.replaceAll('"', '""')}"`; };
  return `${headers.map(value).join(",")}\n${rows.map((row) => headers.map((header) => value(row[header])).join(",")).join("\n")}\n`;
}
async function zipEntries(entries: Array<{ name: string; content: string | Buffer }>) {
  const archive = new ZipArchive({ zlib: { level: 6 } }); const output = new PassThrough(); const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => { output.on("end", () => resolve(Buffer.concat(chunks))); output.on("error", reject); archive.on("error", reject); });
  archive.pipe(output); for (const entry of entries) archive.append(entry.content, { name: entry.name }); await archive.finalize(); return finished;
}
function ids(rows: Row[], key: string) { return [...new Set(rows.map((row) => row[key]).filter((value): value is string => typeof value === "string"))]; }
async function inRows(admin: ReturnType<typeof createSupabaseAdminClient>, table: string, select: string, column: string, values: string[]) {
  if (!values.length) return [] as Row[];
  const chunks = chunkRows(values, 200);
  const rows: Row[] = [];
  // Keep PostgREST URLs bounded and avoid opening hundreds of simultaneous
  // requests during a busy monthly export.
  for (let index = 0; index < chunks.length; index += 4) {
    const results = await Promise.all(
      chunks.slice(index, index + 4).map((idsChunk) =>
        admin.from(table).select(select).in(column, idsChunk),
      ),
    );
    for (const result of results) {
      if (result.error) throw result.error;
      rows.push(...((result.data ?? []) as unknown as Row[]));
    }
  }
  return rows;
}
async function collectExport(month: string, includeDocuments: boolean) {
  const admin = createSupabaseAdminClient(); const start = `${month}-01`; const startDate = new Date(`${start}T00:00:00+05:30`); const endDate = new Date(startDate); endDate.setUTCMonth(endDate.getUTCMonth() + 1); const endDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(endDate); const from = startDate.toISOString(); const to = endDate.toISOString();
  const [visitsR, salesR, ipChargesR, ipPaymentsR, admissionsR, reportsR, auditR, batchesR, settingsR] = await Promise.all([
    admin.from("visits").select("id,patient_id,doctor_id,department_id,visit_type,visit_date,token_number,fee_paise,status,related_previous_visit_id,notes,created_by,created_at,updated_at").gte("visit_date", start).lt("visit_date", endDay),
    admin.from("pharmacy_sales").select("id,prescription_id,patient_id,source,ip_ticket_id,total_paise,payment_mode,dispensed_by,created_at").gte("created_at", from).lt("created_at", to),
    admin.from("ip_charges").select("id,ip_ticket_id,category,item,quantity,rate_paise,amount_paise,source_type,source_id,added_by,created_at").gte("created_at", from).lt("created_at", to),
    admin.from("ip_payments").select("id,ip_ticket_id,amount_paise,mode,reference,notes,collected_by,created_at").gte("created_at", from).lt("created_at", to),
    admin.from("ip_tickets").select("id,ticket_number,patient_id,is_emergency,patient_linked_at,patient_linked_by,doctor_id,source_visit_id,room,bed,admission_reason,status,admission_at,discharge_at,final_diagnosis,hospital_course,treatment_summary,discharge_medicines,discharge_advice,follow_up,created_by,created_at,updated_at").gte("admission_at", from).lt("admission_at", to),
    admin.from("patient_reports").select("id,patient_id,visit_id,ip_ticket_id,test_order_id,category_id,report_name,report_date,display_name,original_filename,object_path,mime_type,size_bytes,notes,status,uploaded_by,created_at,updated_at").gte("created_at", from).lt("created_at", to),
    admin.from("audit_logs").select("id,actor_user_id,action,entity_type,entity_id,metadata,created_at").gte("created_at", from).lt("created_at", to),
    admin.from("medicine_batches").select("id,medicine_id,batch_number,expiry_date,quantity,purchase_price_paise,selling_price_paise,low_stock_threshold,active,created_at,updated_at"),
    admin.from("hospital_settings").select("hospital_name,address,phone,email,prescription_footer,token_footer,digital_prescription_text,updated_at"),
  ]);
  for (const result of [visitsR, salesR, ipChargesR, ipPaymentsR, admissionsR, reportsR, auditR, batchesR, settingsR]) if (result.error) throw result.error;
  const visits = (visitsR.data ?? []) as Row[]; const sales = (salesR.data ?? []) as Row[]; const ipCharges = (ipChargesR.data ?? []) as Row[]; const ipPayments = (ipPaymentsR.data ?? []) as Row[]; const reports = (reportsR.data ?? []) as Row[];
  const visitIds = ids(visits, "id"); const [visitPayments, vitals, consultations, prescriptions, testOrders] = await Promise.all([
    inRows(admin, "visit_payments", "id,visit_id,amount_paise,mode,reference,notes,collected_by,created_at", "visit_id", visitIds),
    inRows(admin, "vitals", "id,visit_id,weight_kg,height_cm,temperature_c,bp_systolic,bp_diastolic,pulse,spo2,respiratory_rate,notes,recorded_by,recorded_at,updated_at", "visit_id", visitIds),
    inRows(admin, "consultations", "id,visit_id,doctor_id,symptoms,history,examination,assessment,advice,follow_up_type,follow_up_date,follow_up_days,status,completed_at,created_at,updated_at", "visit_id", visitIds),
    inRows(admin, "prescriptions", "id,prescription_number,visit_id,ip_ticket_id,doctor_id,status,notes,created_at,updated_at", "visit_id", visitIds),
    inRows(admin, "test_orders", "id,patient_id,visit_id,ip_ticket_id,doctor_id,test_name,status,notes,created_at,updated_at", "visit_id", visitIds),
  ]);
  const prescriptionItems = await inRows(admin, "prescription_items", "id,prescription_id,medicine_id,medicine_name,dose,frequency,duration,route,notes,requested_quantity,dispensed_quantity,created_at", "prescription_id", ids(prescriptions, "id"));
  const saleItems = await inRows(admin, "pharmacy_sale_items", "id,sale_id,prescription_item_id,batch_id,quantity,unit_price_paise,amount_paise", "sale_id", ids(sales, "id"));
  const ticketIds = [...new Set([...ids((admissionsR.data ?? []) as Row[], "id"), ...ids(ipCharges, "ip_ticket_id"), ...ids(ipPayments, "ip_ticket_id"), ...ids(sales, "ip_ticket_id")])];
  const ipTickets = await inRows(admin, "ip_tickets", "id,ticket_number,patient_id,is_emergency,patient_linked_at,patient_linked_by,doctor_id,source_visit_id,room,bed,admission_reason,status,admission_at,discharge_at,final_diagnosis,hospital_course,treatment_summary,discharge_medicines,discharge_advice,follow_up,created_by,created_at,updated_at", "id", ticketIds);
  const progressNotes = await inRows(admin, "ip_progress_notes", "id,ip_ticket_id,doctor_id,note,chargeable,created_at", "ip_ticket_id", ticketIds);
  const patientIds = [...new Set([...ids(visits, "patient_id"), ...ids(sales, "patient_id"), ...ids(reports, "patient_id"), ...ids(ipTickets, "patient_id")])];
  const patients = await inRows(admin, "patients", "id,phone_normalized,name,dob,gender,address,blood_group,allergies,notes,status,created_at,updated_at", "id", patientIds);
  const datasets: Record<string, Row[]> = { patients, visits, visit_payments: visitPayments, vitals, consultations, prescriptions, prescription_items: prescriptionItems, test_orders: testOrders, reports, pharmacy_sales: sales, pharmacy_sale_items: saleItems, medicine_batches_snapshot: (batchesR.data ?? []) as Row[], ip_tickets: ipTickets, ip_progress_notes: progressNotes, ip_charges: ipCharges, ip_payments: ipPayments, audit_log: (auditR.data ?? []) as Row[], hospital_settings: (settingsR.data ?? []) as Row[] };
  const entries: Array<{ name: string; content: string | Buffer }> = Object.entries(datasets).map(([name, rows]) => ({ name: `${name}.csv`, content: csv(rows) })); let documentCount = 0;
  if (includeDocuments) {
    for (const reportChunk of chunkRows(reports, 4)) {
      const documents = await Promise.all(
        reportChunk.map(async (report) => {
          const path = String(report.object_path);
          const { data, error } = await admin.storage
            .from("patient-documents")
            .download(path);
          if (error || !data) return null;
          return {
            name: `documents/${path}`,
            content: Buffer.from(await data.arrayBuffer()),
          };
        }),
      );
      for (const document of documents) {
        if (!document) continue;
        entries.push(document);
        documentCount += 1;
      }
    }
  }
  const counts = Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, rows.length]));
  const manifest = { hospital: (settingsR.data?.[0] as Row | undefined)?.hospital_name ?? "Meenakshi Hospital", export_month: month, generated_at: new Date().toISOString(), schema_version: 1, app_version: "0.1.0", export_type: includeDocuments ? "data_and_documents" : "data_only", record_counts: counts, included_files: entries.map((entry) => entry.name), document_count: documentCount };
  entries.unshift({ name: "manifest.json", content: JSON.stringify(manifest, null, 2) }); return { entries, counts, documentCount };
}

export async function generateMonthlyExport(_: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("manageUsers"); const parsed = schema.safeParse(Object.fromEntries(formData)); if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const admin = createSupabaseAdminClient(); const exportMonth = `${parsed.data.month}-01`; const includeDocuments = parsed.data.includeDocuments === "on";
  const { data: job, error: jobError } = await admin.from("export_jobs").insert({ export_month: exportMonth, include_documents: includeDocuments, status: "processing", created_by: actor.id }).select("id").single();
  if (jobError || !job) return { ok: false, message: jobError?.code === "23505" ? "An export for this month and type is already generating." : "Export job could not be started." };
  try {
    const { entries, counts, documentCount } = await collectExport(parsed.data.month, includeDocuments); const zip = await zipEntries(entries); const objectPath = `${parsed.data.month}/${job.id}.zip`; const checksum = createHash("sha256").update(zip).digest("hex");
    const { error: uploadError } = await admin.storage.from("hospital-exports").upload(objectPath, zip, { contentType: "application/zip", upsert: false }); if (uploadError) throw uploadError;
    await admin.from("export_jobs").update({ status: "ready", object_path: objectPath, size_bytes: zip.length, completed_at: new Date().toISOString(), expires_at: null }).eq("id", job.id);
    await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "EXPORT_GENERATED", entity_type: "export_job", entity_id: job.id, metadata: { month: parsed.data.month, include_documents: includeDocuments, record_counts: counts, document_count: documentCount, sha256: checksum } });
    revalidatePath("/admin/exports"); return { ok: true, message: "Monthly export generated and stored privately." };
  } catch {
    await admin.from("export_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job.id); return { ok: false, message: "Export generation failed. No partial ZIP was published." };
  }
}

export async function deleteMonthlyExport(formData: FormData) {
  const actor = await requirePermission("manageUsers"); const id = z.string().uuid().parse(formData.get("id")); const admin = createSupabaseAdminClient(); const { data } = await admin.from("export_jobs").select("object_path").eq("id", id).single(); if (data?.object_path) await admin.storage.from("hospital-exports").remove([data.object_path]); await admin.from("export_jobs").update({ status: "expired", object_path: null, size_bytes: null }).eq("id", id); await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "EXPORT_DELETED", entity_type: "export_job", entity_id: id }); revalidatePath("/admin/exports");
}
