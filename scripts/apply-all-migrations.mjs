/**
 * Applies every migration in supabase/migrations, in order, to a fresh
 * database -- same mechanism as apply-migration.mjs (one at a time, over the
 * pooler, recorded into supabase_migrations.schema_migrations so the CLI's
 * history stays consistent), just looped instead of invoked per file.
 *
 * Stops at the first failure and reports exactly which file and how many
 * succeeded before it, rather than pushing on into a half-applied schema.
 *
 *   node scripts/apply-all-migrations.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import pg from "pg";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

const dir = "supabase/migrations";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join(dir, f));

console.log(`Applying ${files.length} migrations to project ${process.env.SUPABASE_PROJECT_ID}...`);

const client = new pg.Client({
  connectionString: `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: already } = await client.query(
  "select version from supabase_migrations.schema_migrations",
);
const done = new Set(already.map((r) => r.version));

let applied = 0;
let failed = false;
try {
  for (const file of files) {
    const name = basename(file);
    const version = name.split("_")[0];
    if (done.has(version)) {
      console.log(`  [skip] ${name} (already recorded)`);
      continue;
    }
    const sql = readFileSync(file, "utf8");
    try {
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, name) values ($1,$2) on conflict (version) do nothing",
        [version, name.replace(/^\d+_/, "").replace(/\.sql$/, "")],
      );
      applied++;
      console.log(`  [${applied}/${files.length}] ${name}`);
    } catch (error) {
      console.error(`\nFAILED at ${name} (${applied} applied before this one):`);
      console.error(`  ${error.message}`);
      failed = true;
      break;
    }
  }
  if (!failed) {
    await client.query("notify pgrst, 'reload schema'");
    console.log(`\nAll ${applied} migrations applied. Schema cache reload notified.`);
  }
} finally {
  await client.end();
}
if (failed) process.exit(1);
