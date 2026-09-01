import assert from "node:assert/strict";
import test from "node:test";

async function qualityModule() {
  return import(new URL("../lib/blueprint-quality.ts", import.meta.url).href);
}

async function lifecycleModule() {
  return import(new URL("../lib/semantic-lifecycle.ts", import.meta.url).href);
}

async function apiHelpersModule() {
  return import(new URL("../lib/api-helpers.ts", import.meta.url).href);
}

async function promptsModule() {
  return import(new URL("../lib/prompts.ts", import.meta.url).href);
}

async function generationTelemetryModule() {
  return import(new URL("../lib/generation-telemetry.ts", import.meta.url).href);
}

type Outcome = { attemptId: string; status: "SUCCESS" | "FAILED"; failureCode?: string };

function recorder(outcomes: Outcome[]) {
  return async (attemptId: string, status: Outcome["status"], failureCode?: Outcome["failureCode"]) => {
    outcomes.push(failureCode ? { attemptId, status, failureCode } : { attemptId, status });
  };
}

const validBlueprint = JSON.stringify({
  projectSummary: "Portal layanan warga.",
  roles: [{ name: "Admin" }],
  entities: [{ name: "Permohonan" }],
  applicationStatuses: [{ name: "DRAFT" }],
  permissions: { Admin: ["manage"] },
  features: [{ name: "Pengajuan", roles: ["Admin"], entities: ["Permohonan"] }],
  integrations: [],
});

const validSchema = [
  "# Schema",
  "## Entitas\nTabel permohonan menyimpan data layanan warga.",
  "## Relasi\nPermohonan terhubung dengan pengguna.",
  "## Constraint\nNomor referensi harus unik.",
  "## Index\nIndex dibuat untuk pencarian status.",
  "## Lifecycle\nDRAFT dapat berubah menjadi DISETUJUI.",
  "## Audit\nSetiap perubahan disimpan dalam audit trail.",
  "## Retention\nData disimpan sesuai kebijakan retensi.",
  "\n" + "Dokumentasi skema lengkap. ".repeat(120),
].join("\n\n");

test("blueprint HTTP 200 with a valid contract reports SUCCESS", async () => {
  const { parseBlueprintContract, validateBlueprintContract } = await qualityModule();
  const { finalizeSemanticAttempt, SemanticValidationError } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  await finalizeSemanticAttempt("blueprint-valid", () => {
    const blueprint = parseBlueprintContract(validBlueprint);
    const failures = validateBlueprintContract(blueprint);
    if (failures.length) throw new SemanticValidationError(failures.join(" "), "SEMANTIC_VALIDATION_FAILED");
    return blueprint;
  }, recorder(outcomes), { output: validBlueprint });

  assert.deepEqual(outcomes, [{ attemptId: "blueprint-valid", status: "SUCCESS" }]);
});

test("blueprint HTTP 200 with invalid JSON reports FAILED", async () => {
  const { parseBlueprintContract } = await qualityModule();
  const { finalizeSemanticAttempt } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  const output = '{"roles": invalid}';
  await assert.rejects(() => finalizeSemanticAttempt(
    "blueprint-invalid-json",
    () => parseBlueprintContract(output),
    recorder(outcomes),
    { output },
  ));

  assert.deepEqual(outcomes, [{
    attemptId: "blueprint-invalid-json",
    status: "FAILED",
    failureCode: "INVALID_STRUCTURED_OUTPUT",
  }]);
});

test("an attempt ID remains available when optional model metadata is absent", async () => {
  const { extractSemanticAttemptId } = await lifecycleModule();
  const headers = new Headers({ "X-Attempt-Id": "ui-ux-without-model-header" });

  assert.equal(extractSemanticAttemptId(headers), "ui-ux-without-model-header");
});

test("a stalled HTTP 200 document stream reports FAILED instead of remaining UNKNOWN", async () => {
  const { consumeProviderStream } = await apiHelpersModule();
  const { finalizeSemanticAttempt } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  const response = new Response(new ReadableStream({ start() {} }));

  await assert.rejects(() => finalizeSemanticAttempt(
    "ui-ux-stalled-stream",
    () => consumeProviderStream(response, "openai-compatible", "Dokumenku AI", () => {}, { timeoutMs: 10 }),
    recorder(outcomes),
    { output: "partial document" },
  ));

  assert.deepEqual(outcomes, [{
    attemptId: "ui-ux-stalled-stream",
    status: "FAILED",
    failureCode: "OUTPUT_TRUNCATED",
  }]);
});

