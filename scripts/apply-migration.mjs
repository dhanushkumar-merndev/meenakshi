/**
 * Applies one migration file through the connection pooler and records it in
 * supabase_migrations.schema_migrations, so the CLI still sees a consistent
 * history.
 *
 * `supabase db push` needs IPv6 to reach the database directly, which this
 * network does not have; the pooler is IPv4 and works.
 *
 *   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

const file = process.argv[2];
if (!file) throw new Error("Pass the migration file path.");
const version = basename(file).split("_")[0];
const sql = readFileSync(file, "utf8");

const client = new pg.Client({
  connectionString: `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  await client.query(
    "insert into supabase_migrations.schema_migrations(version, name) values ($1,$2) on conflict (version) do nothing",
    [version, basename(file).replace(/^\d+_/, "").replace(/\.sql$/, "")],
  );
  // PostgREST caches the function signatures; without this a new RPC returns
  // PGRST202 until the schema cache happens to refresh.
  await client.query("notify pgrst, 'reload schema'");
  console.log(`Applied ${basename(file)}`);
} finally {
  await client.end();
}
