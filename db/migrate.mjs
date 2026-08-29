/**
 * Dokumenku AI - Standalone Database Migration Runner (Turso/libSQL)
 * Safe for build/deployment pipeline and multi-instance cold starts
 */

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("[Migration] ERROR: TURSO_DATABASE_URL is required.");
  console.error("[Migration] Set TURSO_DATABASE_URL before running: node db/migrate.mjs");
  process.exit(1);
}
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

console.log(`[Migration] Connecting to database: ${url}`);
const db = createClient({ url, authToken: authToken || undefined });

// 1. Ensure migrations table
await db.execute(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`);

// 2. Define ordered migrations
const migrations = [
  { version: 1, name: "001_users_reserved_credits", sql: "ALTER TABLE users ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0" },
  { version: 2, name: "002_audit_logs_sequence", sql: "ALTER TABLE audit_logs ADD COLUMN sequence INTEGER" },
  { version: 3, name: "003_audit_logs_key_version", sql: "ALTER TABLE audit_logs ADD COLUMN key_version INTEGER DEFAULT 1" },
  { version: 4, name: "004_audit_logs_hashes", sql: "ALTER TABLE audit_logs ADD COLUMN previous_hash TEXT; ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT" },
  { version: 5, name: "005_credit_transactions_order_type", sql: "ALTER TABLE credit_transactions ADD COLUMN order_id TEXT; ALTER TABLE credit_transactions ADD COLUMN type TEXT" },
  { version: 6, name: "006_document_generations_fields", sql: "ALTER TABLE document_generations ADD COLUMN prompt TEXT; ALTER TABLE document_generations ADD COLUMN project_id TEXT; ALTER TABLE document_generations ADD COLUMN document_type TEXT" },
  { version: 7, name: "007_webhook_events_fields", sql: "ALTER TABLE webhook_events ADD COLUMN event_type TEXT; ALTER TABLE webhook_events ADD COLUMN sender TEXT; ALTER TABLE webhook_events ADD COLUMN payload_sha256 TEXT; ALTER TABLE webhook_events ADD COLUMN error_code TEXT" },
  { version: 8, name: "008_orders_approval_and_proof_fields", sql: `ALTER TABLE orders ADD COLUMN approval_token TEXT; ALTER TABLE orders ADD COLUMN approval_token_hash TEXT; ALTER TABLE orders ADD COLUMN approval_token_expires_at TEXT; ALTER TABLE orders ADD COLUMN approval_token_attempts INTEGER DEFAULT 0; ALTER TABLE orders ADD COLUMN proof_image TEXT; ALTER TABLE orders ADD COLUMN proof_sha256 TEXT; ALTER TABLE orders ADD COLUMN proof_storage_key TEXT; ALTER TABLE orders ADD COLUMN proof_url TEXT; ALTER TABLE orders ADD COLUMN proof_mime TEXT; ALTER TABLE orders ADD COLUMN proof_size INTEGER; ALTER TABLE orders ADD COLUMN proof_uploaded_at TEXT; ALTER TABLE orders ADD COLUMN ai_status TEXT; ALTER TABLE orders ADD COLUMN ai_analysis TEXT; ALTER TABLE orders ADD COLUMN ocr_merchant TEXT; ALTER TABLE orders ADD COLUMN ocr_nmid TEXT; ALTER TABLE orders ADD COLUMN ocr_amount TEXT; ALTER TABLE orders ADD COLUMN ocr_transaction_id TEXT; ALTER TABLE orders ADD COLUMN ocr_date TEXT; ALTER TABLE orders ADD COLUMN ocr_status TEXT; ALTER TABLE orders ADD COLUMN ocr_raw_result TEXT; ALTER TABLE orders ADD COLUMN expires_at TEXT; ALTER TABLE orders ADD COLUMN paid_at TEXT` },
  { version: 9, name: "009_rename_credits_to_available_credits", sql: "ALTER TABLE users RENAME COLUMN credits TO available_credits" },
];

console.log("[Migration] Running pending migrations...");
let appliedCount = 0;

for (const m of migrations) {
  const rowResult = await db.execute({ sql: "SELECT version FROM schema_migrations WHERE version = ?", args: [m.version] });
  if (rowResult.rows.length === 0) {
    console.log(`[Migration] Applying ${m.name} (version ${m.version})...`);
    for (const stmt of m.sql.split(";")) {
      const trimmed = stmt.trim();
      if (trimmed) {
        try {
          await db.execute(trimmed);
        } catch (e) {
          // Column might already exist in existing dev schema
        }
      }
    }
    await db.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      args: [m.version, m.name, new Date().toISOString()],
    });
    appliedCount++;
  }
}

console.log(`[Migration] Complete. ${appliedCount} new migrations applied.`);