test("alignment HTTP 200 with invalid JSON reports FAILED", async () => {
  const { finalizeSemanticAttempt } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  const output = '{"UI-UX.md": invalid}';

  await assert.rejects(() => finalizeSemanticAttempt(
    "alignment-invalid-json",
    () => JSON.parse(output),
    recorder(outcomes),
    { output },
  ));

  assert.deepEqual(outcomes, [{
    attemptId: "alignment-invalid-json",
    status: "FAILED",
    failureCode: "INVALID_STRUCTURED_OUTPUT",
  }]);
});

test("schema HTTP 200 with a complete document reports SUCCESS", async () => {
  const { validateDocumentCompleteness } = await qualityModule();
  const { finalizeSemanticAttempt, SemanticValidationError } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  await finalizeSemanticAttempt("schema-valid", () => {
    const check = validateDocumentCompleteness("SCHEMA.md", validSchema);
    if (!check.valid) throw new SemanticValidationError(check.detail, "SEMANTIC_VALIDATION_FAILED");
    return validSchema;
  }, recorder(outcomes), { output: validSchema });

  assert.deepEqual(outcomes, [{ attemptId: "schema-valid", status: "SUCCESS" }]);
});

test("schema HTTP 200 truncated by the provider reports FAILED", async () => {
  const { finalizeSemanticAttempt, SemanticValidationError } = await lifecycleModule();
  const outcomes: Outcome[] = [];
  await assert.rejects(() => finalizeSemanticAttempt(
    "schema-truncated",
    () => {
      throw new SemanticValidationError("Output stopped at the provider limit.", "OUTPUT_TRUNCATED");
    },
    recorder(outcomes),
    { output: validSchema.slice(0, 600), finishReason: "length" },
  ));

  assert.deepEqual(outcomes, [{
    attemptId: "schema-truncated",
    status: "FAILED",
    failureCode: "OUTPUT_TRUNCATED",
  }]);
});

test("targeted repair HTTP 200 with an applicable valid patch reports SUCCESS", async () => {
  const { validateDocumentCompleteness } = await qualityModule();
  const { finalizeSemanticAttempt, SemanticValidationError } = await lifecycleModule();
  const { mergeTargetedRepairSections } = await promptsModule();
  const outcomes: Outcome[] = [];
  const patch = "## Audit\nAudit trail now records actor, timestamp, and changed fields.";
  const repaired = await finalizeSemanticAttempt("repair-valid", () => {
    const merged = mergeTargetedRepairSections(validSchema, patch);
    if (merged === validSchema) throw new SemanticValidationError("Patch was not applied.", "SEMANTIC_VALIDATION_FAILED");
    const check = validateDocumentCompleteness("SCHEMA.md", merged);
    if (!check.valid) throw new SemanticValidationError(check.detail, "SEMANTIC_VALIDATION_FAILED");
    return merged;
  }, recorder(outcomes), { output: patch });

  assert.match(repaired, /changed fields/);
  assert.deepEqual(outcomes, [{ attemptId: "repair-valid", status: "SUCCESS" }]);
});

test("targeted repair HTTP 200 with an unappliable patch reports FAILED", async () => {
  const { finalizeSemanticAttempt, SemanticValidationError } = await lifecycleModule();
  const { mergeTargetedRepairSections } = await promptsModule();
  const outcomes: Outcome[] = [];
  const patch = "Tidak ada heading markdown untuk diterapkan.";
  await assert.rejects(() => finalizeSemanticAttempt(
    "repair-invalid",
    () => {
      const merged = mergeTargetedRepairSections(validSchema, patch);
      if (merged === validSchema) throw new SemanticValidationError("Patch was not applied.", "SEMANTIC_VALIDATION_FAILED");
      return merged;
    },
    recorder(outcomes),
    { output: patch },
  ));

  assert.deepEqual(outcomes, [{
    attemptId: "repair-invalid",
    status: "FAILED",
    failureCode: "SEMANTIC_VALIDATION_FAILED",
  }]);
});

test("a terminal DRAFT_READY lifecycle records both terminal timestamps", async () => {
  const { terminalDraftTelemetry } = await generationTelemetryModule();
  const timestamp = "2026-08-31T12:31:18.171Z";

  assert.deepEqual(terminalDraftTelemetry(timestamp), {
    creditResult: "CAPTURED",
    draftReadyAt: timestamp,
    finalizedAt: timestamp,
    finalStatus: "DRAFT_READY",
  });
});
