/**
 * Dokumenku AI - Turso E2E Test Helpers
 * Shared utilities for staging integration tests
 */

import { createHmac, randomBytes } from "node:crypto";

// ─── Environment Guards ────────────────────────────────────────────

export function assertStagingEnvironment() {
  if (process.env.E2E_ALLOW_DESTRUCTIVE_TESTS !== "1") {
    throw new Error(
      "Refusing destructive E2E tests. Set E2E_ALLOW_DESTRUCTIVE_TESTS=1."
    );
  }

  const target = process.env.E2E_TARGET;
  if (target !== "staging") {
    throw new Error(
      `Refusing to run: E2E_TARGET="${target}". Must be "staging".`
    );
  }

  const url = process.env.TURSO_DATABASE_URL ?? "";
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set.");
  }

  if (url.includes("production") || url.includes("prod")) {
    throw new Error(
      "Refusing to run: TURSO_DATABASE_URL looks like production."
    );
  }
}

export function validateRequiredEnvVars() {
  const required = [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "APP_SESSION_SECRET",
    "APPROVAL_TOKEN_SECRET",
    "ADMIN_WA_PHONE",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}\n` +
      `These must match what Vercel Preview uses.`
    );
  }

  // Soft warnings for optional but recommended
  const recommended = ["FONNTE_WEBHOOK_SECRET", "AUDIT_CHAIN_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
  for (const key of recommended) {
    if (!process.env[key]) {
      console.warn(`  ⚠️  ${key} not set — some tests may skip`);
    }
  }
}

export function getBaseUrl() {
  const base = process.env.BASE_URL;
  if (!base) {
    throw new Error("BASE_URL is not set. Set it to your Vercel Preview URL.");
  }
  return base.replace(/\/$/, "");
}

export function getRunId() {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

// ─── Login Helpers ─────────────────────────────────────────────────

export async function loginUser(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const cookie = res.headers.get("set-cookie");
  const body = await res.json();

  if (!cookie) {
    throw new Error(
      `LOGIN_COOKIE_NOT_RETURNED: ${JSON.stringify(body)}`
    );
  }

  return { cookie, body, status: res.status };
}

export async function loginAdmin(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const cookie = res.headers.get("set-cookie");
  const body = await res.json();

  if (!cookie) {
    throw new Error(
      `ADMIN_LOGIN_COOKIE_NOT_RETURNED: ${JSON.stringify(body)}`
    );
  }

  return { cookie, body, status: res.status };
}

export async function registerUser(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const cookie = res.headers.get("set-cookie");
  const body = await res.json();

  return { cookie, body, status: res.status };
}

// ─── API Fetch with Session ────────────────────────────────────────

export async function apiFetch(baseUrl, path, opts = {}) {
  const { cookie, method = "GET", body, headers = {} } = opts;

  const fetchOpts = {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };

  if (cookie) {
    fetchOpts.headers.Cookie = cookie;
  }

  if (body !== undefined) {
    fetchOpts.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, fetchOpts);
  const contentType = res.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

// ─── Direct Turso Client ───────────────────────────────────────────

export async function createTursoClient() {
  const { createClient } = await import("@libsql/client");
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  if (!url) throw new Error("TURSO_DATABASE_URL is not set.");

  return createClient({ url, authToken: authToken || undefined });
}

// ─── Approval Token Helper ─────────────────────────────────────────

export function generateKnownToken() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 6; i++) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

export function hashToken(token) {
  const secret = process.env.APPROVAL_TOKEN_SECRET || process.env.APP_SECRET;
  if (!secret) {
    throw new Error(
      "APPROVAL_TOKEN_SECRET (or APP_SECRET) is not set."
    );
  }
  return createHmac("sha256", secret).update(token.toUpperCase().trim()).digest("hex");
}

// ─── Test Runner ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

export function resetCounters() {
  passed = 0;
  failed = 0;
  failures.length = 0;
}

export function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

export function assertEqual(actual, expected, label) {
  const pass = actual === expected;
  if (pass) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`);
    console.log(`  ❌ ${label} — got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)}`);
  }
}

export function assertIncludes(haystack, needle, label) {
  const pass = typeof haystack === "string" && haystack.includes(needle);
  if (pass) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label} — "${needle}" not found`);
    console.log(`  ❌ ${label} — "${needle}" not found in response`);
  }
}

export async function runTest(name, fn) {
  console.log(`\n── ${name} ──`);
  try {
    await fn();
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ❌ FATAL: ${err.message}`);
  }
}

export function printSummary() {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`  • ${f}`);
    }
  }
  console.log(`${"═".repeat(50)}`);
  return failed === 0;
}

// ─── Cleanup Helper ────────────────────────────────────────────────

export async function cleanupTestUser(db, email) {
  try {
    await db.execute({ sql: "DELETE FROM credit_transactions WHERE user_email = ?", args: [email] });
    await db.execute({ sql: "DELETE FROM credit_reservations WHERE user_email = ?", args: [email] });
    await db.execute({ sql: "DELETE FROM document_generations WHERE user_email = ?", args: [email] });
    await db.execute({ sql: "DELETE FROM orders WHERE user_email = ?", args: [email] });
    await db.execute({ sql: "DELETE FROM project_documents WHERE user_email = ?", args: [email] });
    await db.execute({ sql: "DELETE FROM users WHERE email = ?", args: [email] });
  } catch (err) {
    console.warn(`  ⚠️ Cleanup warning for ${email}: ${err.message}`);
  }
}

export async function cleanupTestOrder(db, orderId) {
  try {
    await db.execute({ sql: "DELETE FROM audit_logs WHERE order_id = ?", args: [orderId] });
    await db.execute({ sql: "DELETE FROM verified_transactions WHERE order_id = ?", args: [orderId] });
    await db.execute({ sql: "DELETE FROM credit_transactions WHERE order_id = ?", args: [orderId] });
    await db.execute({ sql: "DELETE FROM orders WHERE id = ?", args: [orderId] });
  } catch (err) {
    console.warn(`  ⚠️ Cleanup warning for order ${orderId}: ${err.message}`);
  }
}
