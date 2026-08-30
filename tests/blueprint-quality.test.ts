import assert from "node:assert/strict";
import test from "node:test";

import type { BlueprintContract, QualityCheck } from "../lib/blueprint-quality";

async function qualityModule() {
  return import(new URL("../lib/blueprint-quality.ts", import.meta.url).href);
}

const blueprint = {
  version: "1.0",
  projectSummary: "Sistem penyaluran bantuan desa.",
  roles: [
    { name: "Kepala Desa" },
    { name: "Admin Desa" },
    { name: "Tim Verifikasi/BPD" },
  ],
  entities: [{ name: "Pengajuan", statuses: ["DRAFT", "VERIFIKASI"] }],
  applicationStatuses: [{ domain: "pengajuan", name: "DRAFT" }],
  permissions: {},
  features: [{ name: "Penyaluran bantuan", phase: "MVP", roles: ["Kepala Desa"], entities: ["Pengajuan"] }],
  integrations: [],
  deployment: {},
  securityRequirements: [],
  designTokens: {},
  assumptions: [],
  openQuestions: [],
} satisfies BlueprintContract;

function documents(overrides: Partial<Record<"PRD.md" | "TECH-STACK.md" | "UI-UX.md" | "SCHEMA.md", string>> = {}) {
  return {
    "PRD.md": "Kepala Desa menetapkan penerima. Flag Perlu Verifikasi digunakan untuk peninjauan.",
    "TECH-STACK.md": "Semua endpoint berada di bawah /api/v1. | POST | /api/beneficiaries | Admin Desa | NIK dienkripsi AES-256.",
    "UI-UX.md": "Tim Verifikasi/BPD meninjau pengajuan.",
    "SCHEMA.md": "deliberations: decision TEXT. nik_encrypted TEXT UNIQUE. NIK terenkripsi AES-256.",
    ...overrides,
  };
}

test("V2.1 detects the six semantic repair conditions", async () => {
  const { documentsNeedingQualityFix, validateBlueprintConsistency } = await qualityModule();
  const report = validateBlueprintConsistency(blueprint, documents({
    "PRD.md": "Kepala Desa menetapkan penerima. Flag Perlu Verifikasi digunakan untuk peninjauan. Kontrak kanonis minimum dipakai.",
    "UI-UX.md": "Verifikator meninjau pengajuan.",
  }));
  const repairIds = report.checks.filter((check: QualityCheck) => check.status === "repair").map((check: QualityCheck) => check.id);

  assert.deepEqual(repairIds, [
    "internal-leakage",
    "cross-document-terminology",
    "requirement-schema-coverage",
    "permission-conflict",
    "relationship-integrity",
    "security-feasibility",
  ]);
  assert.equal(report.repairs.length, 6);
  assert.deepEqual(documentsNeedingQualityFix(report), ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"]);
});

test("V2.1 accepts repaired semantic details", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const report = validateBlueprintConsistency(blueprint, documents({
    "PRD.md": "Kepala Desa menetapkan penerima. Flag Perlu Verifikasi digunakan untuk peninjauan dan tersimpan pada application_flags.",
    "TECH-STACK.md": "Semua endpoint berada di bawah /api/v1. | POST | /api/v1/beneficiaries | Kepala Desa | NIK memakai ciphertext AES-256 dan nik_hash HMAC untuk lookup unik.",
    "UI-UX.md": "Tim Verifikasi/BPD meninjau pengajuan.",
    "SCHEMA.md": "application_flags: application_id, type, reason. deliberations: meeting_date. deliberation_decisions: deliberation_id, application_id, decision. nik_ciphertext TEXT. nik_hash TEXT UNIQUE.",
  }));
  const repairChecks = report.checks.filter((check: QualityCheck) => check.status === "repair");

  assert.equal(repairChecks.length, 0);
  assert.equal(report.repairs.length, 0);
});

test("fallback blueprint assumptions never disclose the generation pipeline", async () => {
  const { createFallbackBlueprint } = await qualityModule();
  const fallback = createFallbackBlueprint("Sistem pencatatan bantuan desa");
  const assumptions = fallback.assumptions.join(" ").toLowerCase();

  assert.equal(assumptions.includes("provider"), false);
  assert.equal(assumptions.includes("blueprint"), false);
  assert.equal(assumptions.includes("fallback"), false);
});
