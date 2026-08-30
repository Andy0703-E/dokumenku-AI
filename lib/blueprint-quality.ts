import type { FileName, GeneratedFiles } from "./types";

export type BlueprintPhase = "MVP" | "V1" | "FUTURE";

export type BlueprintRole = {
  id?: string;
  name: string;
  description?: string;
};

export type BlueprintEntity = {
  name: string;
  description?: string;
  statuses?: string[];
};

export type BlueprintStatus = {
  domain: string;
  name: string;
  description?: string;
};

export type BlueprintFeature = {
  id?: string;
  name: string;
  phase: BlueprintPhase;
  roles?: string[];
  entities?: string[];
};

export type BlueprintContract = {
  version: "1.0" | string;
  projectSummary: string;
  roles: BlueprintRole[];
  entities: BlueprintEntity[];
  applicationStatuses: BlueprintStatus[];
  permissions: Record<string, string[]>;
  features: BlueprintFeature[];
  integrations: string[];
  deployment: Record<string, string | string[]>;
  securityRequirements: string[];
  designTokens: Record<string, string>;
  assumptions: string[];
  openQuestions: string[];
  versionPolicy?: string[];
  complianceRequirements?: string[];
};

export type QualityCheckStatus = "passed" | "warning" | "repair" | "failed";

export type QualityCheck = {
  id: string;
  label: string;
  status: QualityCheckStatus;
  detail: string;
};

export type QualityGateReport = {
  passed: boolean;
  score: number;
  checks: QualityCheck[];
  failures: string[];
  repairs: string[];
  warnings: string[];
};

const DOCUMENT_LABELS: Record<FileName, string> = {
  "PRD.md": "PRD",
  "TECH-STACK.md": "Technical Architecture",
  "UI-UX.md": "UI/UX",
  "SCHEMA.md": "Schema",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};

  return Object.fromEntries(
    Object.entries(record)
      .filter(([, item]) => typeof item === "string" && item.trim())
      .map(([key, item]) => [key.trim(), (item as string).trim()]),
  );
}

