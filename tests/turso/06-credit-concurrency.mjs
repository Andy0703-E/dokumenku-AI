/**
 * Gate 1H: Concurrent Credit Reservations via /api/generations/start
 *
 * Tests that parallel generation-start requests respect atomic credit guards.
 *
 * Flow:
 * 1. Register user with exactly 50 credits
 * 2. Fire 10 parallel /api/generations/start (each tries 25 credits)
 * 3. Exactly 2 should succeed (50 / 25 = 2)
 * 4. 8 should return CREDIT_INSUFFICIENT
 * 5. Verify: available_credits = 0, reserved_credits = 50
 * 6. Cleanup
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
const userEmail = `e2e-gen-${runId}@example.test`;
const userPassword = "TestPass123!";
const adminEmail = process.env.ADMIN_EMAIL || "admin@dokumenku.ai";
const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);

const db = await createTursoClient();

// ── Setup: Register user + set exactly 50 credits ──────────────────
let userCookie = null;

await runTest("Setup: Register user", async () => {
  const { cookie, status } = await registerUser(baseUrl, userEmail, userPassword);
  assertEqual(status, 201, "User registered");
  userCookie = cookie;
});

await runTest("Setup: Set exactly 50 credits", async () => {
  await db.execute({
    sql: "UPDATE users SET available_credits = 50 WHERE email = ?",
    args: [userEmail],
  });

  const result = await db.execute({
    sql: "SELECT available_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  assertEqual(Number(result.rows[0]?.available_credits), 50, "User has 50 credits");
});

// ── Gate 1H: 10 Concurrent Generation Starts ──────────────────────
await runTest("Gate 1H: 10 concurrent /api/generations/start", async () => {
  const CONCURRENT = 10;
  const CREDIT_COST = 25;
  const MAX_SUCCESS = Math.floor(50 / CREDIT_COST); // 2

  const requests = [];
  for (let i = 0; i < CONCURRENT; i++) {
    requests.push(
      apiFetch(baseUrl, "/api/generations/start", {
        cookie: userCookie,
        method: "POST",
        body: {
          selectedModel: "deepseek-v4-flash-0731",
          prompt: `E2E concurrent generation test ${i}`,
          documentType: "PRD",
        },
      })
    );
  }

  const results = await Promise.all(requests);

  const succeeded = results.filter((r) => r.status === 201 && r.data?.ok === true);
  const creditInsufficient = results.filter(
    (r) =>
      r.data?.code === "CREDIT_INSUFFICIENT" ||
      (r.data?.ok === false && r.status === 402)
  );

  console.log(`  ℹ️  Succeeded: ${succeeded.length}, CREDIT_INSUFFICIENT: ${creditInsufficient.length}`);

  assert(
    succeeded.length === MAX_SUCCESS,
    `Exactly ${MAX_SUCCESS} succeeded (got ${succeeded.length})`
  );

  assert(
    creditInsufficient.length === CONCURRENT - MAX_SUCCESS,
    `${CONCURRENT - MAX_SUCCESS} got CREDIT_INSUFFICIENT (got ${creditInsufficient.length})`
  );

  // Verify balance
  const balance = await db.execute({
    sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
    args: [userEmail],
  });
  const row = balance.rows[0];

  assertEqual(Number(row?.available_credits), 0, "available_credits = 0");
  assertEqual(Number(row?.reserved_credits), 50, "reserved_credits = 50");

  // Cleanup: release reservations
  const generationIds = succeeded
    .map((r) => r.data?.data?.generationId)
    .filter(Boolean);

  for (const genId of generationIds) {
    await db.execute({
      sql: "UPDATE credit_reservations SET status = 'RELEASED', settled_at = ? WHERE generation_id = ?",
      args: [new Date().toISOString(), genId],
    });
  }

  await db.execute({
    sql: "UPDATE users SET available_credits = 0, reserved_credits = 0 WHERE email = ?",
    args: [userEmail],
  });
});

// ── Cleanup ────────────────────────────────────────────────────────
await runTest("Cleanup", async () => {
  await cleanupTestUser(db, userEmail);
  const verify = await db.execute({ sql: "SELECT email FROM users WHERE email = ?", args: [userEmail] });
  assertEqual(verify.rows.length, 0, "Test user removed");
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
