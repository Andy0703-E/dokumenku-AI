import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
const env = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i)] = t.slice(i + 1);
}
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN || undefined });

const r1 = await db.execute("SELECT COUNT(*) AS cnt FROM generation_telemetry");
console.log("Total rows:", r1.rows[0].cnt);

const r2 = await db.execute("SELECT generation_id, credit_result, draft_ready_at, finalized_at, routing_version, provider_count, findings_breakdown FROM generation_telemetry ORDER BY rowid DESC LIMIT 3");
console.log("\nLatest 3 telemetry:");
r2.rows.forEach(r => console.log(JSON.stringify(r)));

const r3 = await db.execute("SELECT DISTINCT generation_id FROM provider_attempts ORDER BY rowid DESC LIMIT 5");
console.log("\nLatest 5 distinct generation_ids from attempts:");
r3.rows.forEach(r => console.log(r.generation_id));

db.close();
