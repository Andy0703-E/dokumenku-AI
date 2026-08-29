/**
 * Gate 1I: Fault Injection + Rollback on Turso Remote
 *
 * Uses a temporary DB trigger to force RAISE(ABORT) mid-transaction,
 * proving that Turso remote properly rolls back atomic transactions.
 *
 * No production code changes needed — uses Turso staging's own trigger system.
 *
 * Flow:
 * 1. Register user + admin
 * 2. Seed order in PENDING_REVIEW
 * 3. Create fault trigger: RAISE(ABORT) on credit_transactions INSERT
 * 4. Attempt admin payment approval
 * 5. Verify: entire transaction rolled back
 *    - order status remains PENDING_REVIEW
 *    - available_credits unchanged
 *    - verified_transactions: 0 new rows
 *    - credit_transactions: 0 new rows
 * 6. Drop fault trigger
 * 7. Retry approval (should succeed without trigger)
 * 8. Cleanup
 */

import {
  assertStagingEnvironment, validateRequiredEnvVars,
  getBaseUrl,
  getRunId,
  registerUser,
  loginAdmin,
  apiFetch,
  createTursoClient,
  generateKnownToken,
  hashToken,
  runTest,
  assert,
  assertEqual,
  printSummary,
  resetCounters,
  cleanupTestUser,
  cleanupTestOrder,
} from "./helpers.mjs";

resetCounters();
assertStagingEnvironment();\nvalidateRequiredEnvVars();

const baseUrl = getBaseUrl();
const runId = getRunId();
const userEmail = `e2e-fault-${runId}@example.test`;
const userPassword = "TestPass123!";
const adminEmail = process.env.ADMIN_EMAIL || "admin@dokumenku.ai";
const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
const orderId = `INV-FAULT-${runId.toUpperCase()}`;
const orderCredits = 100;

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);

const db = await createTursoClient();

// ── Setup ──────────────────────────────────────────────────────────
await runTest("Setup: Register user", async () => {
  const { status } = await registerUser(baseUrl, userEmail, userPassword);
  assertEqual(status, 201, "User registered");
});

await runTest("Setup: Admin login", async () => {
  const { cookie } = await loginAdmin(baseUrl, adminEmail, adminPassword);
  assert(cookie !== null, "Admin cookie obtained");
});

const knownToken = generateKnownToken();
const tokenHash = hashToken(knownToken);
const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

await runTest("Setup: Seed PENDING_REVIEW order", async () => {
  await db.execute({
    sql: `INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status,
      approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at)
      VALUES (?, ?, 'Pro Studio', 49000, ?, 'QRIS', 'PENDING_REVIEW', ?, ?, 0, ?)`,
    args: [orderId, userEmail, orderCredits, tokenHash, tokenExpiresAt, new Date().toISOString()],
  });
});

// Record pre-fault state
let preOrderStatus, preCredits;

await runTest("Setup: Record pre-fault state", async () => {
  const order = await db.execute({ sql: "SELECT status FROM orders WHERE id = ?", args: [orderId] });
  preOrderStatus = order.rows[0]?.status;

  const user = await db.execute({ sql: "SELECT available_credits FROM users WHERE email = ?", args: [userEmail] });
  preCredits = Number(user.rows[0]?.available_credits ?? 0);
});

// ── Gate 1I: Fault Injection (try/finally ensures trigger cleanup) ──
async function removeFaultTrigger() {
  try {
    await db.execute("DROP TRIGGER IF EXISTS staging_fail_credit_ledger");
    const result = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'staging_fail_credit_ledger'",
    });
    assertEqual(result.rows.length, 0, "Fault trigger removed");
  } catch (err) {
    console.error(`  ⚠️ CRITICAL: Could not remove fault trigger: ${err.message}`);
  }
}

// Always clean up first (from any previous failed run)
await removeFaultTrigger();

try {
  // Install fault trigger
  await runTest("Gate 1I: Create fault trigger", async () => {
    await db.execute(`
      CREATE TRIGGER staging_fail_credit_ledger
      BEFORE INSERT ON credit_transactions
      BEGIN
        SELECT RAISE(ABORT, 'STAGING_FAULT_INJECTION');
      END
    `);

    const result = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'staging_fail_credit_ledger'",
    });
    assert(result.rows.length === 1, "Fault trigger created");
  });

  // Attempt approval — should trigger rollback
  await runTest("Gate 1I: Approval triggers rollback via fault", async () => {
    const { status, data } = await apiFetch(baseUrl, "/api/admin/orders", {
      cookie: (await loginAdmin(baseUrl, adminEmail, adminPassword)).cookie,
      method: "POST",
      body: { orderId, action: "approve" },
    });

    console.log(`  ℹ️  Response: status=${status}, ok=${data?.ok}, error=${data?.error || data?.data?.error || "none"}`);

    // Verify rollback: order must still be PENDING_REVIEW
    const orderAfter = await db.execute({ sql: "SELECT status FROM orders WHERE id = ?", args: [orderId] });
    assertEqual(
      orderAfter.rows[0]?.status,
      "PENDING_REVIEW",
      "Order still PENDING_REVIEW (transaction rolled back)"
    );

    // Verify no credits were added
    const userAfter = await db.execute({
      sql: "SELECT available_credits FROM users WHERE email = ?",
      args: [userEmail],
    });
    const creditsAfter = Number(userAfter.rows[0]?.available_credits ?? 0);
    assertEqual(creditsAfter, preCredits, "Credits unchanged after rollback");

    // Verify no verified_transactions inserted
    const vtxAfter = await db.execute({
      sql: "SELECT COUNT(*) AS cnt FROM verified_transactions WHERE order_id = ?",
      args: [orderId],
    });
    assertEqual(Number(vtxAfter.rows[0]?.cnt), 0, "No verified_transactions inserted");
  });
} finally {
  // ALWAYS remove fault trigger — even if test crashes
  await removeFaultTrigger();
}

// ── Verify: Approval works without trigger ─────────────────────────
await runTest("Gate 1I: Approval succeeds after trigger removed", async () => {
  const { status, data } = await apiFetch(baseUrl, "/api/admin/orders", {
    cookie: (await loginAdmin(baseUrl, adminEmail, adminPassword)).cookie,
    method: "POST",
    body: { orderId, action: "approve" },
  });

  assertEqual(status, 200, "Approve returns 200 after trigger removed");
  assert(data?.ok === true, "Approve succeeded");

  const orderFinal = await db.execute({ sql: "SELECT status FROM orders WHERE id = ?", args: [orderId] });
  assertEqual(orderFinal.rows[0]?.status, "PAID", "Order status = PAID");
});

// ── Cleanup ────────────────────────────────────────────────────────
await runTest("Cleanup", async () => {
  await cleanupTestOrder(db, orderId);
  await cleanupTestUser(db, userEmail);
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
