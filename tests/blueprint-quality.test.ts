import assert from "node:assert/strict";
import test from "node:test";

import type { BlueprintContract, QualityCheck, QualityGateReport } from "../lib/blueprint-quality";

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
  apiBasePath: "/api/v1",
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

test("V2.1 distinguishes an unversioned endpoint from an API version mismatch", async () => {
  const { normalizeTechApiEndpointPrefixes, validateBlueprintConsistency } = await qualityModule();
  const mismatchReport = validateBlueprintConsistency(blueprint, documents({
    "TECH-STACK.md": "Semua endpoint berada di bawah /api/v1. | GET | /api/v2/beneficiaries | Kepala Desa | NIK memakai ciphertext AES-256 dan nik_hash HMAC untuk lookup unik.",
  }));
  const mismatchCheck = mismatchReport.checks.find((check: QualityCheck) => check.id === "cross-document-terminology");

  assert.equal(mismatchCheck?.status, "repair");
  assert.match(mismatchCheck?.detail || "", /versi endpoint tidak konsisten dengan prefix \/api\/v1/i);

  const v2Blueprint = { ...blueprint, apiBasePath: "/api/v2" };
  const v2Report = validateBlueprintConsistency(v2Blueprint, documents({
    "TECH-STACK.md": "Semua endpoint berada di bawah /api/v2. | GET | /api/v2/beneficiaries | Kepala Desa | NIK memakai ciphertext AES-256 dan nik_hash HMAC untuk lookup unik.",
  }));
  const v2Check = v2Report.checks.find((check: QualityCheck) => check.id === "cross-document-terminology");

  assert.equal(v2Check?.status, "passed");
  assert.match(
    normalizeTechApiEndpointPrefixes("Semua endpoint berada di bawah /api/v1. GET /api/v2/beneficiaries.", blueprint.apiBasePath),
    /GET \/api\/v1\/beneficiaries/,
  );
});

test("fallback blueprint assumptions never disclose the generation pipeline", async () => {
  const { createFallbackBlueprint } = await qualityModule();
  const fallback = createFallbackBlueprint("Sistem pencatatan bantuan desa");
  const assumptions = fallback.assumptions.join(" ").toLowerCase();

  assert.equal(assumptions.includes("provider"), false);
  assert.equal(assumptions.includes("blueprint"), false);
  assert.equal(assumptions.includes("fallback"), false);
});

test("immutable contract gate catches new roles, lifecycle states, capabilities, and invalid schema references", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const report = validateBlueprintConsistency(blueprint, documents({
    "PRD.md": "Status: DRAFT → DIBATALKAN. Laba kotor ditampilkan pada laporan. Integrasi WhatsApp dipakai untuk pelanggan.",
    "UI-UX.md": "| Role | Akses |\n| --- | --- |\n| Kepala Desa | Kelola |\n| Owner | Lihat semua |\n\nTampilkan barcode pada kasir.",
    "SCHEMA.md": "## Transaksi\n| Kolom | Tipe |\n| --- | --- |\n| cabang_id | UUID |\n\nIndeks: Transaksi(cabang_id, created_at)\nAudit mencakup Produk dan BahanBaku dengan transaksi_id.",
  }));
  const contractCheck = report.checks.find((check: QualityCheck) => check.id === "contract-enforcement");
  const schemaCheck = report.checks.find((check: QualityCheck) => check.id === "schema-reference-integrity");

  assert.equal(contractCheck?.status, "repair");
  assert.match(contractCheck?.detail || "", /ROLE_CONTRACT_CONFLICT/i);
  assert.match(contractCheck?.detail || "", /LIFECYCLE_CONTRACT_CONFLICT/i);
  assert.match(contractCheck?.detail || "", /UNAUTHORIZED_REQUIREMENT_INTRODUCTION/i);
  assert.match(contractCheck?.detail || "", /REQUIREMENT_TO_SCHEMA_COVERAGE/i);
  assert.equal(schemaCheck?.status, "repair");
  assert.match(schemaCheck?.detail || "", /created_at/i);
  assert.match(schemaCheck?.detail || "", /entity_type/i);
});

