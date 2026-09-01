import assert from "node:assert/strict";
import test from "node:test";

async function dbModule() {
  return import(new URL("../db/index.ts", import.meta.url).href);
}

// ── Test: classifyFallbackReason ────────────────────────────────────
test("classifyFallbackReason maps HTTP 429 to RATE_LIMITED", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(429, "Too many requests");
  assert.equal(result.code, "RATE_LIMITED");
});

test("classifyFallbackReason maps HTTP 503 to PROVIDER_5XX", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(503, "Service unavailable");
  assert.equal(result.code, "PROVIDER_5XX");
});

test("classifyFallbackReason maps HTTP 500 to PROVIDER_5XX", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(500, "Internal error");
  assert.equal(result.code, "PROVIDER_5XX");
});

test("classifyFallbackReason maps HTTP 404 to MODEL_UNAVAILABLE", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(404, "model_not_found");
  assert.equal(result.code, "MODEL_UNAVAILABLE");
});

test("classifyFallbackReason maps HTTP 408 to TIMEOUT", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(408, "Request timeout");
  assert.equal(result.code, "TIMEOUT");
});

test("classifyFallbackReason maps HTTP 403 to PROVIDER_AUTH_FAILED", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(403, "Access denied");
  assert.equal(result.code, "PROVIDER_AUTH_FAILED");
});

test("classifyFallbackReason maps quota errors to QUOTA_EXCEEDED", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(402, "insufficient_quota");
  assert.equal(result.code, "QUOTA_EXCEEDED");
});

test("classifyFallbackReason maps unknown errors to PROVIDER_ERROR", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(418, "I'm a teapot");
  assert.equal(result.code, "PROVIDER_ERROR");
});

test("classifyFallbackReason preserves original error as detail", async () => {
  const { classifyFallbackReason } = await dbModule();
  const result = classifyFallbackReason(429, "Rate limit exceeded for model gpt-4");
  assert.equal(result.detail, "Rate limit exceeded for model gpt-4");
});

// ── Test: function exports exist ────────────────────────────────────
test("storeProviderAttempt is exported", async () => {
  const mod = await dbModule();
  assert.equal(typeof mod.storeProviderAttempt, "function");
});

test("updateProviderAttemptResult is exported", async () => {
  const mod = await dbModule();
  assert.equal(typeof mod.updateProviderAttemptResult, "function");
});

test("updateProviderAttemptSemantic is exported", async () => {
  const mod = await dbModule();
  assert.equal(typeof mod.updateProviderAttemptSemantic, "function");
});

test("updateGenerationTelemetry is exported", async () => {
  const mod = await dbModule();
  assert.equal(typeof mod.updateGenerationTelemetry, "function");
});

test("classifyFallbackReason is exported", async () => {
  const mod = await dbModule();
  assert.equal(typeof mod.classifyFallbackReason, "function");
});
