import assert from "node:assert/strict";
import test from "node:test";

async function revisionImpactModule() {
  return import(new URL("../lib/revision-impact.ts", import.meta.url).href);
}

async function providerPoolModule() {
  return import(new URL("../lib/ai-provider-pool.ts", import.meta.url).href);
}

async function modelRouterModule() {
  return import(new URL("../lib/model-router.ts", import.meta.url).href);
}

async function promptsModule() {
  return import(new URL("../lib/prompts.ts", import.meta.url).href);
}

test("role revisions identify all related documents", async () => {
  const { analyzeRevisionImpact } = await revisionImpactModule();
  const impact = analyzeRevisionImpact("SCHEMA.md", "Tambahkan role Super Admin dengan permission khusus.");

  assert.deepEqual(impact.affectedFiles, ["PRD.md", "TECH-STACK.md", "UI-UX.md"]);
  assert.match(impact.reasons.join(" "), /role atau permission/i);
});

test("schema-only index revision stays scoped until the user opts into sync", async () => {
  const { analyzeRevisionImpact } = await revisionImpactModule();
  const impact = analyzeRevisionImpact("SCHEMA.md", "Tambahkan index untuk query riwayat pengajuan.");

  assert.deepEqual(impact.affectedFiles, []);
});

test("line diff exposes inserted and removed content", async () => {
  const { createLineDiff } = await revisionImpactModule();
  const diff = createLineDiff("id\nstatus\ncreated_at", "id\nneeds_verification\ncreated_at");

  assert.deepEqual(diff.map((line: { kind: string; value: string }) => [line.kind, line.value]), [
    ["unchanged", "id"],
    ["removed", "status"],
    ["added", "needs_verification"],
    ["unchanged", "created_at"],
  ]);
});

test("gateway failover covers quota, rate limit, and upstream errors", async () => {
  const { shouldFailOverProvider } = await providerPoolModule();

  assert.equal(shouldFailOverProvider(402), true);
  assert.equal(shouldFailOverProvider(429), true);
  assert.equal(shouldFailOverProvider(502), true);
  assert.equal(shouldFailOverProvider(400), false);
});

test("promo:05 and step-flash models are preferred for all stages", async () => {
  const { resolveModelForStage } = await modelRouterModule();
  const models = [
    { id: "promo:05", name: "Promo 0,5", tier: "starter", badge: "Promo", isFlagship: false, healthStatus: "healthy", availabilityLabel: "Tersedia", statusSource: "admin" },
    { id: "promo:05-repair", name: "Promo 0,5 Repair", tier: "starter", badge: "Promo", isFlagship: false, healthStatus: "healthy", availabilityLabel: "Tersedia", statusSource: "admin" },
    { id: "sf/step-3.5-flash", name: "Step 3.5 Flash", tier: "starter", badge: "Step", isFlagship: false, healthStatus: "healthy", availabilityLabel: "Tersedia", statusSource: "provider" },
    { id: "sf/step-3.7-flash", name: "Step 3.7 Flash", tier: "starter", badge: "Step", isFlagship: false, healthStatus: "healthy", availabilityLabel: "Tersedia", statusSource: "provider" },
    { id: "a1/glm-5.1", name: "GLM 5.1", tier: "pro", badge: "Flagship", isFlagship: true, healthStatus: "healthy", availabilityLabel: "Aktif", statusSource: "provider" },
  ] as const;

  assert.equal(resolveModelForStage("blueprint", [...models], "pro")[0]?.modelId, "promo:05");
  assert.equal(resolveModelForStage("schema", [...models], "pro")[0]?.modelId, "promo:05");
  assert.equal(resolveModelForStage("quality-repair", [...models], "pro")[0]?.modelId, "promo:05-repair");
  assert.equal(resolveModelForStage("targeted-repair", [...models], "pro")[0]?.modelId, "promo:05-repair");
  assert.equal(resolveModelForStage("alignment", [...models], "pro")[0]?.modelId, "promo:05-repair");
});

test("targeted repair replaces only the affected Markdown section", async () => {
  const { extractTargetedRepairContext, mergeTargetedRepairSections } = await promptsModule();
  const document = "# Technical Architecture\n\n## API dan Integrasi\nEndpoint lama: /api/v2/orders\n\n## Keamanan\nGunakan RBAC dan audit log.";
  const context = extractTargetedRepairContext("TECH-STACK.md", document, ["endpoint API tidak mengikuti /api/v1"]);
  const merged = mergeTargetedRepairSections(document, "## API dan Integrasi\nEndpoint kanonis: /api/v1/orders");

  assert.match(context.section, /API dan Integrasi/);
  assert.match(merged, /\/api\/v1\/orders/);
  assert.match(merged, /Gunakan RBAC dan audit log/);
  assert.doesNotMatch(merged, /\/api\/v2\/orders/);
});

test("full-document quality repair reiterates the immutable contract", async () => {
  const { getFullDocumentQualityRepairSystemPrompt } = await promptsModule();
  const prompt = getFullDocumentQualityRepairSystemPrompt(
    "TECH-STACK.md",
    {
      projectSummary: "Sistem pemeliharaan gedung",
      roles: [{ name: "Admin Fasilitas" }],
      entities: [{ name: "Tiket" }],
      applicationStatuses: [{ name: "DRAFT" }],
      permissions: { "Admin Fasilitas": ["kelola tiket"] },
      features: [{ name: "Tiket kerusakan", phase: "MVP", roles: ["Admin Fasilitas"], entities: ["Tiket"] }],
      integrations: [],
    },
    "## API\nEndpoint lama.",
    ["WhatsApp tidak tercatat di blueprint."],
  );

  assert.match(prompt, /Tulis ulang SELURUH TECH-STACK\.md/i);
  assert.match(prompt, /WhatsApp tidak tercatat/i);
  assert.match(prompt, /jangan menambah/i);
});