test("contract gate rejects lifecycle and WhatsApp purpose drift", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const contract = {
    ...blueprint,
    applicationStatuses: [
      { domain: "transaksi", name: "DRAFT" },
      { domain: "transaksi", name: "SELESAI" },
    ],
    integrations: ["WhatsApp untuk laporan harian kepada Owner"],
  } satisfies BlueprintContract;
  const report = validateBlueprintConsistency(contract, documents({
    "PRD.md": "Status SELESAI setelah pembayaran pelanggan.",
    "TECH-STACK.md": "WhatsApp mengirim notifikasi ke customer setiap transaksi selesai.",
    "UI-UX.md": "Dapur memasak pesanan lalu menandai status SELESAI.",
  }));
  const contractCheck = report.checks.find((check: QualityCheck) => check.id === "contract-enforcement");

  assert.equal(contractCheck?.status, "repair");
  assert.match(contractCheck?.detail || "", /LIFECYCLE_SEMANTIC_CONFLICT/i);
  assert.match(contractCheck?.detail || "", /INTEGRATION_PURPOSE_CONFLICT/i);
});

test("fast deterministic fixes normalise endpoint, index, and obvious FK target", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const fixed = applyDeterministicFastFixes(blueprint, documents({
    "TECH-STACK.md": "Endpoint tersedia pada /api/v2/beneficiaries.",
    "SCHEMA.md": "## products\n| Kolom | Tipe |\n| --- | --- |\n| id | UUID |\n\n## transactions\n| Kolom | Tipe |\n| --- | --- |\n| branch_id | UUID |\n\nIndeks: transactions(branch_id, created_at)\nFOREIGN KEY (product_id) REFERENCES products(uuid)",
  }));

  assert.match(fixed.files["TECH-STACK.md"], /\/api\/v1\/beneficiaries/);
  assert.match(fixed.files["SCHEMA.md"], /transactions\(branch_id\)/i);
  assert.match(fixed.files["SCHEMA.md"], /REFERENCES products\(id\)/i);
  assert.ok(fixed.changes.length >= 3);
});

test("user-facing quality notes hide internal validation codes and target the affected documents", async () => {
  const { getUserFacingQualityNotes } = await qualityModule();
  const report = {
    passed: false,
    score: 82,
    failures: [],
    repairs: ["internal"],
    warnings: [],
    checks: [{
      id: "contract-enforcement",
      label: "Kontrak blueprint immutable",
      status: "repair",
      detail: "Kontrak blueprint immutable dilanggar: ROLE_CONTRACT_CONFLICT. Dokumen terdampak: PRD.md, SCHEMA.md.",
    }],
  } satisfies QualityGateReport;

  const [note] = getUserFacingQualityNotes(report);
  assert.equal(note.title, "Ketentuan proyek perlu diselaraskan");
  assert.equal(note.description.includes("ROLE_CONTRACT_CONFLICT"), false);
  assert.deepEqual(note.files, ["PRD.md", "SCHEMA.md"]);
  assert.match(note.repairContext, /ROLE_CONTRACT_CONFLICT/);
});

test("user-facing quality notes exclude warnings that do not need a revision", async () => {
  const { getUserFacingQualityNotes } = await qualityModule();
  const report = {
    passed: false,
    score: 82,
    failures: [],
    repairs: ["needs repair"],
    warnings: ["informative only"],
    checks: [
      {
        id: "entity-consistency",
        label: "Konsistensi entitas",
        status: "warning",
        detail: "Nama entitas perlu ditinjau.",
      },
      {
        id: "contract-enforcement",
        label: "Kontrak blueprint immutable",
        status: "repair",
        detail: "Kontrak blueprint immutable dilanggar: ROLE_CONTRACT_CONFLICT. Dokumen terdampak: PRD.md.",
      },
    ],
  } satisfies QualityGateReport;

  const notes = getUserFacingQualityNotes(report);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.id, "contract-enforcement");
});

