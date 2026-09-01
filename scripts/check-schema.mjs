import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

const envContent = readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const db = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN || undefined,
});

async function main() {
  const tables = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  console.log("=== TABLES ===");
  tables.rows.forEach(r => console.log(r.name));

  console.log("\n=== generation_telemetry columns ===");
  const cols = await db.execute(`PRAGMA table_info(generation_telemetry)`);
  cols.rows.forEach(c => console.log(`${c.name} ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value ? 'DEFAULT ' + c.dflt_value : ''}`));

  console.log("\n=== provider_attempts columns ===");
  const cols2 = await db.execute(`PRAGMA table_info(provider_attempts)`);
  cols2.rows.forEach(c => console.log(`${c.name} ${c.type} ${c.notnull ? 'NOT NULL' : ''} ${c.dflt_value ? 'DEFAULT ' + c.dflt_value : ''}`));

  console.log("\n=== generation_telemetry row count ===");
  const cnt = await db.execute(`SELECT COUNT(*) AS cnt FROM generation_telemetry`);
  console.log(cnt.rows[0].cnt);

  console.log("\n=== provider_attempts row count ===");
  const cnt2 = await db.execute(`SELECT COUNT(*) AS cnt FROM provider_attempts`);
  console.log(cnt2.rows[0].cnt);

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