function asStringOrArrayRecord(value: unknown): Record<string, string | string[]> {
  const record = asRecord(value);
  if (!record) return {};

  return Object.fromEntries(
    Object.entries(record)
      .map(([key, item]) => [key.trim(), Array.isArray(item) ? asStringArray(item) : asString(item)])
      .filter(([, item]) => Array.isArray(item) ? item.length > 0 : Boolean(item)),
  );
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("id-ID")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueNames(values: string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const item = normalize(value);
    if (!item || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  if (start < 0) throw new Error("Kontrak blueprint tidak berformat JSON.");

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }
  throw new Error("Kontrak blueprint JSON belum lengkap.");
}

export function parseBlueprintContract(raw: string): BlueprintContract {
  const parsed = JSON.parse(extractJsonObject(raw)) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error("Kontrak blueprint harus berupa objek JSON.");

  const roles = Array.isArray(root.roles)
    ? root.roles.map((item) => {
        if (typeof item === "string") return { name: item.trim() };
        const role = asRecord(item) || {};
        return { id: asString(role.id), name: asString(role.name), description: asString(role.description) };
      }).filter((role) => role.name)
    : [];
  const entities = Array.isArray(root.entities)
    ? root.entities.map((item) => {
        if (typeof item === "string") return { name: item.trim() };
        const entity = asRecord(item) || {};
        return {
          name: asString(entity.name),
          description: asString(entity.description),
          statuses: asStringArray(entity.statuses),
        };
      }).filter((entity) => entity.name)
    : [];
  const applicationStatuses = Array.isArray(root.applicationStatuses)
    ? root.applicationStatuses.map((item) => {
        if (typeof item === "string") return { domain: "aplikasi", name: item.trim() };
        const status = asRecord(item) || {};
        return {
          domain: asString(status.domain),
          name: asString(status.name),
          description: asString(status.description),
        };
      }).filter((status) => status.name)
    : [];
  const rawFeatures = Array.isArray(root.features)
    ? root.features.map((item) => {
        if (typeof item === "string") return { name: item.trim(), phase: "MVP" as BlueprintPhase };
        const feature = asRecord(item) || {};
        const phase = asString(feature.phase).toUpperCase();
        return {
          id: asString(feature.id),
          name: asString(feature.name),
          phase: (["MVP", "V1", "FUTURE"].includes(phase) ? phase : "MVP") as BlueprintPhase,
          roles: asStringArray(feature.roles),
          entities: asStringArray(feature.entities),
        };
      }).filter((feature) => feature.name)
    : [];

  const rawPermissions = asRecord(root.permissions) || {};
  const roleByReference = new Map<string, string>();
  for (const role of roles) {
    roleByReference.set(normalize(role.name), role.name);
    if (role.id) roleByReference.set(normalize(role.id), role.name);
  }
  const entityByReference = new Map<string, string>();
  for (const entity of entities) entityByReference.set(normalize(entity.name), entity.name);

  const permissions = Object.fromEntries(
    Object.entries(rawPermissions)
      .map(([role, value]) => [roleByReference.get(normalize(role)), asStringArray(value)] as const)
      .filter(([role]) => Boolean(role)),
  );
  const features = rawFeatures.map((feature) => ({
    ...feature,
    roles: (feature.roles || []).map((role) => roleByReference.get(normalize(role))).filter(Boolean) as string[],
    entities: (feature.entities || []).map((entity) => entityByReference.get(normalize(entity))).filter(Boolean) as string[],
  }));

  return {
    version: asString(root.version) || "1.0",
    projectSummary: asString(root.projectSummary) || asString(root.project_summary) || asString(root.summary),
    roles,
    entities,
    applicationStatuses,
    permissions,
    features,
    integrations: asStringArray(root.integrations),
    deployment: asStringOrArrayRecord(root.deployment),
    securityRequirements: asStringArray(root.securityRequirements),
    designTokens: asStringRecord(root.designTokens),
    assumptions: asStringArray(root.assumptions),
    openQuestions: asStringArray(root.openQuestions),
    versionPolicy: asStringArray(root.versionPolicy),
    complianceRequirements: asStringArray(root.complianceRequirements),
  };
}

export function validateBlueprintContract(blueprint: BlueprintContract): string[] {
  const failures: string[] = [];
  if (!blueprint.projectSummary) failures.push("Ringkasan proyek belum ada.");
  if (!blueprint.roles.length || blueprint.roles.some((role) => !role.name)) failures.push("Minimal satu role dengan nama wajib ada.");
  if (!blueprint.entities.length || blueprint.entities.some((entity) => !entity.name)) failures.push("Minimal satu entitas data dengan nama wajib ada.");
  if (!blueprint.features.length || blueprint.features.some((feature) => !feature.name)) failures.push("Minimal satu fitur dengan nama wajib ada.");
  if (!uniqueNames(blueprint.roles.map((role) => role.name))) failures.push("Nama role harus unik.");
  if (!uniqueNames(blueprint.entities.map((entity) => entity.name))) failures.push("Nama entitas harus unik.");
  if (!uniqueNames(blueprint.applicationStatuses.map((status) => status.name))) failures.push("Nama status lifecycle harus unik.");

  const roleNames = new Set(blueprint.roles.map((role) => normalize(role.name)));
  const entityNames = new Set(blueprint.entities.map((entity) => normalize(entity.name)));
  for (const role of Object.keys(blueprint.permissions)) {
    if (!roleNames.has(normalize(role))) failures.push(`Permissions menggunakan role yang tidak ada: ${role}.`);
  }
  for (const feature of blueprint.features) {
    for (const role of feature.roles || []) {
      if (!roleNames.has(normalize(role))) failures.push(`Fitur ${feature.name} merujuk role yang tidak ada: ${role}.`);
    }
    for (const entity of feature.entities || []) {
      if (!entityNames.has(normalize(entity))) failures.push(`Fitur ${feature.name} merujuk entitas yang tidak ada: ${entity}.`);
    }
  }
  return failures;
}

export function createFallbackBlueprint(brief: string): BlueprintContract {
  const summary = brief.replace(/\s+/g, " ").trim().slice(0, 900) || "Produk digital sesuai brief pengguna.";
  const roles: BlueprintRole[] = [
    { id: "admin", name: "Admin", description: "Mengelola konfigurasi, data, dan proses utama." },
    { id: "pengguna", name: "Pengguna", description: "Mengakses layanan dan mengikuti alur utama produk." },
  ];
  const entities: BlueprintEntity[] = [
    { name: "Pengguna", description: "Akun dan profil pihak yang menggunakan sistem." },
    { name: "Data Utama", description: "Rekaman inti yang dikelola sesuai kebutuhan proyek." },
    { name: "Riwayat Aktivitas", description: "Jejak tindakan dan perubahan penting dalam sistem." },
  ];

  return {
    version: "1.0",
    projectSummary: summary,
    roles,
    entities,
    applicationStatuses: [
      { domain: "proses utama", name: "DRAFT" },
      { domain: "proses utama", name: "DALAM_PROSES" },
      { domain: "proses utama", name: "SELESAI" },
    ],
    permissions: {
      Admin: ["kelola data utama", "kelola pengguna", "lihat riwayat aktivitas"],
      Pengguna: ["buat dan lihat data miliknya", "ikuti proses utama"],
    },
    features: [
      {
        id: "mvp-proses-utama",
        name: "Pengelolaan proses utama",
        phase: "MVP",
        roles: ["Admin", "Pengguna"],
        entities: ["Pengguna", "Data Utama", "Riwayat Aktivitas"],
      },
      {
        id: "v1-pelacakan",
        name: "Pelacakan status dan riwayat",
        phase: "V1",
        roles: ["Admin", "Pengguna"],
        entities: ["Data Utama", "Riwayat Aktivitas"],
      },
      {
        id: "future-otomasi",
        name: "Otomasi lanjutan",
        phase: "FUTURE",
        roles: ["Admin"],
        entities: ["Data Utama"],
      },
    ],
    integrations: [],
    deployment: {},
    securityRequirements: ["Autentikasi, otorisasi berbasis role, dan audit perubahan data."],
    designTokens: {},
    assumptions: ["Detail yang belum disebutkan pada brief diperlakukan sebagai asumsi yang perlu dikonfirmasi bersama pemilik produk."],
    openQuestions: [],
    versionPolicy: [],
    complianceRequirements: [],
  };
}

function documentContains(document: string, term: string): boolean {
  const normalizedDocument = normalize(document);
  const normalizedTerm = normalize(term);
  return Boolean(normalizedTerm) && normalizedDocument.includes(normalizedTerm);
}

function schemaContainsEntity(schema: string, entityName: string): boolean {
  if (documentContains(schema, entityName)) return true;

  return normalize(entityName)
    .split(/\s+/)
    .some((word) => word.length >= 3 && documentContains(schema, word));
}

function hasAllTerms(document: string, terms: string[]): boolean {
  return terms.some((term) => documentContains(document, term));
}

function addCheck(checks: QualityCheck[], id: string, label: string, status: QualityCheckStatus, detail: string) {
  checks.push({ id, label, status, detail });
}

type SemanticIssue = {
  detail: string;
  files: FileName[];
};

const INTERNAL_LEAKAGE_TERMS = [
  "kontrak kanonis",
  "canonical contract",
  "provider tidak mengirim",
  "blueprint json",
  "fallback blueprint",
  "recovery json",
  "routing model",
  "model fallback",
];

const VERIFICATION_TERM = /(?:perlu[_\s-]*verifikasi|needs[_\s-]*verification)/i;
const FINAL_DECISION_TERM = /\b(?:final\s*(?:approve|approval|persetujuan|keputusan|reject)?|menetapkan(?:\s+penerima)?|keputusan\s+(?:final|akhir)|(?:approve|reject|setujui|tolak)(?:\s+(?:final|penerima))?)\b/i;

function uniqueFiles(files: Iterable<FileName>): FileName[] {
  return [...new Set(files)];
}

function issueFilesDetail(files: FileName[]): string {
  return files.join(", ");
}

function linesOf(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findInternalLeakage(files: GeneratedFiles): SemanticIssue | null {
  const findings: Array<{ file: FileName; terms: string[] }> = [];
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    const terms = INTERNAL_LEAKAGE_TERMS.filter((term) => documentContains(files[file], term));
    if (/\bkontrak\s*:\s*(?:admin|pengguna)\b/i.test(files[file])) terms.push("label kontrak internal");
    if (terms.length) findings.push({ file, terms });
  }
  if (!findings.length) return null;

  const affectedFiles = findings.map((finding) => finding.file);
  return {
    files: affectedFiles,
    detail: `Istilah pipeline internal muncul di ${findings.map((finding) => `${finding.file} (${finding.terms.join(", ")})`).join("; ")}. Hapus atau tulis ulang hanya bagian tersebut untuk pengguna akhir.`,
  };
}

function usesVerificationTermAs(text: string, category: "flag" | "status"): boolean {
  const categoryPattern = category === "flag" ? /\b(?:flag|menandai|penanda)\b/i : /\bstatus\b/i;
  return linesOf(text).some((line) => VERIFICATION_TERM.test(line) && categoryPattern.test(line));
}

function findTerminologyConflict(blueprint: BlueprintContract, files: GeneratedFiles): SemanticIssue | null {
  const issues: string[] = [];
  const affected = new Set<FileName>();
  const productFiles: FileName[] = ["PRD.md", "UI-UX.md"];
  const flagFiles = productFiles.filter((file) => usesVerificationTermAs(files[file], "flag"));
  const statusFiles = (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) => usesVerificationTermAs(files[file], "status"));
  if (flagFiles.length && statusFiles.length) {
    issues.push('"Perlu Verifikasi" diperlakukan sebagai flag dan status sekaligus');
    flagFiles.forEach((file) => affected.add(file));
    statusFiles.forEach((file) => affected.add(file));
  }

  const tech = files["TECH-STACK.md"];
  const declaresVersionedApi = /(?:semua|seluruh)[^.\n]{0,90}endpoint[^.\n]{0,90}\/api\/v1|endpoint[^.\n]{0,90}\bdi bawah\s+\/api\/v1/i.test(tech);
  const unversionedEndpoints = tech.match(/\/api\/(?!v1(?:\/|\b))[a-z0-9_/-]+/gi) || [];
  if (declaresVersionedApi && unversionedEndpoints.length) {
    issues.push(`endpoint tanpa /v1 ditemukan (${[...new Set(unversionedEndpoints)].slice(0, 3).join(", ")})`);
    affected.add("TECH-STACK.md");
  }

  const officialVerificationRole = blueprint.roles.find((role) => /(?:tim\s+verifikasi|\bbpd\b)/i.test(normalize(role.name)));
  if (officialVerificationRole && normalize(officialVerificationRole.name) !== "verifikator") {
    const verifierFiles = (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) => documentContains(files[file], "Verifikator"));
    if (verifierFiles.length) {
      issues.push(`role "Verifikator" berbeda dengan role kanonis "${officialVerificationRole.name}"`);
      verifierFiles.forEach((file) => affected.add(file));
    }
  }

  if (!issues.length) return null;
  return {
    files: uniqueFiles(affected),
    detail: `Terminologi lintas dokumen belum seragam: ${issues.join("; ")}. Dokumen terdampak: ${issueFilesDetail(uniqueFiles(affected))}.`,
  };
}