test("contract enforcement ignores technical terms and ordinary role prose", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const contract = {
    ...blueprint,
    roles: [{ name: "Admin" }, { name: "Pengguna" }],
    applicationStatuses: [
      { domain: "dokumen", name: "DRAFT" },
      { domain: "dokumen", name: "DALAM_PROSES" },
      { domain: "dokumen", name: "SELESAI" },
    ],
  } satisfies BlueprintContract;
  const report = validateBlueprintConsistency(contract, documents({
    "PRD.md": "Pengguna memakai role sesuai ketentuan permission proyek. Status DRAFT → DALAM_PROSES → SELESAI.",
    "TECH-STACK.md": "PDF diproses oleh worker. Role sesuai ketentuan permission proyek dan lifecycle state sesuai kontrak.",
    "UI-UX.md": "Status DALAM_PROSES menggunakan warna #D97706 dengan kontras WCAG AA.",
    "SCHEMA.md": "| Kolom | Tipe |\n| --- | --- |\n| role | VARCHAR(20) |\n| dibuat_pada | TIMESTAMPTZ |\n\n## Lifecycle\nStatus DRAFT → DALAM_PROSES → SELESAI.\n\nPENGGUNA memicu RIWAYAT_AKTIVITAS dengan aksi UPLOAD_DOKUMEN.",
  }));
  const contractCheck = report.checks.find((check: QualityCheck) => check.id === "contract-enforcement");

  assert.equal(contractCheck?.status, "passed");
});

test("quality gate ignores version-policy references and technical role/status prose", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const contract = {
    ...blueprint,
    roles: [{ name: "Admin Fasilitas" }, { name: "Teknisi" }],
    applicationStatuses: [
      { domain: "tiket", name: "DRAFT" },
      { domain: "tiket", name: "DIJADWALKAN" },
      { domain: "tiket", name: "DIPROSES" },
      { domain: "tiket", name: "SELESAI" },
    ],
  } satisfies BlueprintContract;
  const report = validateBlueprintConsistency(contract, documents({
    "PRD.md": "## Role\n| Role | Akses |\n| --- | --- |\n| Admin Fasilitas | Mengelola |\n| Teknisi | Memperbarui tiket |\n\nTeknisi dapat menandai tiket SELESAI (final).",
    "TECH-STACK.md": "Semua endpoint memakai /api/v1. Perubahan breaking memerlukan /api/v2. Role-based access control (RBAC) melindungi /api/v1/tickets.",
    "UI-UX.md": "CTA memperbarui status DRAFT → DIJADWALKAN → DIPROSES → SELESAI untuk Teknisi. Role: Teknisi hanya melihat Tiket Kerusakan miliknya.",
    "SCHEMA.md": "status ENUM('DRAFT', 'DIJADWALKAN', 'DIPROSES', 'SELESAI'), frequency ENUM('MINGGUAN', 'BULANAN', 'TRIWULANAN', 'TAHUNAN', 'DEFAULT'), actor_role ADMIN_FASILITAS. Transaksi ACID dan RBAC diterapkan.",
  }));

  assert.equal(report.checks.find((check: QualityCheck) => check.id === "cross-document-terminology")?.status, "passed");
  const contractCheck = report.checks.find((check: QualityCheck) => check.id === "contract-enforcement");
  assert.equal(contractCheck?.status, "passed", contractCheck?.detail);
  assert.equal(report.checks.find((check: QualityCheck) => check.id === "permission-conflict")?.status, "passed");
});

// ── Deterministic Surface Fixer Regression Tests ───────────────────────────

test("normalizeSurface: case, trim, whitespace, underscore, hyphen normalization", async () => {
  const mod = await qualityModule();
  const normalizeSurface = (v: string) => mod.normalizeSurface(v);

  // Same surface form → same output
  assert.equal(normalizeSurface("TIM_VERIFIKASI"), normalizeSurface("tim-verifikasi"));
  assert.equal(normalizeSurface("TIM_VERIFIKASI"), normalizeSurface("Tim Verifikasi"));
  assert.equal(normalizeSurface("TIM_VERIFIKASI"), normalizeSurface("tim  verifikasi"));
  assert.equal(normalizeSurface("TIM_VERIFIKASI"), normalizeSurface("Tim  Verifikasi "));

  // Different meaning → different output
  assert.ok(normalizeSurface("Admin Pembayaran") !== normalizeSurface("Admin"));
  assert.ok(normalizeSurface("Status Menunggu Verifikasi") !== normalizeSurface("Status Verifikasi"));
});

test("normalizeCanonicalTerm: exact label match", async () => {
  const mod = await qualityModule();
  const normalizeCanonicalTerm = mod.normalizeCanonicalTerm;
  const terms = [{ label: "Tim Verifikasi" }, { label: "Admin Desa" }];

  assert.equal(normalizeCanonicalTerm("Tim Verifikasi", terms), "Tim Verifikasi");
  assert.equal(mod.normalizeSurface("TIM_VERIFIKASI"), mod.normalizeSurface("Tim Verifikasi"));
});

