/**
 * Migration 010: Rebuild telemetry tables to match current codebase schema.
 *
 * SAFETY: Only drops tables if BOTH are completely empty (0 rows).
 * If either has data, migration aborts to prevent data loss.
 *
 * What changed vs. Turso live schema:
 *   generation_telemetry: +fast_gate_ms, +findings_breakdown, +provider_count,
 *                         +routing_version, +credit_result, +draft_ready_at, +finalized_at
 *   provider_attempts:    +attempt_id (UNIQUE), +operation_id, +semantic_status,
 *                         +fallback_reason_code, +fallback_reason_detail,
 *                         UNIQUE constraint changed to (generation_id, stage, operation_id, attempt)
 */

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
  console.log("[Migration 010] Connecting to Turso...");

  // ── Safety check: both tables must be empty ──
  const gtCount = await db.execute("SELECT COUNT(*) AS cnt FROM generation_telemetry");
  const paCount = await db.execute("SELECT COUNT(*) AS cnt FROM provider_attempts");

  const gtRows = Number(gtCount.rows[0].cnt);
  const paRows = Number(paCount.rows[0].cnt);

  console.log(`[Migration 010] generation_telemetry: ${gtRows} rows`);
  console.log(`[Migration 010] provider_attempts: ${paRows} rows`);

  if (gtRows > 0 || paRows > 0) {
    console.error("[Migration 010] ABORT: Tables are not empty. Manual review required.");
    console.error(`  generation_telemetry has ${gtRows} rows.`);
    console.error(`  provider_attempts has ${paRows} rows.`);
    console.error("  If you want to rebuild, manually export/back up data first.");
    process.exit(1);
  }

  // ── Drop old tables ──
  console.log("[Migration 010] Dropping provider_attempts...");
  await db.execute("DROP TABLE IF EXISTS provider_attempts");

  console.log("[Migration 010] Dropping generation_telemetry...");
  await db.execute("DROP TABLE IF EXISTS generation_telemetry");

  // ── Recreate generation_telemetry (matches db/index.ts line 286-315) ──
  console.log("[Migration 010] Creating generation_telemetry...");
  await db.execute(`
    CREATE TABLE generation_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id TEXT NOT NULL UNIQUE,
      user_email TEXT NOT NULL,
      project_id TEXT,
      quality_path TEXT,
      final_status TEXT,
      total_duration_ms INTEGER,
      blueprint_ms INTEGER,
      prd_ms INTEGER,
      tech_stack_ms INTEGER,
      ui_ux_ms INTEGER,
      schema_ms INTEGER,
      fast_gate_ms INTEGER,
      targeted_repair_ms INTEGER,
      alignment_ms INTEGER,
      quality_gate_ms INTEGER,
      targeted_repair_count INTEGER DEFAULT 0,
      alignment_used INTEGER DEFAULT 0,
      findings_count INTEGER DEFAULT 0,
      findings_breakdown TEXT,
      models_used TEXT,
      fallback_count INTEGER DEFAULT 0,
      provider_count INTEGER DEFAULT 0,
      routing_version TEXT,
      credit_result TEXT,
      draft_ready_at TEXT,
      finalized_at TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // ── Recreate provider_attempts (matches db/index.ts line 316-335) ──
  console.log("[Migration 010] Creating provider_attempts...");
  await db.execute(`
    CREATE TABLE provider_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL UNIQUE,
      generation_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      operation_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      latency_ms INTEGER,
      transport_success INTEGER NOT NULL DEFAULT 0,
      semantic_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      http_status INTEGER,
      fallback_reason_code TEXT,
      fallback_reason_detail TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT NOT NULL,
      UNIQUE(generation_id, stage, operation_id, attempt)
    )
  `);

  // ── Create indexes ──
  console.log("[Migration 010] Creating indexes...");
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_generation_telemetry_user ON generation_telemetry(user_email, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_generation_telemetry_quality_path ON generation_telemetry(quality_path)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_attempts_generation ON provider_attempts(generation_id, stage)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_attempts_provider ON provider_attempts(provider, model, created_at)`,
  ];
  for (const sql of indexes) {
    await db.execute(sql);
  }

  // ── Record migration ──
  console.log("[Migration 010] Recording migration in schema_migrations...");
  await db.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
    args: [10, "010_rebuild_telemetry_v1", new Date().toISOString()],
  });

  // ── Verify ──
  console.log("\n[Migration 010] Verifying...");
  const verifyGT = await db.execute("PRAGMA table_info(generation_telemetry)");
  const verifyPA = await db.execute("PRAGMA table_info(provider_attempts)");
  const verifyIdx = await db.execute("PRAGMA index_list(provider_attempts)");

  console.log("\ngeneration_telemetry columns:");
  verifyGT.rows.forEach(r => console.log(`  ${r.name} ${r.type} ${r.notnull ? "NOT NULL" : ""} ${r.dflt_value ? "DEFAULT " + r.dflt_value : ""}`));

  console.log("\nprovider_attempts columns:");
  verifyPA.rows.forEach(r => console.log(`  ${r.name} ${r.type} ${r.notnull ? "NOT NULL" : ""} ${r.dflt_value ? "DEFAULT " + r.dflt_value : ""}`));

  console.log("\nprovider_attempts indexes:");
  verifyIdx.rows.forEach(r => console.log(`  ${r.name} unique=${r.unique}`));

  db.close();
  console.log("\n[Migration 010] DONE.");
}

main().catch(e => {
  console.error("[Migration 010] FATAL:", e);
  process.exit(1);
});
