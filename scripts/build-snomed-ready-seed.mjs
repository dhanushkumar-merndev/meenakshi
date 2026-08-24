/**
 * Builds the checked-in SQL seed from the three user-supplied CSV files.
 *
 * Diagnoses supplies the authoritative 727 terms and metadata; aliases and
 * autocomplete supply every additional phrase staff may type. The output is
 * deterministic and safe to re-run through Supabase migrations.
 *
 * Usage:
 *   node scripts/build-snomed-ready-seed.mjs [dataset-directory] [output.sql]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const sourceDirectory = path.resolve(
  process.argv[2] ??
    "/home/dhanush/Downloads/snomed_ready_common_diagnosis_dataset",
);
const outputFile = path.resolve(
  process.argv[3] ??
    "supabase/migrations/20260823250000_snomed_ready_common_diagnosis_seed.sql",
);

const fileNames = {
  diagnoses: "snomed_common_diagnoses.csv",
  aliases: "snomed_common_aliases.csv",
  autocomplete: "snomed_autocomplete_index_10000.csv",
};

function readRows(fileName) {
  const file = path.join(sourceDirectory, fileName);
  if (!fs.existsSync(file)) throw new Error(`Missing dataset file: ${file}`);
  const workbook = XLSX.readFile(file, { raw: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

const diagnoses = readRows(fileNames.diagnoses);
const aliases = readRows(fileNames.aliases);
const autocomplete = readRows(fileNames.autocomplete);
const byLocalId = new Map();

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en");
}

for (const row of diagnoses) {
  const localId = text(row.local_id);
  const preferredTerm = text(row.preferred_term);
  if (!localId || !preferredTerm || byLocalId.has(localId)) {
    throw new Error(`Invalid or duplicate diagnosis local_id: ${localId || "(blank)"}`);
  }
  const entry = {
    localId,
    preferredTerm,
    specialty: text(row.specialty),
    conceptClass: text(row.concept_class),
    conceptId: text(row.snomed_concept_id),
    mappingStatus: text(row.mapping_status) || "UNMAPPED",
    notes: text(row.notes),
    aliases: new Map(),
  };
  for (const value of text(row.synonyms).split("|")) {
    const alias = text(value);
    if (alias) entry.aliases.set(normalized(alias), alias);
  }
  byLocalId.set(localId, entry);
}

function addAlias(localIdValue, ...values) {
  const localId = text(localIdValue);
  const entry = byLocalId.get(localId);
  if (!entry) throw new Error(`Alias/index references unknown diagnosis ${localId}`);
  for (const value of values) {
    const alias = text(value);
    const key = normalized(alias);
    if (alias && key !== normalized(entry.preferredTerm)) {
      entry.aliases.set(key, alias);
    }
  }
}

for (const row of aliases) {
  addAlias(row.local_id, row.alias, row.normalized_alias);
}
for (const row of autocomplete) {
  addAlias(row.local_id, row.search_key, row.matched_alias);
}

function sql(value) {
  return `'${text(value).replaceAll("'", "''")}'`;
}

function nullableSql(value) {
  const cleaned = text(value);
  return cleaned ? sql(cleaned) : "null";
}

function aliasArray(entry) {
  const values = [...entry.aliases.values()].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
  return values.length
    ? `array[${values.map(sql).join(",")} ]::text[]`
    : "array[]::text[]";
}

const entries = [...byLocalId.values()].sort((a, b) =>
  a.localId.localeCompare(b.localId),
);
const mappedCount = entries.filter(
  (entry) => entry.conceptId && entry.mappingStatus !== "UNMAPPED",
).length;
const chunks = [];

for (let start = 0; start < entries.length; start += 100) {
  const rows = entries.slice(start, start + 100).map((entry) => {
    const verified = entry.conceptId && entry.mappingStatus !== "UNMAPPED";
    return `  ('diagnosis',${sql(entry.preferredTerm)},${aliasArray(entry)},${verified ? sql(entry.conceptId) : "null"},${verified ? sql("SNOMED-CT") : "null"},'SNOMED-ready common diagnosis dataset','User-provided local dataset; license not supplied','3 CSV bundle · 2026-08-23',true)`;
  });
  chunks.push(`insert into public.clinical_terms (
  term_type, display_text, search_aliases, code, code_system,
  source, source_license, source_version, active
)
values
${rows.join(",\n")}
on conflict (term_type, normalized_text) do update set
  search_aliases = array(
    select distinct alias
    from unnest(public.clinical_terms.search_aliases || excluded.search_aliases) alias
    where btrim(alias) <> ''
    order by alias
  ),
  code = coalesce(public.clinical_terms.code, excluded.code),
  code_system = coalesce(public.clinical_terms.code_system, excluded.code_system),
  active = true;`);
}

for (let start = 0; start < entries.length; start += 100) {
  const rows = entries.slice(start, start + 100).map((entry) =>
    `  (${sql(entry.localId)},${sql(entry.preferredTerm)},${nullableSql(entry.specialty)},${nullableSql(entry.conceptClass)},${sql(entry.mappingStatus)},${nullableSql(entry.notes)})`,
  );
  chunks.push(`with source_rows(source_reference, preferred_term, specialty, concept_class, mapping_status, notes) as (
values
${rows.join(",\n")}
)
insert into public.clinical_term_catalog_memberships (
  term_id, catalog, source_reference, specialty, concept_class,
  mapping_status, notes
)
select
  term.id,
  'SNOMED-ready common diagnosis dataset',
  source.source_reference,
  source.specialty,
  source.concept_class,
  source.mapping_status,
  source.notes
from source_rows source
join public.clinical_terms term
  on term.term_type = 'diagnosis'
 and term.normalized_text = lower(regexp_replace(trim(source.preferred_term), '\\s+', ' ', 'g'))
on conflict (catalog, source_reference) do update set
  term_id = excluded.term_id,
  specialty = excluded.specialty,
  concept_class = excluded.concept_class,
  mapping_status = excluded.mapping_status,
  notes = excluded.notes;`);
}

const header = `-- Generated by scripts/build-snomed-ready-seed.mjs from all three files:
--   ${fileNames.diagnoses} (${diagnoses.length} rows)
--   ${fileNames.aliases} (${aliases.length} rows)
--   ${fileNames.autocomplete} (${autocomplete.length} rows)
--
-- The bundle contains ${mappedCount} verified SNOMED concept IDs. Unmapped
-- rows are searchable from the SNOMED-ready tab but are deliberately stored
-- without a SNOMED code/system so the application never claims an unverified
-- local phrase is licensed SNOMED CT terminology.
begin;
`;

fs.writeFileSync(outputFile, `${header}\n${chunks.join("\n\n")}\n\ncommit;\n`);
console.log(
  JSON.stringify(
    {
      outputFile,
      diagnoses: diagnoses.length,
      aliases: aliases.length,
      autocomplete: autocomplete.length,
      mappedConceptIds: mappedCount,
      uniqueSearchAliases: entries.reduce((sum, entry) => sum + entry.aliases.size, 0),
    },
    null,
    2,
  ),
);