test("normalizeCanonicalTerm: explicit alias match", async () => {
  const mod = await qualityModule();
  const normalizeCanonicalTerm = mod.normalizeCanonicalTerm;
  const terms = [{ label: "Tim Verifikasi", aliases: ["Verifikator"] }];

  assert.equal(normalizeCanonicalTerm("Verifikator", terms), "Tim Verifikasi");
  // Casing variant of alias also matches
  assert.equal(normalizeCanonicalTerm("verifikator", terms), "Tim Verifikasi");
  assert.equal(normalizeCanonicalTerm("VERIFIKATOR", terms), "Tim Verifikasi");
});

test("normalizeCanonicalTerm: no alias → no replacement (does not guess)", async () => {
  const mod = await qualityModule();
  const normalizeCanonicalTerm = mod.normalizeCanonicalTerm;
  const terms = [{ label: "Tim Verifikasi" }];

  // No alias defined, so "Verifikator" is NOT replaced
  assert.equal(normalizeCanonicalTerm("Verifikator", terms), "Verifikator");
  // Unknown role stays unchanged
  assert.equal(normalizeCanonicalTerm("Owner", terms), "Owner");
});

test("normalizeCanonicalTerm: alias scoped per type", async () => {
  const mod = await qualityModule();
  const normalizeCanonicalTerm = mod.normalizeCanonicalTerm;
  const roleTerms = [{ label: "Tim Verifikasi", aliases: ["Verifikator"] }];
  const statusTerms = [{ label: "PERLU_VERIFIKASI" }];

  // "Verifikator" matches role alias
  assert.equal(normalizeCanonicalTerm("Verifikator", roleTerms), "Tim Verifikasi");
  // "Verifikator" does NOT match status terms (no alias there)
  assert.equal(normalizeCanonicalTerm("Verifikator", statusTerms), "Verifikator");
  // "PERLU_VERIFIKASI" does NOT match role terms
  assert.equal(normalizeCanonicalTerm("PERLU_VERIFIKASI", roleTerms), "PERLU_VERIFIKASI");
});

test("deterministic fixer: exact alias → deterministic replace", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const blueprintWithAlias = {
    ...blueprint,
    roles: [
      { name: "Kepala Desa" },
      { name: "Admin Desa" },
      { name: "Tim Verifikasi/BPD", aliases: ["Verifikator"] },
    ],
  };
  // Role must be explicitly declared (with "role:" prefix) to be extracted
  const fixed = applyDeterministicFastFixes(blueprintWithAlias, documents({
    "UI-UX.md": "| Role | Akses |\n| --- | --- |\n| Verifikator | Meninjau pengajuan |",
  }));

  assert.ok(fixed.files["UI-UX.md"].includes("Tim Verifikasi/BPD"));
  assert.ok(!fixed.files["UI-UX.md"].includes("Verifikator"));
});

test("deterministic fixer: unknown similar role → NOT replaced", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const fixed = applyDeterministicFastFixes(blueprint, documents({
    "UI-UX.md": "Owner mengelola sistem.",
  }));

  // "Owner" is not in blueprint roles and has no alias → stays unchanged
  assert.ok(fixed.files["UI-UX.md"].includes("Owner"));
});

test("deterministic fixer: flag vs status not changed", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const fixed = applyDeterministicFastFixes(blueprint, documents({
    "PRD.md": "Flag Perlu Verifikasi digunakan untuk peninjauan.",
  }));

  // "Flag" should remain "Flag" — deterministic fixer does not change meaning
  assert.ok(fixed.files["PRD.md"].includes("Flag Perlu Verifikasi"));
});

test("deterministic fixer: idempotent fix(fix(doc)) === fix(doc)", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const input = documents({
    "TECH-STACK.md": "Endpoint pada /api/v2/beneficiaries.",
    "UI-UX.md": "Verifikator meninjau pengajuan.",
  });
  const blueprintWithAlias = {
    ...blueprint,
    roles: [
      { name: "Kepala Desa" },
      { name: "Admin Desa" },
      { name: "Tim Verifikasi/BPD", aliases: ["Verifikator"] },
    ],
  };

  const firstFix = applyDeterministicFastFixes(blueprintWithAlias, input);
  const secondFix = applyDeterministicFastFixes(blueprintWithAlias, firstFix.files);

  assert.equal(firstFix.files["PRD.md"], secondFix.files["PRD.md"]);
  assert.equal(firstFix.files["TECH-STACK.md"], secondFix.files["TECH-STACK.md"]);
  assert.equal(firstFix.files["UI-UX.md"], secondFix.files["UI-UX.md"]);
  assert.equal(firstFix.files["SCHEMA.md"], secondFix.files["SCHEMA.md"]);
});