function findRequirementSchemaCoverageIssue(files: GeneratedFiles): SemanticIssue | null {
  const productFiles: FileName[] = ["PRD.md", "UI-UX.md"];
  const requiresVerificationFlag = productFiles.some((file) => usesVerificationTermAs(files[file], "flag"));
  const schema = files["SCHEMA.md"];
  const hasVerificationStorage = /(?:application[_\s-]*flags?|verification[_\s-]*flags?|needs[_\s-]*verification|verification[_\s-]*flag)/i.test(schema);
  const issues: string[] = [];
  const affected = new Set<FileName>();
  if (requiresVerificationFlag && !hasVerificationStorage) {
    issues.push('flag "Perlu Verifikasi" belum memiliki penyimpanan data');
    productFiles.filter((file) => usesVerificationTermAs(files[file], "flag")).forEach((file) => affected.add(file));
    affected.add("SCHEMA.md");
  }

  const schemaLower = schema.toLocaleLowerCase("id-ID");
  const incomeSourceCount = ["citizen", "economic_profile", "survey"]
    .filter((source) => schemaLower.includes(source)).length;
  const hasIncomeRule = /(?:source of truth|sumber kebenaran|prioritas|precedence|urutan)[\s\S]{0,120}(?:scoring|penilaian|pendapatan|income)|(?:scoring|penilaian)[\s\S]{0,120}(?:source of truth|sumber kebenaran|prioritas|precedence|urutan)/i.test(`${files["PRD.md"]}\n${schema}`);
  if (incomeSourceCount === 3 && /(?:income|pendapatan)/i.test(schema) && !hasIncomeRule) {
    issues.push("beberapa sumber pendapatan belum memiliki aturan source-of-truth untuk scoring");
    affected.add("PRD.md");
    affected.add("SCHEMA.md");
  }

  if (!issues.length) return null;
  return {
    files: uniqueFiles(affected),
    detail: `Kebutuhan produk belum sepenuhnya tercakup di schema: ${issues.join("; ")}. Dokumen terdampak: ${issueFilesDetail(uniqueFiles(affected))}.`,
  };
}

