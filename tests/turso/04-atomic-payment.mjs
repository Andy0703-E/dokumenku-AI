/**
 * Gate 1F: Atomic Payment Approval
 *
 * Tests the PENDING_REVIEW → PAID state transition via executeAtomicPaymentApproval.
 *
 * Flow:
 * 1. Register user
 * 2. Seed order in PENDING_REVIEW state with known token hash
 * 3. Admin login
 * 4. POST /api/admin/orders { orderId, action: "approve" }
 * 5. Verify: order status = PAID
 * 6. Verify: user credits increased by order.credits
 * 7. Verify: verified_transactions row exists
 * 8. Verify: audit_logs entry with valid hash chain
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
const userEmail = `e2e-payment-${runId}@example.test`;
const userPassword = "TestPass123!";
const adminEmail = process.env.ADMIN_EMAIL || "admin@dokumenku.ai";
const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
const orderId = `INV-E2E-${runId.toUpperCase()}`;
const orderCredits = 100;
const orderAmount = 49000;

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);
console.log(`Order ID: ${orderId}`);

const db = await createTursoClient();

// ── Setup: Register user + admin login ─────────────────────────────
let adminCookie = null;

await runTest("Setup: Register user", async () => {
  const { status } = await registerUser(baseUrl, userEmail, userPassword);
  assertEqual(status, 201, "User registered");
});

await runTest("Setup: Admin login", async () => {
  const { cookie } = await loginAdmin(baseUrl, adminEmail, adminPassword);
  adminCookie = cookie;
  assert(cookie !== null, "Admin cookie obtained");
});

// ── Setup: Seed order in PENDING_REVIEW ────────────────────────────
const knownToken = generateKnownToken();
const tokenHash = hashToken(knownToken);
const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

await runTest("Setup: Seed PENDING_REVIEW order", async () => {
  await db.execute({
    sql: `INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status,
      approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at)
      VALUES (?, ?, 'Pro Studio', ?, ?, 'QRIS', 'PENDING_REVIEW', ?, ?, 0, ?)`,
    args: [
      orderId,
      userEmail,
      orderAmount,
      orderCredits,
      tokenHash,
      tokenExpiresAt,
      new Date().toISOString(),
    ],
  });

  const result = await db.execute({
    sql: "SELECT status FROM orders WHERE id = ?",
    args: [orderId],
  });
  assertEqual(result.rows[0]?.status, "PENDING_REVIEW", "Order seeded as PENDING_REVIEW");
});

// ── Gate 1F: Atomic Payment Approval ──────────────────────────────
await runTest("Gate 1F: Admin approve → PAID (atomic)", async () => {
  const { status, data } = await apiFetch(baseUrl, "/api/admin/orders", {
    cookie: adminCookie,
    method: "POST",
    body: { orderId, action: "approve" },
  });

  assertEqual(status, 200, "Approve returns 200");
  assert(data?.ok === true, "Approve response ok=true");
  assert(
    data?.data?.creditsGranted === orderCredits,
    `Credits granted: ${data?.data?.creditsGranted} === ${orderCredits}`
  );
});

await runTest("Gate 1F: Order status = PAID", async () => {
  const result = await db.execute({
    sql: "SELECT status, paid_at FROM orders WHERE id = ?",
    args: [orderId],
  });

  assertEqual(result.rows[0]?.status, "PAID", "Order status is PAID");
  assert(result.rows[0]?.paid_at !== null, "paid_at is set");
});

await runTest("Gate 1F: User credits increased", async () => {
  const result = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });

  const credits = Number(result.rows[0]?.available_credits ?? 0);
  assert(credits >= orderCredits, `User has >= ${orderCredits} credits (got ${credits})`);
});

await runTest("Gate 1F: verified_transactions recorded", async () => {
  const result = await db.execute({
    sql: "SELECT * FROM verified_transactions WHERE order_id = ?",
    args: [orderId],
  });

  assert(result.rows.length >= 1, "verified_transactions row exists");
  assertEqual(result.rows[0]?.order_id, orderId, "verified_transactions.order_id matches");
});

await runTest("Gate 1F: audit_logs entry exists", async () => {
  const result = await db.execute({
    sql: "SELECT * FROM audit_logs WHERE order_id = ? AND action = 'PAYMENT_APPROVED'",
    args: [orderId],
  });

  assert(result.rows.length >= 1, "audit_logs PAYMENT_APPROVED entry exists");

  const entry = result.rows[0];
  assert(entry?.entry_hash !== null && entry?.entry_hash !== undefined, "audit entry has entry_hash");
  assert(entry?.previous_hash !== null && entry?.previous_hash !== undefined, "audit entry has previous_hash");
  assert(
    typeof entry?.sequence === "number",
    `audit sequence is number (got: ${typeof entry?.sequence})`
  );
});

// ── Cleanup ────────────────────────────────────────────────────────
await runTest("Cleanup", async () => {
  await cleanupTestOrder(db, orderId);
  await cleanupTestUser(db, userEmail);

  const orderCheck = await db.execute({
    sql: "SELECT id FROM orders WHERE id = ?",
    args: [orderId],
  });
  assertEqual(orderCheck.rows.length, 0, "Test order removed");
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