test("deterministic fixer: casing normalised from blueprint, not SCHEMA.md", async () => {
  const { applyDeterministicFastFixes } = await qualityModule();
  const bp = {
    ...blueprint,
    applicationStatuses: [{ domain: "pengajuan", name: "Perlu Verifikasi" }],
  };
  const fixed = applyDeterministicFastFixes(bp, documents({
    "PRD.md": "Status perlu verifikasi aktif.",
    "TECH-STACK.md": "Endpoint berada di bawah /api/v1. PERLU_VERIFIKASI pada UI.",
    "UI-UX.md": "Status PERLU VERIFIKASI ditampilkan.",
    "SCHEMA.md": "Status: perlu verifikasi.",
  }));

  // All should normalise to blueprint canonical form "Perlu Verifikasi"
  assert.ok(fixed.files["PRD.md"].includes("Perlu Verifikasi"));
  assert.ok(fixed.files["UI-UX.md"].includes("Perlu Verifikasi"));
  assert.ok(fixed.files["SCHEMA.md"].includes("Perlu Verifikasi"));
});

test("validateBlueprintContract accepts automated and system actors in lifecycle transitions", async () => {
  const { validateBlueprintContract } = await qualityModule();
  const bpWithSystemActor = {
    version: "1.0",
    projectSummary: "Sistem rental dan manajemen pembayaran.",
    roles: [
      { name: "Penyewa" },
      { name: "Pemilik" },
      { name: "Admin" },
    ],
    entities: [
      { name: "Pemesanan", statuses: ["MENUNGGU_PEMBAYARAN", "DIBAYAR", "SELESAI", "KADALUWARSA"] },
    ],
    applicationStatuses: [
      { domain: "pemesanan", name: "MENUNGGU_PEMBAYARAN" },
      { domain: "pemesanan", name: "DIBAYAR" },
      { domain: "pemesanan", name: "SELESAI" },
      { domain: "pemesanan", name: "KADALUWARSA" },
    ],
    lifecycles: [
      {
        domain: "Pembayaran Sewa",
        statuses: ["MENUNGGU_PEMBAYARAN", "DIBAYAR", "SELESAI", "KADALUWARSA"],
        transitions: [
          { from: "MENUNGGU_PEMBAYARAN", to: "DIBAYAR", actor: "Sistem", condition: "Webhook payment gateway sukses" },
          { from: "MENUNGGU_PEMBAYARAN", to: "KADALUWARSA", actor: "Cron Job", condition: "Batas waktu 24 jam terlewati" },
          { from: "DIBAYAR", to: "SELESAI", actor: "Penyewa" },
        ],
      },
    ],
    permissions: {
      Penyewa: ["buat pemesanan", "bayar sewa"],
      Pemilik: ["kelola properti"],
      Admin: ["kelola semua"],
    },
    features: [
      { name: "Pemesanan dan Pembayaran", phase: "MVP", roles: ["Penyewa"], entities: ["Pemesanan"] },
    ],
  };

  const failures = validateBlueprintContract(bpWithSystemActor);
  assert.deepEqual(failures, []);
});

test("repairIncompleteJson successfully repairs truncated JSON strings", async () => {
  const { repairIncompleteJson, parseBlueprintContract } = await qualityModule();

  // Truncated inside an array of objects
  const truncated1 = `{"projectSummary": "Portal Desa", "roles": [{"name": "Admin", "description": "Mengelola data"}, {"name": "Warga"`;
  const repaired1 = repairIncompleteJson(truncated1);
  assert.ok(repaired1);
  const parsed1 = JSON.parse(repaired1);
  assert.equal(parsed1.projectSummary, "Portal Desa");
  assert.equal(parsed1.roles.length, 2);

  // Truncated at trailing key / string
  const truncated2 = `{"version": "1.0", "projectSummary": "E-Commerce", "roles": [{"name": "User"}], "entities": [{"name": "Item"}], "features": [{"name": "Checkout", "phase": "MVP"}], "assumptions": ["Bisa COD", "Pengiriman grab`;
  const bp = parseBlueprintContract(truncated2);
  assert.equal(bp.projectSummary, "E-Commerce");
  assert.equal(bp.roles[0].name, "User");
  assert.equal(bp.entities[0].name, "Item");
  assert.equal(bp.features[0].name, "Checkout");
});