function roleAllowsFinalDecision(text: string, role: string): boolean {
  return linesOf(text).some((line) => {
    if (!documentContains(line, role) || !FINAL_DECISION_TERM.test(line)) return false;
    return !/\b(?:tidak|tanpa|dilarang|bukan)\b[^.\n]{0,60}(?:keputusan|approve|approval|persetujuan|menetapkan|setujui|tolak|reject)/i.test(line);
  });
}

function findPermissionConflict(blueprint: BlueprintContract, files: GeneratedFiles): SemanticIssue | null {
  const prdApprovers = blueprint.roles
    .filter((role) => roleAllowsFinalDecision(files["PRD.md"], role.name))
    .map((role) => role.name);
  if (!prdApprovers.length) return null;

  const issues: string[] = [];
  const affected = new Set<FileName>(["PRD.md"]);
  if (prdApprovers.length > 1) {
    issues.push(`PRD memberi keputusan final kepada lebih dari satu role (${prdApprovers.join(", ")})`);
  }

  const expectedApprover = prdApprovers[0];
  for (const file of ["TECH-STACK.md", "UI-UX.md", "SCHEMA.md"] as FileName[]) {
    const otherApprovers = blueprint.roles
      .filter((role) => role.name !== expectedApprover && roleAllowsFinalDecision(files[file], role.name))
      .map((role) => role.name);
    if (otherApprovers.length) {
      issues.push(`${file} memberi keputusan final kepada ${otherApprovers.join(", ")}, bukan ${expectedApprover}`);
      affected.add(file);
    }
  }

  const writeRecipientEndpoints = linesOf(files["TECH-STACK.md"])
    .filter((line) => /\/api(?:\/v\d+)?\/(?:beneficiaries|beneficiary|penerima|penetapan)/i.test(line) && /\b(?:POST|PUT|PATCH|DELETE)\b/i.test(line));
  for (const line of writeRecipientEndpoints) {
    const conflictingRoles = blueprint.roles
      .filter((role) => role.name !== expectedApprover && documentContains(line, role.name))
      .map((role) => role.name);
    if (conflictingRoles.length) {
      issues.push(`endpoint penetapan penerima memberi akses tulis kepada ${conflictingRoles.join(", ")}, bukan hanya ${expectedApprover}`);
      affected.add("TECH-STACK.md");
    }
  }

  if (!issues.length) return null;
  return {
    files: uniqueFiles(affected),
    detail: `Separation of duties belum konsisten: ${issues.join("; ")}. Dokumen terdampak: ${issueFilesDetail(uniqueFiles(affected))}.`,
  };
}

function findRelationshipIntegrityIssue(files: GeneratedFiles): SemanticIssue | null {
  const schema = files["SCHEMA.md"];
  const storesDeliberationDecision = /\bdeliberations?\b/i.test(schema) && /\bdecision\b|\bkeputusan\b/i.test(schema);
  const linksDecisionToApplication = /\bapplication_id\b|\bdeliberation_decisions?\b/i.test(schema);
  if (!storesDeliberationDecision || linksDecisionToApplication) return null;

  return {
    files: ["SCHEMA.md"],
    detail: "Relasi keputusan musyawarah belum terhubung ke pengajuan. Gunakan application_id pada keputusan atau tabel keputusan terpisah agar satu musyawarah dapat menetapkan banyak pengajuan.",
  };
}

function findSecurityFeasibilityIssue(files: GeneratedFiles): SemanticIssue | null {
  const securityDocuments = `${files["TECH-STACK.md"]}\n${files["SCHEMA.md"]}`;
  const mentionsEncryptedIdentity = /(?:nik|no\.?\s*kk|nomor\s*kk|\bkk\b)[\s\S]{0,120}(?:encrypt|aes[-\s]?256|ciphertext)|(?:encrypt|aes[-\s]?256|ciphertext)[\s\S]{0,120}(?:nik|no\.?\s*kk|nomor\s*kk|\bkk\b)/i.test(securityDocuments);
  const uniqueEncryptedIdentity = /(?:unique[^\n]{0,100}(?:nik|no\.?\s*kk|nomor\s*kk|\bkk\b)|(?:nik|no\.?\s*kk|nomor\s*kk|\bkk\b)[^\n]{0,100}unique)/i.test(files["SCHEMA.md"]);
  const hasLookupHash = /(?:nik|no\.?\s*kk|nomor\s*kk|\bkk\b)[_\s-]*(?:hash|hmac|lookup(?:[_\s-]*token)?|token)/i.test(files["SCHEMA.md"]);
  if (!mentionsEncryptedIdentity || !uniqueEncryptedIdentity || hasLookupHash) return null;

  return {
    files: ["TECH-STACK.md", "SCHEMA.md"],
    detail: "NIK/KK terenkripsi dipakai sebagai nilai UNIQUE tanpa lookup hash. Gunakan ciphertext untuk kerahasiaan dan token hash/HMAC terpisah untuk pencarian serta UNIQUE.",
  };
}

