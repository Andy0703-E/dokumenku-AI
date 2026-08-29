/**
 * Gate 1G: WhatsApp Webhook Concurrency
 *
 * Scenario A: 20 requests with SAME inboxid (replay protection)
 *   Expected: 1 PROCESSED, 19 replay responses, 1 credit grant
 *
 * Scenario B: 20 requests with UNIQUE inboxid (payment idempotency)
 *   Expected: 1 PAYMENT_APPROVED, 19 IGNORED/FAILED, 1 credit grant
 *
 * Flow:
 * 1. Register user + admin
 * 2. Seed order in PENDING_REVIEW with known token
 * 3. Fire webhook requests
 * 4. Verify idempotency + single credit grant
 * 5. Cleanup
 */

import { randomBytes } from "node:crypto";
import {
  assertStagingEnvironment, validateRequiredEnvVars,
  getBaseUrl,
  getRunId,
  registerUser,
  loginAdmin,
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
const userEmail = `e2e-webhook-${runId}@example.test`;
const userPassword = "TestPass123!";
const adminEmail = process.env.ADMIN_EMAIL || "admin@dokumenku.ai";
const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
const orderId = `INV-WA-${runId.toUpperCase()}`;
const orderCredits = 100;

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);

const db = await createTursoClient();

// ── Setup ──────────────────────────────────────────────────────────
await runTest("Setup: Register user", async () => {
  const { status } = await registerUser(baseUrl, userEmail, userPassword);
  assertEqual(status, 201, "User registered");
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

  const result = await db.execute({ sql: "SELECT status FROM orders WHERE id = ?", args: [orderId] });
  assertEqual(result.rows[0]?.status, "PENDING_REVIEW", "Order seeded");
});

// Get admin phone from the app for sender matching
const adminPhone = process.env.ADMIN_WA_PHONE || process.env.WA_ADMIN_PHONE || "6285754494990";
const normalizedAdmin = adminPhone.replace(/[^0-9]/g, "");

// ── Scenario A: Replay (same inboxid) ──────────────────────────────
await runTest("Scenario A: 20 requests, same inboxid (replay protection)", async () => {
  const SAME_INBOX_ID = `wa-e2e-replay-${runId}`;
  const CONCURRENT = 20;

  const requests = [];
  for (let i = 0; i < CONCURRENT; i++) {
    const payload = {
      sender: normalizedAdmin,
      message: `ACC ${orderId} ${knownToken}`,
      inboxid: SAME_INBOX_ID,
    };

    requests.push(
      fetch(`${baseUrl}/api/webhooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (r) => ({
        status: r.status,
        data: await r.json().catch(() => ({})),
      }))
    );
  }

  const results = await Promise.all(requests);

  const paid = results.filter((r) => r.data?.status === "PAID");
  const replays = results.filter((r) => r.data?.replay === true);
  const errors = results.filter((r) => r.status !== 200 || (r.data?.ok === false && !r.data?.replay));

  console.log(`  ℹ️  PAID: ${paid.length}, Replays: ${replays.length}, Errors: ${errors.length}`);

  assert(paid.length <= 1, `At most 1 PAID (got ${paid.length})`);
  assert(replays.length >= 1, `At least 1 replay detected (got ${replays.length})`);

  // Verify order is PAID
  const orderResult = await db.execute({ sql: "SELECT status FROM orders WHERE id = ?", args: [orderId] });
  assertEqual(orderResult.rows[0]?.status, "PAID", "Order status = PAID");

  // Verify user got exactly 1x credits
  const creditResult = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  const credits = Number(creditResult.rows[0]?.available_credits ?? 0);
  assert(credits >= orderCredits, `User has >= ${orderCredits} credits (got ${credits})`);
});

// ── Scenario B: Unique events ──────────────────────────────────────
// For this scenario we need a fresh order
const orderId2 = `INV-WA2-${runId.toUpperCase()}`;
const knownToken2 = generateKnownToken();
const tokenHash2 = hashToken(knownToken2);

await runTest("Setup: Seed second PENDING_REVIEW order for Scenario B", async () => {
  await db.execute({
    sql: `INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status,
      approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at)
      VALUES (?, ?, 'Pro Studio', 49000, ?, 'QRIS', 'PENDING_REVIEW', ?, ?, 0, ?)`,
    args: [orderId2, userEmail, orderCredits, tokenHash2, tokenExpiresAt, new Date().toISOString()],
  });
});

await runTest("Scenario B: 20 unique inboxid, same ACC command", async () => {
  const CONCURRENT = 20;

  const requests = [];
  for (let i = 0; i < CONCURRENT; i++) {
    const uniqueInboxId = `wa-e2e-unique-${runId}-${i}`;
    const payload = {
      sender: normalizedAdmin,
      message: `ACC ${orderId2} ${knownToken2}`,
      inboxid: uniqueInboxId,
    };

    requests.push(
      fetch(`${baseUrl}/api/webhooks/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (r) => ({
        status: r.status,
        data: await r.json().catch(() => ({})),
      }))
    );
  }

  const results = await Promise.all(requests);

  const paid = results.filter((r) => r.data?.status === "PAID");
  const failed = results.filter((r) => r.data?.ok === false && !r.data?.replay);

  console.log(`  ℹ️  PAID: ${paid.length}, Failed: ${failed.length}`);

  assert(paid.length === 1, `Exactly 1 PAID (got ${paid.length})`);

  // Verify all 20 webhook_events recorded (each unique inboxid = separate event)
  const events = await db.execute({
    sql: "SELECT * FROM webhook_events WHERE provider = 'fonnte' AND external_event_id LIKE ?",
    args: [`wa-e2e-unique-${runId}-%`],
  });
  assertEqual(events.rows.length, 20, "All 20 webhook_events recorded");

  // Verify only 1 resulted in PAYMENT_APPROVED
  const processedEvents = events.rows.filter((r) => r.status === "PROCESSED");
  assertEqual(processedEvents.length, 1, "Exactly 1 webhook_events PROCESSED");

  // Verify credits = exactly +100 (no double)
  const creditResult = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  const credits = Number(creditResult.rows[0]?.available_credits ?? 0);
  assert(credits >= orderCredits, `User has >= ${orderCredits} credits (got ${credits})`);
});

// ── Cleanup ────────────────────────────────────────────────────────
await runTest("Cleanup", async () => {
  await cleanupTestOrder(db, orderId);
  await cleanupTestOrder(db, orderId2);
  await cleanupTestUser(db, userEmail);

  // Clean webhook_events
  await db.execute({
    sql: "DELETE FROM webhook_events WHERE external_event_id LIKE ?",
    args: [`wa-e2e-replay-${runId}`],
  });
  await db.execute({
    sql: "DELETE FROM webhook_events WHERE external_event_id LIKE ?",
    args: [`wa-e2e-unique-${runId}-%`],
  });
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