test("validateBlueprintContract accepts multi-lifecycle domains sharing common status names", async () => {
  const { validateBlueprintContract, parseBlueprintContract } = await qualityModule();
  const raw = JSON.stringify({
    version: "1.0",
    projectSummary: "Sistem logistik dan pembayaran.",
    roles: [{ name: "Buyer" }, { name: "Seller" }],
    entities: [{ name: "Order" }, { name: "Payment" }],
    applicationStatuses: [
      { domain: "order", name: "DRAFT" },
      { domain: "order", name: "PROSES" },
      { domain: "order", name: "SELESAI" },
      { domain: "payment", name: "PENDING" },
      { domain: "payment", name: "SELESAI" },
    ],
    lifecycles: [
      {
        domain: "Order",
        statuses: ["DRAFT", "PROSES", "SELESAI"],
        transitions: [{ from: "DRAFT", to: "PROSES", actor: "Buyer" }, { from: "PROSES", to: "SELESAI", actor: "Seller" }],
      },
      {
        domain: "Payment",
        statuses: ["PENDING", "SELESAI"],
        transitions: [{ from: "PENDING", to: "SELESAI", actor: "Sistem" }],
      },
    ],
    permissions: {
      Buyer: ["create order"],
      Seller: ["fulfill order"],
    },
    features: [{ name: "Order & Pay", phase: "MVP", roles: ["Buyer"], entities: ["Order"] }],
  });

  const parsed = parseBlueprintContract(raw);
  const failures = validateBlueprintContract(parsed);
  assert.deepEqual(failures, []);
});

test("output isolation requires the target H1 and rejects another document title", async () => {
  const {
    documentsNeedingQualityFix,
    validateBlueprintConsistency,
    validateDocumentOutputIsolation,
  } = await qualityModule();

  assert.equal(
    validateDocumentOutputIsolation("TECH-STACK.md", "# TECH-STACK.md\n\n## Stack\nIsi.").valid,
    true,
  );
  assert.equal(
    validateDocumentOutputIsolation("TECH-STACK.md", "# PRD.md\n\n## Stack\nIsi.").valid,
    false,
  );
  assert.equal(
    validateDocumentOutputIsolation("TECH-STACK.md", "# TECH-STACK.md\n\n# SCHEMA.md\n\nIsi.").valid,
    false,
  );

  const report = validateBlueprintConsistency(blueprint, documents({
    "PRD.md": "# PRD.md\n\nRingkasan produk.",
    "TECH-STACK.md": "# TECH-STACK.md\n\n# UI-UX.md\n\nArsitektur dan endpoint /api/v1/beneficiaries.",
    "UI-UX.md": "# UI-UX.md\n\nWireframe produk.",
    "SCHEMA.md": "# SCHEMA.md\n\nEntitas produk.",
  }));
  const isolation = report.checks.find((check: QualityCheck) => check.id === "document-output-isolation");

  assert.equal(isolation?.status, "failed");
  assert.deepEqual(documentsNeedingQualityFix({ ...report, checks: [isolation!] }), ["TECH-STACK.md"]);
});

test("auth and stream coherence catches only explicit incompatible designs", async () => {
  const { validateBlueprintConsistency } = await qualityModule();
  const report = validateBlueprintConsistency(blueprint, documents({
    "TECH-STACK.md": "EventSource membuka SSE dengan Authorization: Bearer JWT. Auth memakai JWT stateless tanpa penyimpanan sesi.",
    "SCHEMA.md": "## sessions\nsession_token TEXT NOT NULL.",
  }));
  const check = report.checks.find((item: QualityCheck) => item.id === "auth-streaming-coherence");

  assert.equal(check?.status, "repair");
  assert.match(check?.detail || "", /EventSource/i);
  assert.match(check?.detail || "", /stateless/i);
});