function addRepairCheck(checks: QualityCheck[], id: string, label: string, issue: SemanticIssue | null, successDetail: string) {
  addCheck(checks, id, label, issue ? "repair" : "passed", issue?.detail || successDetail);
}

export function validateBlueprintConsistency(
  blueprint: BlueprintContract,
  files: GeneratedFiles,
): QualityGateReport {
  const checks: QualityCheck[] = [];
  const contractFailures = validateBlueprintContract(blueprint);
  addCheck(
    checks,
    "blueprint-contract",
    "Kontrak kanonis valid",
    contractFailures.length ? "failed" : "passed",
    contractFailures.length ? contractFailures.join(" ") : "Role, entitas, lifecycle, dan referensi fitur konsisten di kontrak.",
  );

  const missingDocuments = (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) => files[file].trim().length < 600);
  addCheck(
    checks,
    "four-documents",
    "Empat dokumen tersedia",
    missingDocuments.length ? "failed" : "passed",
    missingDocuments.length ? `Dokumen belum cukup lengkap: ${missingDocuments.join(", ")}.` : "PRD, TECH-STACK, UI-UX, dan SCHEMA tersedia.",
  );

  const roleMissing = blueprint.roles.filter((role) =>
    !documentContains(files["PRD.md"], role.name) || !documentContains(files["UI-UX.md"], role.name),
  );
  addCheck(
    checks,
    "role-consistency",
    "Role lintas dokumen",
    roleMissing.length ? "warning" : "passed",
    roleMissing.length ? `Role belum tampak pada PRD dan UI/UX: ${roleMissing.map((role) => role.name).join(", ")}.` : "Seluruh role kontrak muncul pada PRD dan UI/UX.",
  );

  // Entity consistency accepts an exact entity name or any significant (3+ character) name word.
  const entityMissing = blueprint.entities.filter((entity) => !schemaContainsEntity(files["SCHEMA.md"], entity.name));
  addCheck(
    checks,
    "entity-consistency",
    "Entitas ada di schema",
    entityMissing.length ? "warning" : "passed",
    entityMissing.length ? `Entitas mungkin belum terdefinisi pada schema: ${entityMissing.map((entity) => entity.name).join(", ")}. Pastikan nama entitas di SCHEMA konsisten dengan blueprint.` : "Seluruh entitas kontrak muncul pada schema.",
  );

  const statusMissing = blueprint.applicationStatuses.filter((status) =>
    !documentContains(files["SCHEMA.md"], status.name) && !documentContains(files["PRD.md"], status.name),
  );
  addCheck(
    checks,
    "lifecycle-consistency",
    "Lifecycle status seragam",
    statusMissing.length ? "failed" : "passed",
    statusMissing.length ? `Status belum tercermin pada PRD atau schema: ${statusMissing.map((status) => status.name).join(", ")}.` : "Seluruh status lifecycle kontrak tercermin pada dokumen.",
  );

  const featureMissing = blueprint.features.filter((feature) => !documentContains(files["PRD.md"], feature.name));
  addCheck(
    checks,
    "feature-consistency",
    "Fitur berasal dari kontrak",
    featureMissing.length ? "warning" : "passed",
    featureMissing.length ? `Fitur belum jelas pada PRD: ${featureMissing.map((feature) => feature.name).join(", ")}.` : "Seluruh fitur kontrak dijabarkan di PRD.",
  );

  addCheck(
    checks,
    "prd-roadmap",
    "Prioritas MVP / V1 / Future",
    hasAllTerms(files["PRD.md"], ["MVP"]) && hasAllTerms(files["PRD.md"], ["V1", "Future", "Mendatang"])
      ? "passed"
      : "failed",
    "PRD wajib memisahkan ruang lingkup MVP, V1, dan Future.",
  );
  addCheck(
    checks,
    "tech-compatibility",
    "Kompatibilitas arsitektur dan versi",
    hasAllTerms(files["TECH-STACK.md"], ["Kompatibilitas", "Compatibility"]) && hasAllTerms(files["TECH-STACK.md"], ["Version Policy", "Kebijakan Versi"])
      ? "passed"
      : "failed",
    "Technical Architecture wajib memuat compatibility check dan version policy.",
  );
  addCheck(
    checks,
    "ui-wireframes",
    "Wireframe tekstual desktop dan mobile",
    hasAllTerms(files["UI-UX.md"], ["Wireframe"]) && hasAllTerms(files["UI-UX.md"], ["Desktop"]) && hasAllTerms(files["UI-UX.md"], ["Mobile"])
      ? "passed"
      : "failed",
    "UI/UX wajib berisi wireframe tekstual untuk desktop dan mobile.",
  );
  addCheck(
    checks,
    "schema-executable",
    "Schema executable",
    /erDiagram/i.test(files["SCHEMA.md"]) && hasAllTerms(files["SCHEMA.md"], ["Constraint", "Kendala", "UNIQUE", "FOREIGN KEY"])
      ? "passed"
      : "failed",
    "Schema wajib memuat ERD Mermaid dan constraint data yang eksplisit.",
  );
  addCheck(
    checks,
    "risk-security-compliance",
    "Security dan compliance berbasis risiko",
    hasAllTerms(files["TECH-STACK.md"], ["Risiko", "Risk"]) && hasAllTerms(files["TECH-STACK.md"], ["Keamanan", "Security"])
      ? "passed"
      : "warning",
    "Tech spec sebaiknya memetakan risiko keamanan dan compliance yang relevan dengan domain.",
  );

  // ── Phase 3.5: Cross-file checks ──────────────────────────────────────

  // Document completeness (truncation, required sections)
  const completenessFailures: string[] = [];
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    const content = files[file].trim();
    if (content.length < 600) continue; // Already caught by four-documents check
    const check = validateDocumentCompleteness(file, content);
    if (!check.valid) {
      completenessFailures.push(check.detail);
    }
  }
  addCheck(
    checks,
    "document-completeness",
    "Dokumen lengkap & tidak terpotong",
    completenessFailures.length ? "failed" : "passed",
    completenessFailures.length
      ? completenessFailures.join(" ")
      : "Seluruh dokumen lengkap, tidak terpotong, dan memiliki section wajib.",
  );

  // Cross-file status consistency
  const statusCheck = validateCrossFileStatuses(blueprint, files);
  if (!statusCheck.valid) {
    const issues: string[] = [];
    if (statusCheck.orphaned.length) {
      issues.push(`Status disebutkan di PRD/UI-UX tapi tidak ada di blueprint atau schema: ${statusCheck.orphaned.join(", ")}.`);
    }
    if (statusCheck.missing.length) {
      issues.push(`Status di blueprint tidak ditemukan di dokumen manapun: ${statusCheck.missing.join(", ")}.`);
    }
    addCheck(checks, "cross-file-status", "Status konsisten lintas dokumen", "failed", issues.join(" "));
  } else {
    addCheck(checks, "cross-file-status", "Status konsisten lintas dokumen", "passed", "Seluruh status lifecycle konsisten antara blueprint, PRD, UI/UX, dan schema.");
  }

  // Cross-file role consistency
  const roleCheck = validateCrossFileRoles(blueprint, files);
  addCheck(
    checks,
    "cross-file-roles",
    "Role & permission konsisten",
    roleCheck.valid ? "passed" : "warning",
    roleCheck.valid
      ? "Role dan permission konsisten antara PRD, UI/UX, dan schema."
      : roleCheck.conflicts.join(" "),
  );

  // ── Quality Gate V2.1: targeted semantic consistency checks ───────────
  addRepairCheck(
    checks,
    "internal-leakage",
    "Tidak ada kebocoran pipeline internal",
    findInternalLeakage(files),
    "Dokumen hanya memuat requirement dan asumsi produk pengguna.",
  );
  addRepairCheck(
    checks,
    "cross-document-terminology",
    "Terminologi lintas dokumen seragam",
    findTerminologyConflict(blueprint, files),
    "Role, flag/status, dan endpoint menggunakan istilah yang konsisten.",
  );
  addRepairCheck(
    checks,
    "requirement-schema-coverage",
    "Kebutuhan memiliki representasi data",
    findRequirementSchemaCoverageIssue(files),
    "Flag, state, dan aturan data penting memiliki representasi yang eksplisit pada schema.",
  );
  addRepairCheck(
    checks,
    "permission-conflict",
    "Separation of duties konsisten",
    findPermissionConflict(blueprint, files),
    "Role pemberi keputusan final konsisten pada PRD, tech spec, UI/UX, dan schema.",
  );
  addRepairCheck(
    checks,
    "relationship-integrity",
    "Relasi data memenuhi kebutuhan bisnis",
    findRelationshipIntegrityIssue(files),
    "Relasi keputusan dan entitas bisnis utama dapat menyimpan kebutuhan one-to-many yang disebutkan.",
  );
  addRepairCheck(
    checks,
    "security-feasibility",
    "Kontrol keamanan dapat diimplementasikan",
    findSecurityFeasibilityIssue(files),
    "Enkripsi, lookup unik, autentikasi, audit, dan privasi tidak saling bertentangan.",
  );

  const failures = checks.filter((check) => check.status === "failed").map((check) => check.detail);
  const repairs = checks.filter((check) => check.status === "repair").map((check) => check.detail);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => check.detail);
  const passedChecks = checks.filter((check) => check.status === "passed").length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return { passed: failures.length === 0 && repairs.length === 0, score, checks, failures, repairs, warnings };
}

