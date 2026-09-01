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

// Clean up stale UNKNOWN: blueprint/targeted-repair with transport_success=1 and generation already terminal
const result = await db.execute(`
  UPDATE provider_attempts
  SET semantic_status = 'FAILED',
      fallback_reason_code = 'TELEMETRY_WRITE_FAILED'
  WHERE semantic_status = 'UNKNOWN'
    AND transport_success = 1
    AND generation_id IN (
      SELECT generation_id FROM generation_telemetry
      WHERE final_status IN ('COMPLETED', 'DRAFT_READY', 'READY_WITH_WARNINGS', 'FAILED')
    )
`);
console.log("Cleaned stale UNKNOWN:", result.rowsAffected, "rows");

// Verify no more stale
const check = await db.execute(`
  SELECT COUNT(*) AS cnt FROM provider_attempts
  WHERE semantic_status = 'UNKNOWN'
    AND generation_id IN (
      SELECT generation_id FROM generation_telemetry
      WHERE final_status IN ('COMPLETED', 'DRAFT_READY', 'READY_WITH_WARNINGS', 'FAILED')
    )
`);
console.log("Remaining stale:", check.rows[0].cnt);

db.close();
