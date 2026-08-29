/**
 * Gate 1E: Atomic Credit Reservation
 *
 * Tests concurrent credit reservations via the production /api/generations/start route.
 * Verifies that atomic guards prevent over-reservation.
 *
 * Flow:
 * 1. Register user with initial credits
 * 2. Admin top-up to exactly 100 credits
 * 3. 10 parallel /api/generations/start (each tries 25 credits)
 * 4. Exactly 4 should succeed (100 / 25 = 4)
 * 5. Verify balance: available=0, reserved=100
 * 6. Cleanup: release all reservations
 */

import {
  assertStagingEnvironment, validateRequiredEnvVars,
  getBaseUrl,
  getRunId,
  registerUser,
  loginAdmin,
  apiFetch,
  createTursoClient,
  runTest,
  assert,
  assertEqual,
  printSummary,
  resetCounters,
  cleanupTestUser,
} from "./helpers.mjs";

resetCounters();
assertStagingEnvironment();\nvalidateRequiredEnvVars();

const baseUrl = getBaseUrl();
const runId = getRunId();
const userEmail = `e2e-credits-${runId}@example.test`;
const userPassword = "TestPass123!";
const adminEmail = process.env.ADMIN_EMAIL || "admin@dokumenku.ai";
const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);
console.log(`Test email: ${userEmail}`);

const db = await createTursoClient();

// ── Setup: Register user + top-up to 100 credits ───────────────────
let userCookie = null;
let adminCookie = null;

await runTest("Setup: Register user", async () => {
  const { cookie, status } = await registerUser(baseUrl, userEmail, userPassword);
  assertEqual(status, 201, "User registered");
  userCookie = cookie;
});

await runTest("Setup: Admin top-up to 100 credits", async () => {
  const { cookie } = await loginAdmin(baseUrl, adminEmail, adminPassword);
  adminCookie = cookie;

  // Get current credits from registration (INITIAL_CREDITS, default 3)
  const userResult = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  const currentCredits = Number(userResult.rows[0]?.available_credits ?? 0);
  const needed = 100 - currentCredits;

  if (needed > 0) {
    const { status } = await apiFetch(baseUrl, "/api/admin/credits", {
      cookie: adminCookie,
      method: "POST",
      body: { email: userEmail, amount: needed, reason: "E2E test setup" },
    });
    assertEqual(status, 200, "Admin top-up succeeded");
  }

  const verifyResult = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  assertEqual(Number(verifyResult.rows[0]?.available_credits), 100, "User has 100 credits");
});

// ── Gate 1E: 10 Concurrent Credit Reservations ────────────────────
await runTest("Gate 1E: 10 concurrent /api/generations/start", async () => {
  const CONCURRENT = 10;
  const RESERVE_AMOUNT = 25;
  const MAX_SUCCESS = Math.floor(100 / RESERVE_AMOUNT); // 4

  const requests = [];
  for (let i = 0; i < CONCURRENT; i++) {
    requests.push(
      apiFetch(baseUrl, "/api/generations/start", {
        cookie: userCookie,
        method: "POST",
        body: {
          selectedModel: "deepseek-v4-flash-0731",
          prompt: `E2E test concurrent reservation ${i}`,
          documentType: "PRD",
        },
      })
    );
  }

  const results = await Promise.all(requests);

  const succeeded = results.filter((r) => r.status === 201 && r.data?.ok === true);
  const failed = results.filter((r) => r.status === 402 || r.data?.ok === false);

  console.log(`  ℹ️  Succeeded: ${succeeded.length}, Failed: ${failed.length}`);

  assert(
    succeeded.length === MAX_SUCCESS,
    `Exactly ${MAX_SUCCESS} reservations succeeded (got ${succeeded.length})`
  );

  assert(
    failed.length === CONCURRENT - MAX_SUCCESS,
    `${CONCURRENT - MAX_SUCCESS} got CREDIT_INSUFFICIENT (got ${failed.length})`
  );

  // Collect generation IDs for cleanup
  const generationIds = succeeded
    .map((r) => r.data?.data?.generationId)
    .filter(Boolean);

  // Verify balance
  const balanceResult = await db.execute({
    sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  const balance = balanceResult.rows[0];

  assertEqual(Number(balance?.available_credits), 0, "available_credits = 0");
  assertEqual(Number(balance?.reserved_credits), 100, "reserved_credits = 100");

  // Cleanup: release all reservations via direct DB update
  for (const genId of generationIds) {
    await db.execute({
      sql: "UPDATE credit_reservations SET status = 'RELEASED', settled_at = ? WHERE generation_id = ?",
      args: [new Date().toISOString(), genId],
    });
  }

  // Restore credits
  await db.execute({
    sql: "UPDATE users SET available_credits = 100, reserved_credits = 0 WHERE email = ?",
    args: [userEmail],
  });

  const finalBalance = await db.execute({
    sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  assertEqual(
    Number(finalBalance.rows[0]?.available_credits),
    100,
    "Credits restored to 100"
  );
  assertEqual(
    Number(finalBalance.rows[0]?.reserved_credits),
    0,
    "Reserved credits reset to 0"
  );
});

// ── Cleanup ────────────────────────────────────────────────────────
await runTest("Cleanup", async () => {
  await cleanupTestUser(db, userEmail);
  const verify = await db.execute({
    sql: "SELECT email FROM users WHERE email = ?",
    args: [userEmail],
  });
  assertEqual(verify.rows.length, 0, "Test user removed");
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