export function qualityGateMessage(report: QualityGateReport): string {
  if (report.passed) return `Blueprint Quality Gate V2.1 lulus (${report.score}% kualitas).`;
  if (report.failures.length) return `Blueprint Quality Gate V2.1 menemukan ${report.failures.length} hal yang perlu diperbaiki: ${report.failures[0]}`;
  return `Blueprint Quality Gate V2.1 membutuhkan perbaikan otomatis: ${report.repairs[0]}`;
}

export function documentsNeedingQualityFix(report: QualityGateReport): FileName[] {
  const files = new Set<FileName>();
  for (const check of report.checks.filter((item) => item.status === "failed" || item.status === "repair")) {
    if (check.id === "four-documents") {
      (Object.keys(DOCUMENT_LABELS) as FileName[]).forEach((file) => files.add(file));
    }
    if (check.id === "entity-consistency" || check.id === "schema-executable") files.add("SCHEMA.md");
    if (check.id === "lifecycle-consistency") {
      files.add("PRD.md");
      files.add("SCHEMA.md");
    }
    if (check.id === "prd-roadmap" || check.id === "feature-consistency") files.add("PRD.md");
    if (check.id === "tech-compatibility") files.add("TECH-STACK.md");
    if (check.id === "ui-wireframes" || check.id === "role-consistency") files.add("UI-UX.md");
    if (check.id === "document-completeness") {
      // Determine which files are truncated/short from the detail
      for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
        if (check.detail.includes(file)) files.add(file);
      }
    }
    if (check.id === "cross-file-status") {
      files.add("PRD.md");
      files.add("UI-UX.md");
      files.add("SCHEMA.md");
    }
    if (["internal-leakage", "cross-document-terminology", "requirement-schema-coverage", "permission-conflict"].includes(check.id)) {
      for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
        if (check.detail.includes(file)) files.add(file);
      }
    }
    if (check.id === "relationship-integrity") files.add("SCHEMA.md");
    if (check.id === "security-feasibility") {
      files.add("TECH-STACK.md");
      files.add("SCHEMA.md");
    }
  }
  return DOCUMENTS_ORDER.filter((file) => files.has(file));
}

