import { readFileSync } from "node:fs";
import pg from "pg";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({
  connectionString: `postgresql://postgres.${process.env.SUPABASE_PROJECT_ID}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
for (const q of process.argv.slice(2)) {
  const r = await c.query(q);
  console.log(JSON.stringify(r.rows));
}
await c.end();
