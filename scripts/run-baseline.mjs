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

console.log("=== 1. ALL GENERATION TELEMETRY (last 10) ===");
const r1 = await db.execute(`
  SELECT generation_id, quality_path, final_status, total_duration_ms,
    blueprint_ms, prd_ms, tech_stack_ms, ui_ux_ms, schema_ms,
    fast_gate_ms, targeted_repair_ms, alignment_ms, quality_gate_ms,
    findings_count, findings_breakdown, fallback_count, provider_count,
    routing_version, credit_result, draft_ready_at, finalized_at, created_at
  FROM generation_telemetry
  ORDER BY rowid DESC LIMIT 10
`);
r1.rows.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== 2. PROVIDER ATTEMPTS (all for latest 6 generations) ===");
const r2 = await db.execute(`
  SELECT generation_id, stage, provider, model, attempt, latency_ms,
    transport_success, semantic_status, http_status,
    fallback_reason_code, fallback_reason_detail
  FROM provider_attempts
  WHERE generation_id IN (
    SELECT generation_id FROM generation_telemetry ORDER BY rowid DESC LIMIT 6
  )
  ORDER BY generation_id, rowid
`);
r2.rows.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== 3. AGGREGATE (latest 6) ===");
const r3 = await db.execute(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN final_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN final_status = 'DRAFT_READY' THEN 1 ELSE 0 END) AS draft_ready,
    SUM(CASE WHEN final_status = 'READY_WITH_WARNINGS' THEN 1 ELSE 0 END) AS warnings,
    SUM(CASE WHEN final_status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
    ROUND(AVG(total_duration_ms)) AS avg_total_ms,
    MIN(total_duration_ms) AS min_total_ms,
    MAX(total_duration_ms) AS max_total_ms,
    SUM(CASE WHEN quality_path = 'FAST_PASS' THEN 1 ELSE 0 END) AS fast_pass,
    SUM(CASE WHEN quality_path = 'TARGETED_REPAIR' THEN 1 ELSE 0 END) AS targeted_repair,
    SUM(CASE WHEN quality_path = 'TARGETED_REPAIR_ALIGNMENT' THEN 1 ELSE 0 END) AS alignment,
    SUM(CASE WHEN quality_path = 'READY_WITH_WARNINGS' THEN 1 ELSE 0 END) AS warnings_path,
    SUM(CASE WHEN credit_result = 'CAPTURED' THEN 1 ELSE 0 END) AS credit_captured,
    SUM(CASE WHEN credit_result = 'RELEASED' THEN 1 ELSE 0 END) AS credit_released
  FROM generation_telemetry
  ORDER BY rowid DESC LIMIT 6
`);
console.log(JSON.stringify(r3.rows[0]));

console.log("\n=== 4. STALE UNKNOWN ===");
const r4 = await db.execute(`
  SELECT pa.attempt_id, pa.generation_id, pa.stage, pa.model,
    gt.final_status
  FROM provider_attempts pa
  JOIN generation_telemetry gt ON gt.generation_id = pa.generation_id
  WHERE pa.semantic_status = 'UNKNOWN'
    AND gt.final_status IN ('COMPLETED', 'DRAFT_READY', 'READY_WITH_WARNINGS')
    AND (julianday('now') - julianday(pa.created_at)) * 86400 > 60
`);
console.log("Stale count:", r4.rows.length);
r4.rows.forEach(r => console.log(JSON.stringify(r)));

console.log("\n=== 5. INVARIANT CHECKS ===");
const r5a = await db.execute(`
  SELECT generation_id, COUNT(*) AS cnt FROM generation_telemetry
  WHERE credit_result = 'CAPTURED' GROUP BY generation_id HAVING COUNT(*) > 1
`);
console.log("Double credit capture:", r5a.rows.length);

const r5b = await db.execute(`
  SELECT generation_id, stage, attempt, COUNT(*) AS cnt FROM provider_attempts
  GROUP BY generation_id, stage, operation_id, attempt HAVING COUNT(*) > 1
`);
console.log("Duplicate attempts:", r5b.rows.length);

db.close();