const DOCUMENTS_ORDER: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];

// ─── Document Completeness & Truncation Detection ────────────────────────

const REQUIRED_SECTIONS: Record<FileName, string[]> = {
  "PRD.md": [
    "Ringkasan", "Tujuan", "Role", "Fitur", "MVP", "Scope",
    "Lifecycle", "Kriteria Penerimaan", "Assumption",
  ],
  "TECH-STACK.md": [
    "Stack", "Arsitektur", "Compatibility", "Version Policy",
    "API", "Security", "Deployment",
  ],
  "UI-UX.md": [
    "Wireframe", "Desktop", "Mobile", "Alur", "Komponen",
    "Design Token", "Responsiv",
  ],
  "SCHEMA.md": [
    "Entitas", "Relasi", "Constraint", "Index",
    "Lifecycle", "Audit", "Retention",
  ],
};

export type CompletenessCheck = {
  valid: boolean;
  code: string;
  detail: string;
};

/**
 * Detect if text is truncated mid-content.
 * Conservative approach: only flag UNCLOSED CODE FENCES as definitive truncation.
 * Other patterns (incomplete bold, link) have too many false positives with normal markdown.
 * Primary truncation signal is finish_reason=length from upstream provider.
 */
export function looksTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // ONLY strong signal: unclosed code fence
  const codeFenceCount = (trimmed.match(/```/g) || []).length;
  if (codeFenceCount % 2 !== 0) return true;

  return false;
}

/**
 * Check if a document has all required sections for its type.
 * Uses flexible matching with Indonesian synonyms for better recall.
 */
export function hasRequiredSections(file: FileName, content: string): { missing: string[] } {
  const required = REQUIRED_SECTIONS[file];
  const normalizedContent = content.toLocaleLowerCase("id-ID");

  // Indonesian synonyms for required section keywords
  const SYNONYMS: Record<string, string[]> = {
    "Retention": ["retention", "retensi", "penyimpanan", "lama penyimpanan", "kebijakan penyimpanan", "data retention", "retention policy"],
    "Security": ["security", "keamanan"],
    "Lifecycle": ["lifecycle", "siklus hidup"],
    "Audit": ["audit", "audit trail", "jejak audit"],
    "Deployment": ["deployment", "deploy", "penerapan"],
    "Compatibility": ["compatibility", "kompatibilitas", "kompatibel"],
    "Assumption": ["assumption", "asumsi"],
    "Responsiv": ["responsiv", "responsive", "responsif"],
    "Index": ["index", "indeks", "indexes", "indexing", "pengindeksan"],
    "Constraint": ["constraint", "constraints", "kendala", "batasan"],
    "Entitas": ["entitas", "entity", "entities"],
    "Relasi": ["relasi", "relation", "relationships", "kardinalitas"],
    "Ringkasan": ["ringkasan", "summary", "overview"],
    "Tujuan": ["tujuan", "goal", "objectives", "objective"],
    "Fitur": ["fitur", "feature", "features"],
    "Stack": ["stack", "tech stack", "teknologi"],
    "API": ["api", "rest", "graphql", "endpoint"],
    "Alur": ["alur", "flow", "workflows", "workflow"],
    "Komponen": ["komponen", "component", "components"],
  };

  const missing = required.filter((section) => {
    const variants = SYNONYMS[section] || [section.toLocaleLowerCase("id-ID")];
    return !variants.some((v) => normalizedContent.includes(v));
  });
  return { missing };
}

/**
 * Validate document completeness: length, sections, truncation.
 */
export function validateDocumentCompleteness(
  file: FileName,
  content: string,
): CompletenessCheck {
  const trimmed = content.trim();

  // 1. Minimum length check
  const minLength = file === "PRD.md" ? 3000 : 2200;
  if (trimmed.length < minLength) {
    return {
      valid: false,
      code: "DOCUMENT_TOO_SHORT",
      detail: `${file} terlalu pendek (${trimmed.length} chars, minimal ${minLength}).`,
    };
  }

  // 2. Truncation check
  if (looksTruncated(trimmed)) {
    return {
      valid: false,
      code: "DOCUMENT_TRUNCATED",
      detail: `${file} terpotong — konten berakhir secara tidak wajar.`,
    };
  }

  // 3. Required sections check
  const { missing } = hasRequiredSections(file, trimmed);
  if (missing.length > 0) {
    return {
      valid: false,
      code: "REQUIRED_SECTION_MISSING",
      detail: `${file} kehilangan bagian wajib: ${missing.join(", ")}.`,
    };
  }

  return { valid: true, code: "OK", detail: "" };
}

/**
 * Cross-file: extract all status-like terms mentioned in text.
 * Looks for ALL_CAPS words, quoted status names, and bullet-listed statuses.
 */
export function extractStatusesFromText(text: string): string[] {
  const statuses = new Set<string>();

  // Pattern 1: ALL_CAPS words (e.g., DRAFT, DIAJUKAN, PERLU_VERIFIKASI)
  const capsMatches = text.match(/\b[A-Z]{2,}(?:_[A-Z]{2,})+\b/g) || [];
  for (const m of capsMatches) statuses.add(m);

  // Pattern 2: Quoted status names
  const quotedMatches = text.match(/["'""]([A-Z][A-Za-z_ ]+)["'""]/g) || [];
  for (const m of quotedMatches) {
    const cleaned = m.replace(/["'""]/g, "").trim();
    if (cleaned.length > 2 && cleaned === cleaned.toUpperCase()) {
      statuses.add(cleaned);
    }
  }

  // Pattern 3: Status in bullet lists like "- Status Name" or "→ Status Name"
  const bulletMatches = text.match(/^[\s]*[-*→•]\s*([A-Z][A-Za-z_ ]{2,})/gm) || [];
  for (const m of bulletMatches) {
    const cleaned = m.replace(/^[\s]*[-*→•]\s*/, "").trim();
    if (cleaned === cleaned.toUpperCase() && cleaned.length > 2) {
      statuses.add(cleaned);
    }
  }

  return Array.from(statuses);
}

/**
 * Cross-file: validate that statuses mentioned in PRD/UI-UX exist in SCHEMA enums.
 */
export function validateCrossFileStatuses(
  blueprint: BlueprintContract,
  files: GeneratedFiles,
): { valid: boolean; orphaned: string[]; missing: string[] } {
  // A status can be global or belong to a specific entity. Both are canonical
  // blueprint statuses and must be accepted when referenced in the documents.
  const blueprintStatuses = new Set([
    ...blueprint.applicationStatuses.map((status) => normalize(status.name)),
    ...blueprint.entities.flatMap((entity) => entity.statuses ?? []).map(normalize),
  ]);

  // Statuses mentioned in PRD
  const prdStatuses = extractStatusesFromText(files["PRD.md"]);
  // Statuses mentioned in UI-UX
  const uiuxStatuses = extractStatusesFromText(files["UI-UX.md"]);
  // Find statuses mentioned in PRD/UI-UX but not in blueprint or SCHEMA
  const allMentioned = [...new Set([...prdStatuses, ...uiuxStatuses])];
  const orphaned = allMentioned.filter((status) => {
    const normalized = normalize(status);
    return (
      !blueprintStatuses.has(normalized) &&
      // Schemas commonly store enum values in lowercase, so compare against
      // the full normalized schema instead of only ALL_CAPS extractions.
      !documentContains(files["SCHEMA.md"], status)
    );
  });

  // Find blueprint statuses not mentioned anywhere in documents
  const missing = blueprint.applicationStatuses
    .filter((status) => !Object.values(files).some((document) => documentContains(document, status.name)))
    .map((s) => s.name);

  return {
    valid: orphaned.length === 0 && missing.length === 0,
    orphaned,
    missing,
  };
}

/**
 * Cross-file: validate role consistency across PRD, UI-UX, and SCHEMA.
 */
export function validateCrossFileRoles(
  blueprint: BlueprintContract,
  files: GeneratedFiles,
): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  // Extract role mentions from PRD
  const prdRoles = blueprint.roles.filter((r) =>
    documentContains(files["PRD.md"], r.name),
  );
  // Extract role mentions from SCHEMA
  const schemaRoles = blueprint.roles.filter((r) =>
    documentContains(files["SCHEMA.md"], r.name),
  );

  // Check for permission conflicts: role mentioned in SCHEMA with different permissions than PRD
  const prdPermissions = blueprint.permissions;
  for (const role of schemaRoles) {
    const prdPerms = prdPermissions[role.name] || [];
    const schemaText = files["SCHEMA.md"];
    const roleMentions = schemaText.match(new RegExp(`${role.name}[：:][^\\n]*`, "gi")) || [];

    // If SCHEMA mentions role but PRD doesn't define permissions for it
    if (prdPerms.length === 0 && roleMentions.length > 0) {
      conflicts.push(
        `PERMISSION_AMBIGUITY: ${role.name} disebutkan di SCHEMA tetapi tidak ada definisi permission di PRD.`,
      );
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}

/**
 * Generate a continuation prompt for truncated documents.
 */
export function getContinuationPrompt(file: FileName, truncatedContent: string): string {
  const lastPart = truncatedContent.slice(-500);
  return `The previous ${file} generation was truncated mid-content.

Continue exactly from this ending (do NOT repeat any previous sections):

"...${lastPart}"

Complete the unfinished section and all remaining required sections for ${file}.
Return Markdown only. Do not add any preamble or explanation.`;
}
