/**
 * Gate 1C+1D: Application Persistence via Turso
 *
 * Tests:
 * 1. Register user via API → Turso direct client sees the row
 * 2. GET /api/account returns same data
 * 3. Simulate new invocation: new API call still sees data
 * 4. Final pass against BASE_URL (Vercel Preview)
 *
 * REQUIRES: BASE_URL pointing to running app (Vercel Preview or localhost)
 */

import {
  assertStagingEnvironment, validateRequiredEnvVars,
  getBaseUrl,
  getRunId,
  registerUser,
  loginUser,
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
const email = `e2e-${runId}@example.test`;
const password = "TestPass123!";

console.log(`\nBase URL: ${baseUrl}`);
console.log(`Run ID: ${runId}`);
console.log(`Test email: ${email}`);

const db = await createTursoClient();

// ── Step 1: Register user via API ──────────────────────────────────
let sessionCookie = null;

await runTest("1. Register user via API", async () => {
  const { cookie, body, status } = await registerUser(baseUrl, email, password);

  assertEqual(status, 201, "Register returns 201");
  assert(body?.ok === true, "Register body.ok is true");
  assert(cookie?.includes("dokumenku_session"), "Session cookie returned");

  sessionCookie = cookie;
});

// ── Step 2: Direct Turso sees the row ──────────────────────────────
await runTest("2. Direct Turso client sees registered user", async () => {
  const result = await db.execute({
    sql: "SELECT email, available_credits, reserved_credits FROM users WHERE email = ?",
    args: [email],
  });

  const user = result.rows[0];
  assert(user !== undefined, "User row found in Turso");
  assertEqual(user?.email, email, "Email matches");

  if (user) {
    assert(
      typeof user.available_credits === "number",
      `available_credits is a number (got: ${typeof user.available_credits})`
    );
    assertEqual(user.reserved_credits, 0, "reserved_credits starts at 0");
  }
});

// ── Step 3: GET /api/account returns same data ─────────────────────
await runTest("3. GET /api/account returns correct data", async () => {
  const { status, data } = await apiFetch(baseUrl, "/api/account", {
    cookie: sessionCookie,
  });

  assertEqual(status, 200, "GET /api/account returns 200");
  assertEqual(data?.email, email, "Email matches in account response");
  assertEqual(data?.authenticated, true, "Authenticated is true");
  assert(
    typeof data?.credits === "number",
    `credits is a number (got: ${typeof data?.credits})`
  );
});

// ── Step 4: New invocation still sees data ─────────────────────────
await runTest("4. New API invocation sees same data", async () => {
  const { status, data } = await apiFetch(baseUrl, "/api/account", {
    cookie: sessionCookie,
  });

  assertEqual(status, 200, "Second GET /api/account returns 200");
  assertEqual(data?.email, email, "Email persists across invocations");
  assertEqual(data?.authenticated, true, "Still authenticated");
});

// ── Step 5: Direct Turso confirms persistence ──────────────────────
await runTest("5. Direct Turso confirms row still exists", async () => {
  // Use a fresh client to simulate "new invocation"
  const freshDb = await createTursoClient();
  const result = await freshDb.execute({
    sql: "SELECT email FROM users WHERE email = ?",
    args: [email],
  });

  assert(result.rows.length > 0, "User found with fresh Turso client");

  // Cleanup
  await cleanupTestUser(db, email);
  await freshDb.close();
});

// ── Summary ────────────────────────────────────────────────────────
const ok = printSummary();
process.exit(ok ? 0 : 1);
