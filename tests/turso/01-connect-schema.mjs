/**
 * Gate 1B: Turso Connection + Schema Verification + Migration Idempotency
 *
 * Tests:
 * 1. Direct Turso connection works
 * 2. All required tables exist (by name, not count)
 * 3. Required indexes exist
 * 4. Required triggers exist
 * 5. users table has available_credits (not credits)
 * 6. orders table has credits column
 * 7. Migration is idempotent (run twice)
 */

import {
  assertStagingEnvironment, validateRequiredEnvVars,
  createTursoClient,
  runTest,
  assert,
  assertEqual,
  printSummary,
  resetCounters,
} from "./helpers.mjs";

resetCounters();
assertStagingEnvironment();\nvalidateRequiredEnvVars();

const db = await createTursoClient();

// ── Test 1: Connection ─────────────────────────────────────────────
await runTest("Turso Connection", async () => {
  const result = await db.execute("SELECT 1 AS ok");
  assert(result.rows[0]?.ok === 1, "SELECT 1 returns successfully");
});

// ── Test 2: Required Tables ────────────────────────────────────────
await runTest("Required Tables", async () => {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  const tables = result.rows.map((r) => r.name);

  const requiredTables = [
    "users",
    "admins",
    "orders",
    "credit_transactions",
    "credit_reservations",
    "document_generations",
    "project_documents",
    "verified_transactions",
    "webhook_events",
    "audit_logs",
    "schema_migrations",
  ];

  for (const table of requiredTables) {
    assert(tables.includes(table), `Table exists: ${table}`);
  }
});

// ── Test 3: Required Indexes ───────────────────────────────────────
await runTest("Required Indexes", async () => {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
  );
  const indexes = result.rows.map((r) => r.name);

  const requiredIndexes = [
    "uq_audit_sequence",
    "uq_credit_payment_order",
  ];

  for (const idx of requiredIndexes) {
    assert(indexes.includes(idx), `Index exists: ${idx}`);
  }
});

// ── Test 4: Required Triggers ──────────────────────────────────────
await runTest("Required Triggers", async () => {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'trigger'"
  );
  const triggers = result.rows.map((r) => r.name);

  const requiredTriggers = [
    "audit_logs_no_update",
    "audit_logs_no_delete",
  ];

  for (const trig of requiredTriggers) {
    assert(triggers.includes(trig), `Trigger exists: ${trig}`);
  }
});

// ── Test 5: users.available_credits exists ──────────────────────────
await runTest("Schema: users.available_credits", async () => {
  const result = await db.execute("PRAGMA table_info(users)");
  const columns = result.rows.map((r) => r.name);

  assert(columns.includes("available_credits"), "users has available_credits column");
  assert(columns.includes("reserved_credits"), "users has reserved_credits column");
  assert(!columns.includes("credits"), "users does NOT have legacy 'credits' column");
});

// ── Test 6: orders.credits exists (not renamed) ────────────────────
await runTest("Schema: orders.credits preserved", async () => {
  const result = await db.execute("PRAGMA table_info(orders)");
  const columns = result.rows.map((r) => r.name);

  assert(columns.includes("credits"), "orders has credits column (not renamed)");
});

// ── Test 7: Migration Idempotency ─────────────────────────────────
await runTest("Migration Idempotency", async () => {
  const before = await db.execute(
    "SELECT COUNT(*) AS cnt FROM schema_migrations"
  );
  const countBefore = Number(before.rows[0]?.cnt ?? 0);

  // Run migration again — should not fail or duplicate
  const { execSync } = await import("node:child_process");
  execSync("node db/migrate.mjs", {
    cwd: process.cwd(),
    timeout: 30000,
    stdio: "pipe",
  });

  const after = await db.execute(
    "SELECT COUNT(*) AS cnt FROM schema_migrations"
  );
  const countAfter = Number(after.rows[0]?.cnt ?? 0);

  assertEqual(countBefore, countAfter, "Migration count unchanged (idempotent)");
  assert(countAfter >= 9, `At least 9 migrations applied (got ${countAfter})`);
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
