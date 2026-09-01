import type { FileName, GeneratedFiles } from "./types";

export type BlueprintPhase = "MVP" | "V1" | "FUTURE";

export type BlueprintRole = {
  id?: string;
  name: string;
  description?: string;
  aliases?: string[];
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

export type BlueprintLifecycleTransition = {
  from: string;
  to: string;
  actor?: string;
  condition?: string;
};

export type BlueprintLifecycle = {
  domain: string;
  statuses: string[];
  transitions?: BlueprintLifecycleTransition[];
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
  /** Detailed lifecycle contract. applicationStatuses is retained for backwards compatibility. */
  lifecycles?: BlueprintLifecycle[];
  permissions: Record<string, string[]>;
  features: BlueprintFeature[];
  integrations: string[];
  businessRules?: string[];
  deployment: Record<string, string | string[]>;
  securityRequirements: string[];
  designTokens: Record<string, string>;
  assumptions: string[];
  openQuestions: string[];
  versionPolicy?: string[];
  complianceRequirements?: string[];
  apiBasePath?: string;
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

/** A concise, user-facing note derived from a technical consistency finding. */
export type UserFacingQualityNote = {
  id: string;
  title: string;
  description: string;
  files: FileName[];
  actionInstruction: string;
  /** Kept out of the interface; used only to focus the AI revision prompt. */
  repairContext: string;
};

const DOCUMENT_LABELS: Record<FileName, string> = {
  "PRD.md": "PRD",
  "TECH-STACK.md": "Technical Architecture",
  "UI-UX.md": "UI/UX",
  "SCHEMA.md": "Schema",
};

const DOCUMENT_FILES: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];

const USER_FACING_NOTE_COPY: Record<string, { title: string; description: string }> = {
  "blueprint-contract": { title: "Rancangan proyek perlu dilengkapi", description: "Ada ketentuan dasar proyek yang belum lengkap sehingga dokumen perlu diselaraskan kembali." },
  "four-documents": { title: "Ada dokumen yang belum lengkap", description: "Lengkapi bagian dokumen yang belum tersedia agar blueprint dapat digunakan secara utuh." },
  "role-consistency": { title: "Peran pengguna belum seragam", description: "Peran dan akses pengguna perlu menggunakan istilah yang sama pada kebutuhan produk dan tampilan." },
  "entity-consistency": { title: "Data penting perlu diselaraskan", description: "Beberapa data yang disebut pada proyek belum terlihat jelas pada struktur data." },
  "lifecycle-consistency": { title: "Status proses perlu dilengkapi", description: "Status pada alur produk dan penyimpanan data perlu disamakan." },
  "feature-consistency": { title: "Fitur perlu dijelaskan", description: "Ada fitur proyek yang belum tercantum jelas dalam kebutuhan produk." },
  "prd-roadmap": { title: "Tahapan produk perlu diperjelas", description: "Prioritas MVP, pengembangan berikutnya, dan rencana lanjutan perlu dibedakan." },
  "tech-compatibility": { title: "Rencana teknis perlu dilengkapi", description: "Kompatibilitas teknologi dan kebijakan versi perlu dijelaskan agar implementasi lebih aman." },
  "ui-wireframes": { title: "Rancangan layar perlu dilengkapi", description: "Rancangan pengalaman desktop dan mobile perlu dijelaskan lebih lengkap." },
  "schema-executable": { title: "Struktur data perlu dilengkapi", description: "Relasi dan aturan data penting perlu dibuat lebih jelas." },
  "risk-security-compliance": { title: "Keamanan perlu ditinjau", description: "Risiko keamanan dan perlindungan data yang relevan perlu dijelaskan." },
  "document-completeness": { title: "Bagian dokumen perlu dilengkapi", description: "Ada bagian wajib yang belum lengkap atau belum tersusun dengan baik." },
  "cross-file-status": { title: "Status belum seragam di semua dokumen", description: "Alur status perlu diselaraskan pada kebutuhan produk, tampilan, dan struktur data." },
  "cross-file-roles": { title: "Hak akses perlu diselaraskan", description: "Peran dan izin pengguna perlu konsisten di seluruh dokumen terkait." },
  "internal-leakage": { title: "Isi dokumen perlu dirapikan", description: "Ada istilah yang tidak perlu muncul dalam dokumen proyek dan perlu ditulis ulang." },
  "cross-document-terminology": { title: "Istilah proyek belum seragam", description: "Nama peran, status, atau API perlu menggunakan istilah yang sama di setiap dokumen." },
  "contract-enforcement": { title: "Ketentuan proyek perlu diselaraskan", description: "Peran, status, fitur, atau aturan pada beberapa dokumen belum menggunakan ketentuan proyek yang sama." },
  "requirement-schema-coverage": { title: "Kebutuhan belum didukung data", description: "Ada alur atau informasi penting yang belum memiliki tempat penyimpanan data yang jelas." },
  "permission-conflict": { title: "Hak keputusan perlu diperjelas", description: "Hak akses atau pengambilan keputusan perlu disamakan pada seluruh dokumen." },
  "relationship-integrity": { title: "Hubungan data perlu dilengkapi", description: "Relasi data belum sepenuhnya mendukung alur bisnis yang dijelaskan." },
  "schema-reference-integrity": { title: "Referensi data perlu diperbaiki", description: "Beberapa index atau hubungan data perlu disesuaikan dengan struktur tabel yang ada." },
  "security-feasibility": { title: "Penerapan keamanan perlu diselaraskan", description: "Rancangan keamanan dan struktur data perlu dibuat selaras agar dapat diterapkan dengan aman." },
  "auth-streaming-coherence": { title: "Auth dan streaming perlu diselaraskan", description: "Mekanisme login, penyimpanan token, dan alur data real-time perlu menggunakan rancangan yang konsisten dan aman." },
  "document-output-isolation": { title: "Dokumen tercampur", description: "Setiap file harus memiliki satu judul dokumen yang tepat dan tidak boleh memuat judul dokumen lain." },
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

/** Normalize surface form: case, trim, collapse whitespace/underscore/hyphen separators, strip non-semantic punctuation. Does NOT remove words. */
export function normalizeSurface(value: string): string {
  return value
    .toLocaleLowerCase("id-ID")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CanonicalTerm = {
  label: string;
  aliases?: string[];
};

/**
 * Given a surface-form string, return the canonical label if it matches
 * a known term or its explicit aliases. Returns original value if no match.
 * Does NOT guess meaning by similarity.
 */
export function normalizeCanonicalTerm(value: string, terms: CanonicalTerm[]): string {
  const surface = normalizeSurface(value);
  for (const term of terms) {
    if (normalizeSurface(term.label) === surface) {
      return term.label;
    }
    if (term.aliases) {
      for (const alias of term.aliases) {
        if (normalizeSurface(alias) === surface) {
          return term.label;
        }
      }
    }
  }
  // Unknown meaning: do NOT guess.
  return value;
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

export function repairIncompleteJson(raw: string): string | null {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  text = text.slice(start);

  try {
    JSON.parse(text);
    return text;
  } catch {}

  // Walk through tokens and build state
  let inString = false;
  let escaping = false;
  let buffer = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      buffer += char;
      continue;
    }

    if (char === '"') {
      inString = true;
      buffer += char;
    } else {
      buffer += char;
    }
  }

  // If inside string, close it
  if (inString) {
    buffer += '"';
  }

  // Clean trailing unclosed tokens
  let candidate = buffer.trim();
  for (let pass = 0; pass < 8; pass++) {
    candidate = candidate
      .replace(/,\s*$/, "")
      .replace(/:\s*$/, ': ""')
      .replace(/,\s*"[^"]*"\s*$/, "")
      .replace(/,\s*$/, "");

    // Recalculate needed closing brackets for this candidate
    const closingStack: string[] = [];
    let inStr = false;
    let esc = false;

    for (let k = 0; k < candidate.length; k++) {
      const c = candidate[k];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") closingStack.push("}");
      else if (c === "[") closingStack.push("]");
      else if (c === "}" || c === "]") {
        if (closingStack.length > 0 && closingStack[closingStack.length - 1] === c) {
          closingStack.pop();
        }
      }
    }

    let closed = candidate;
    while (closingStack.length > 0) {
      closed += closingStack.pop();
    }

    try {
      JSON.parse(closed);
      return closed;
    } catch {
      // Strip back to last comma and retry
      const lastComma = candidate.lastIndexOf(",");
      if (lastComma > 0) {
        candidate = candidate.slice(0, lastComma);
      } else {
        break;
      }
    }
  }

  return null;
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

  // Auto-repair partial/incomplete JSON if stream ended abruptly
  const repaired = repairIncompleteJson(trimmed.slice(start));
  if (repaired) return repaired;

  throw new Error("Kontrak blueprint JSON belum lengkap.");
}

export function parseBlueprintContract(raw: string): BlueprintContract {
  const parsed = JSON.parse(extractJsonObject(raw)) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error("Kontrak blueprint harus berupa objek JSON.");

  const rawRoles = Array.isArray(root.roles)
    ? root.roles.map((item) => {
        if (typeof item === "string") return { name: item.trim() };
        const role = asRecord(item) || {};
        return { id: asString(role.id), name: asString(role.name), description: asString(role.description) };
      }).filter((role) => role.name)
    : [];
  const seenRoles = new Set<string>();
  const roles: BlueprintRole[] = [];
  for (const r of rawRoles) {
    const norm = normalize(r.name);
    if (!seenRoles.has(norm)) {
      seenRoles.add(norm);
      roles.push(r);
    }
  }

  const rawEntities = Array.isArray(root.entities)
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
  const seenEntities = new Set<string>();
  const entities: BlueprintEntity[] = [];
  for (const e of rawEntities) {
    const norm = normalize(e.name);
    if (!seenEntities.has(norm)) {
      seenEntities.add(norm);
      entities.push(e);
    }
  }

  const rawAppStatuses = Array.isArray(root.applicationStatuses)
    ? root.applicationStatuses.map((item) => {
        if (typeof item === "string") return { domain: "aplikasi", name: item.trim() };
        const status = asRecord(item) || {};
        return {
          domain: asString(status.domain) || "aplikasi",
          name: asString(status.name),
          description: asString(status.description),
        };
      }).filter((status) => status.name)
    : [];
  const seenStatusKeys = new Set<string>();
  const applicationStatuses: BlueprintStatus[] = [];
  for (const st of rawAppStatuses) {
    const key = `${normalize(st.domain)}:${normalize(st.name)}`;
    if (!seenStatusKeys.has(key)) {
      seenStatusKeys.add(key);
      applicationStatuses.push(st);
    }
  }

  const lifecycles = Array.isArray(root.lifecycles)
    ? root.lifecycles.map((item) => {
        const lifecycle = asRecord(item) || {};
        const rawStatuses = asStringArray(lifecycle.statuses);
        const seenSt = new Set<string>();
        const statuses = rawStatuses.filter((s) => {
          const norm = normalize(s);
          if (!norm || seenSt.has(norm)) return false;
          seenSt.add(norm);
          return true;
        });
        const transitions = Array.isArray(lifecycle.transitions)
          ? lifecycle.transitions.map((transition) => {
              const value = asRecord(transition) || {};
              return {
                from: asString(value.from),
                to: asString(value.to),
                actor: asString(value.actor),
                condition: asString(value.condition),
              };
            }).filter((transition) => transition.from && transition.to)
          : [];
        return {
          domain: asString(lifecycle.domain),
          statuses,
          transitions,
        };
      }).filter((lifecycle) => lifecycle.domain && lifecycle.statuses.length)
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
    projectSummary: asString(root.projectSummary) || asString(root.project_summary) || asString(root.summary) || asString(root.description) || asString(root.project_description) || asString(root.overview) || asString(root.ringkasan),
    roles,
    entities,
    applicationStatuses,
    lifecycles,
    permissions,
    features,
    integrations: asStringArray(root.integrations),
    businessRules: asStringArray(root.businessRules),
    deployment: asStringOrArrayRecord(root.deployment),
    securityRequirements: asStringArray(root.securityRequirements),
    designTokens: asStringRecord(root.designTokens),
    assumptions: asStringArray(root.assumptions),
    openQuestions: asStringArray(root.openQuestions),
    versionPolicy: asStringArray(root.versionPolicy),
    complianceRequirements: asStringArray(root.complianceRequirements),
    apiBasePath: asString(root.apiBasePath),
  };
}

const SYSTEM_ACTOR_KEYWORDS = [
  "sistem",
  "system",
  "otomatis",
  "otomasi",
  "auto",
  "automatic",
  "cron",
  "scheduler",
  "job",
  "worker",
  "webhook",
  "gateway",
  "payment",
  "timer",
  "bot",
  "ai",
  "service",
  "server",
  "engine",
  "trigger",
  "batch",
];

function isKnownActor(actor: string, roleNames: Set<string>, roles: BlueprintRole[] = []): boolean {
  const norm = normalize(actor);
  if (!norm) return true;
  if (roleNames.has(norm)) return true;
  for (const keyword of SYSTEM_ACTOR_KEYWORDS) {
    if (norm === keyword || norm.includes(keyword)) {
      return true;
    }
  }
  for (const role of roles) {
    const roleNorm = normalize(role.name);
    if (roleNorm && (norm.includes(roleNorm) || roleNorm.includes(norm))) {
      return true;
    }
  }
  return false;
}

export function validateBlueprintContract(blueprint: BlueprintContract): string[] {
  const failures: string[] = [];
  if (!blueprint.projectSummary) failures.push("Ringkasan proyek belum ada.");
  if (!blueprint.roles.length || blueprint.roles.some((role) => !role.name)) failures.push("Minimal satu role dengan nama wajib ada.");
  if (!blueprint.entities.length || blueprint.entities.some((entity) => !entity.name)) failures.push("Minimal satu entitas data dengan nama wajib ada.");
  if (!blueprint.features.length || blueprint.features.some((feature) => !feature.name)) failures.push("Minimal satu fitur dengan nama wajib ada.");
  if (!uniqueNames(blueprint.roles.map((role) => role.name))) failures.push("Nama role harus unik.");
  if (!uniqueNames(blueprint.entities.map((entity) => entity.name))) failures.push("Nama entitas harus unik.");

  for (const lifecycle of blueprint.lifecycles || []) {
    if (!uniqueNames(lifecycle.statuses)) {
      failures.push(`Nama status pada lifecycle ${lifecycle.domain} harus unik.`);
    }
  }

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
  for (const lifecycle of blueprint.lifecycles || []) {
    const statuses = new Set(lifecycle.statuses.map(normalize));
    for (const transition of lifecycle.transitions || []) {
      if (!statuses.has(normalize(transition.from)) || !statuses.has(normalize(transition.to))) {
        failures.push(`Transisi lifecycle ${lifecycle.domain} memakai status di luar lifecycle: ${transition.from} → ${transition.to}.`);
      }
      if (transition.actor && !isKnownActor(transition.actor, roleNames, blueprint.roles)) {
        failures.push(`Transisi lifecycle ${lifecycle.domain} memakai role yang tidak ada: ${transition.actor}.`);
      }
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
    lifecycles: [{
      domain: "proses utama",
      statuses: ["DRAFT", "DALAM_PROSES", "SELESAI"],
      transitions: [
        { from: "DRAFT", to: "DALAM_PROSES", actor: "Admin" },
        { from: "DALAM_PROSES", to: "SELESAI", actor: "Admin" },
      ],
    }],
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
    businessRules: ["Perubahan status proses utama hanya dilakukan oleh role yang memiliki izin sesuai kontrak."],
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
const FINAL_DECISION_TERM = /\b(?:final\s+(?:approve|approval|persetujuan|keputusan|reject)|menetapkan(?:\s+penerima)?|keputusan\s+(?:final|akhir)|(?:approve|reject|setujui|tolak)(?:\s+(?:final|penerima))?)\b/i;

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

function declaredApiPrefix(tech: string): string | null {
  const prefixMatch = tech.match(
    /(?:(?:semua|seluruh)[^.\n]{0,90}endpoint[^.\n]{0,90}|endpoint[^.\n]{0,90}\bdi bawah\s+|prefix(?:\s+api)?\s*(?:adalah|:)?\s*)(\/api\/v\d+)(?=\/|\b)/i,
  );
  return prefixMatch?.[1]?.toLowerCase() ?? null;
}

function documentedApiEndpoints(tech: string): string[] {
  return tech.match(/\/api\/(?:v\d+(?:\/|\b)|[a-z0-9_/-]+)/gi) || [];
}

function endpointApiPrefix(endpoint: string): string | null {
  return endpoint.match(/^\/api\/(v\d+)(?:\/|\b)/i)?.[1]?.toLowerCase() ?? null;
}

function isVersionPolicyReference(tech: string, endpoint: string): boolean {
  const index = tech.indexOf(endpoint);
  if (index < 0) return false;
  // The next API version may appear in a version policy (for example,
  // "breaking changes require /api/v2") without being a live endpoint.
  const context = tech.slice(Math.max(0, index - 140), Math.min(tech.length, index + endpoint.length + 100));
  return /\b(?:breaking|pecah|migrasi|migration|legacy|deprecated|deprecat|version\s+policy|kebijakan\s+versi)\b/i.test(context);
}

/**
 * Normalise generated API routes to the version policy stated in a tech spec.
 * This is deliberately limited to a document that explicitly declares a single
 * API prefix, so it cannot invent an API version for an undecided project.
 */
export function normalizeTechApiEndpointPrefixes(tech: string, canonicalApiBasePath?: string): string {
  const apiPrefix = /^\/api\/v\d+$/i.test(canonicalApiBasePath || "")
    ? canonicalApiBasePath!.toLowerCase()
    : null;
  if (!apiPrefix) return tech;

  return tech.replace(
    /\/api\/(?:(?:v\d+)(?=\/|\b))?(\/[a-z0-9_/-]+)?/gi,
    (endpoint, path: string | undefined) => {
      const endpointPrefix = endpointApiPrefix(endpoint);
      if (endpointPrefix && `/api/${endpointPrefix}` === apiPrefix) return endpoint;
      return path ? `${apiPrefix}${path}` : apiPrefix;
    },
  );
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
  const declaredPrefix = declaredApiPrefix(tech);
  const apiPrefix = /^\/api\/v\d+$/i.test(blueprint.apiBasePath || "")
    ? blueprint.apiBasePath!.toLowerCase()
    : declaredPrefix;
  const apiEndpoints = documentedApiEndpoints(tech);
  const unversionedEndpoints = apiEndpoints.filter((endpoint) => !endpointApiPrefix(endpoint));
  const mismatchedVersionEndpoints = apiPrefix
    ? apiEndpoints.filter((endpoint) => {
        const endpointPrefix = endpointApiPrefix(endpoint);
        return endpointPrefix !== null
          && `/api/${endpointPrefix}` !== apiPrefix
          && !isVersionPolicyReference(tech, endpoint);
      })
    : [];
  if (apiPrefix && unversionedEndpoints.length) {
    issues.push(`endpoint belum memakai prefix versi ${apiPrefix} (${[...new Set(unversionedEndpoints)].slice(0, 3).join(", ")})`);
    affected.add("TECH-STACK.md");
  }
  if (apiPrefix && mismatchedVersionEndpoints.length) {
    issues.push(`versi endpoint tidak konsisten dengan prefix ${apiPrefix} (${[...new Set(mismatchedVersionEndpoints)].slice(0, 3).join(", ")})`);
    affected.add("TECH-STACK.md");
  }
  if (apiPrefix && declaredPrefix && declaredPrefix !== apiPrefix) {
    issues.push(`prefix endpoint pada TECH-STACK.md (${declaredPrefix}) berbeda dari kebijakan API kanonis (${apiPrefix})`);
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

/**
 * Only flags explicit, implementationally impossible combinations. It does
 * not reject legitimate hybrids such as short-lived JWTs plus hashed refresh
 * sessions, or an application that uses SSE and WebSocket for different
 * flows.
 */
function findAuthStreamingCoherenceIssue(files: GeneratedFiles): SemanticIssue | null {
  const tech = files["TECH-STACK.md"];
  const schema = files["SCHEMA.md"];
  const issues: string[] = [];
  const affected = new Set<FileName>();

  const usesEventSource = /\beventsource\b/i.test(tech);
  const sendsBearerHeader = /(?:authorization\s*[:=]\s*["'`]?bearer\b|bearer\s+(?:token|jwt)[^\n]{0,80}(?:header|authorization))/i.test(tech);
  if (usesEventSource && sendsBearerHeader) {
    issues.push("EventSource browser disebut memakai header Authorization Bearer kustom, padahal EventSource tidak mendukung header kustom");
    affected.add("TECH-STACK.md");
  }

  const explicitlyNoSessionStorage = /(?:stateless\s+(?:jwt|token)|(?:jwt|token)\s+stateless)[\s\S]{0,140}(?:tanpa|tidak ada|no)\s+(?:penyimpanan\s+)?sesi/i.test(tech)
    || /(?:tanpa|tidak ada|no)\s+(?:penyimpanan\s+)?sesi[\s\S]{0,140}(?:stateless\s+(?:jwt|token)|(?:jwt|token)\s+stateless)/i.test(tech);
  const definesActiveSessionStore = /(?:^#{1,6}\s*(?:sessions?|sesi)\b|\b(?:sessions?|sesi)\s*(?:\(|:)|\b(?:session_token|session_id)\b)/im.test(schema);
  if (explicitlyNoSessionStorage && definesActiveSessionStore) {
    issues.push("TECH-STACK.md menyatakan JWT stateless tanpa penyimpanan sesi, tetapi SCHEMA.md mendefinisikan penyimpanan sesi aktif");
    affected.add("TECH-STACK.md");
    affected.add("SCHEMA.md");
  }

  const storesRawCredential = /\b(?:access_token|refresh_token|session_token)\b(?![_\s-]*(?:hash|hmac|digest|lookup))/i.test(schema);
  const mentionsCredentialHash = /\b(?:access_token|refresh_token|session_token)[_\s-]*(?:hash|hmac|digest|lookup)\b/i.test(schema);
  if (storesRawCredential && !mentionsCredentialHash) {
    issues.push("SCHEMA.md menyebut penyimpanan access/refresh/session token tanpa hash atau lookup token yang aman");
    affected.add("SCHEMA.md");
  }

  const bearerInStreamUrl = /(?:sse|stream|eventsource)[\s\S]{0,160}(?:query(?:\s+string)?|url)[\s\S]{0,80}(?:bearer|access[_\s-]*token|jwt)/i.test(tech)
    || /(?:query(?:\s+string)?|url)[\s\S]{0,80}(?:bearer|access[_\s-]*token|jwt)[\s\S]{0,160}(?:sse|stream|eventsource)/i.test(tech);
  if (bearerInStreamUrl) {
    issues.push("bearer/access token ditaruh pada URL atau query alur streaming");
    affected.add("TECH-STACK.md");
  }

  if (!issues.length) return null;
  const filesAffected = uniqueFiles(affected);
  return {
    files: filesAffected,
    detail: `Auth dan streaming tidak koheren: ${issues.join("; ")}. Dokumen terdampak: ${issueFilesDetail(filesAffected)}.`,
  };
}

const TECHNICAL_STATUS_TERMS = new Set([
  "API", "UI", "UX", "PRD", "MVP", "SQL", "HTTP", "HTTPS", "GET", "POST", "PUT", "PATCH", "DELETE",
  "UUID", "PK", "FK", "NOT", "NULL", "UNIQUE", "CHECK", "TEXT", "INTEGER", "BOOLEAN", "JSON", "JWT", "URL",
  "HMAC", "AES", "UTC", "CI", "CD", "CSS", "HTML", "CRUD", "SSE", "ERD", "PDF", "WCAG",
  "VARCHAR", "TEXT", "JSONB", "TIMESTAMPTZ", "BIGINT", "INT", "ENUM", "RAG", "UPDATE",
  "ACID", "RBAC", "E2E", "CTA", "DEFAULT", "MINGGUAN", "BULANAN", "TRIWULANAN", "TAHUNAN",
]);

const COMMON_ROLE_PATTERN = /\b(?:admin(?:istrator)?|owner|pemilik|super[\s_-]*admin|manajer|manager|kasir|cashier|dapur|koki|chef|staf|staff|operator|verifikator|reviewer|approver|pelanggan|customer|supplier|vendor|kurir|driver|mitra)\b/gi;

const EXTERNAL_CAPABILITIES: Array<{ name: string; pattern: RegExp }> = [
  { name: "WhatsApp", pattern: /\bwhats?app\b/i },
  { name: "payment gateway", pattern: /\b(?:midtrans|xendit|stripe|payment\s+gateway)\b/i },
  { name: "peta", pattern: /\b(?:google\s+maps|mapbox)\b/i },
  { name: "notifikasi SMS", pattern: /\b(?:twilio|sms\s+(?:gateway|notification))\b/i },
  { name: "barcode", pattern: /\b(?:barcode|bar\s*code)\b/i },
  { name: "pajak", pattern: /\b(?:pajak|tax)\b/i },
  { name: "pembelian stok", pattern: /\b(?:beli|pembelian|purchase|restock)\s+(?:stok|inventory|persediaan)\b/i },
];

function canonicalStatusTerms(blueprint: BlueprintContract): Set<string> {
  return new Set([
    ...blueprint.applicationStatuses.map((status) => normalize(status.name)),
    ...blueprint.entities.flatMap((entity) => entity.statuses || []).map(normalize),
    ...(blueprint.lifecycles || []).flatMap((lifecycle) => lifecycle.statuses).map(normalize),
  ]);
}

function extractDeclaredLifecycleStatuses(text: string): string[] {
  const statuses = new Set<string>();
  let inLifecycleSection = false;
  for (const line of linesOf(text)) {
    if (/^#{1,6}\s+/.test(line)) {
      inLifecycleSection = /\b(?:status|lifecycle|siklus|state|transisi)\b/i.test(line);
    }
    const hasStatusContext = /\b(?:status|lifecycle|siklus|state|enum|transisi)\b|→/i.test(line);
    const isLifecycleEntry = inLifecycleSection && /^\s*(?:[-*•→]|\|)/.test(line);
    // Status-like identifiers elsewhere (for example table names, event codes,
    // colour values, or file types) are not lifecycle declarations.
    if (!hasStatusContext && !isLifecycleEntry) continue;
    for (const candidate of line.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []) {
      if (/^[A-F][0-9A-F]{5,7}$/.test(candidate)) continue;
      statuses.add(candidate);
    }
  }
  return [...statuses].filter((status) => !TECHNICAL_STATUS_TERMS.has(status));
}

function markdownTableCells(line: string): string[] {
  if (!/^\s*\|/.test(line)) return [];
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.replace(/[`*_]/g, "").trim());
}

function cleanRoleCandidate(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/[`*_]/g, "")
    .replace(/\b(?:role|peran|aktor)\b\s*[:=-]?/i, "")
    .trim();
}

function extractDeclaredRoles(text: string): string[] {
  const roles = new Set<string>();
  let roleColumn = -1;
  const lines = linesOf(text);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const cells = markdownTableCells(line);
    if (cells.length) {
      const headerIndex = cells.findIndex((cell) => /^(?:role|peran|aktor)(?:\s+sistem)?$/i.test(cell));
      const nextCells = markdownTableCells(lines[lineIndex + 1] || "");
      const isHeader = nextCells.length > 0 && nextCells.every((cell) => /^:?-{2,}:?$/.test(cell));
      // A column named `role` in a schema table is data, not a role table.
      // Treat it as a role column only when followed by a Markdown separator.
      if (isHeader) {
        // A new Markdown table starts here. Without this reset, a role column
        // from a previous table leaked into every later table and ordinary
        // schema/architecture values were misclassified as roles.
        roleColumn = headerIndex;
        continue;
      }
      if (roleColumn >= 0 && !cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
        const candidate = cleanRoleCandidate(cells[roleColumn] || "");
        if (/^[\p{L}][\p{L}\s_/-]{1,60}$/u.test(candidate)) roles.add(candidate);
      }
      continue;
    }

    // Role table context only applies to one contiguous Markdown table.
    roleColumn = -1;

    // A declaration needs an explicit separator. Without it, ordinary prose
    // such as "role sesuai ketentuan" was incorrectly read as a new role.
    // A hyphen after "role" commonly forms the technical phrase
    // "role-based access control", not a role declaration.
    const explicit = line.match(/\b(?:role|peran|aktor)\b\s*(?:adalah|=|:)\s*`?([\p{L}][\p{L}\s_/-]{1,60})`?/iu);
    if (explicit) {
      for (const candidate of explicit[1].split(/\s+(?:dan|&|\/|,|;)+\s*/iu)) {
        const cleaned = cleanRoleCandidate(candidate);
        if (cleaned) roles.add(cleaned);
      }
    }
  }
  return [...roles].filter(Boolean);
}

function documentFilesContaining(files: GeneratedFiles, pattern: RegExp): FileName[] {
  return (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) => pattern.test(files[file]));
}

/**
 * Enforces the immutable blueprint boundary without attempting to infer an
 * entire product from prose. It only rejects explicitly declared roles,
 * lifecycle states, integrations, and high-impact capabilities that the
 * canonical contract does not allow.
 */
function findContractEnforcementIssue(blueprint: BlueprintContract, files: GeneratedFiles): SemanticIssue | null {
  const issues: string[] = [];
  const affected = new Set<FileName>();
  const contractRoles = new Set([
    ...blueprint.roles.map((role) => normalize(role.name)),
    ...blueprint.roles.map((role) => normalize(role.id || "")),
  ].filter(Boolean));
  const contractStatuses = canonicalStatusTerms(blueprint);
  const contractText = normalize([
    ...blueprint.features.map((feature) => feature.name),
    ...blueprint.integrations,
    ...(blueprint.businessRules || []),
  ].join(" "));

  const extraRoles = new Map<string, FileName[]>();
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    for (const role of extractDeclaredRoles(files[file])) {
      const normalizedRole = normalize(role);
      if (!normalizedRole || contractRoles.has(normalizedRole)) continue;
      // A role table may include an access sentence in the same cell (for
      // example, "Teknisi hanya melihat Tiket Kerusakan"). When that cell
      // starts with a canonical role, it is usage prose rather than a new
      // role definition.
      const startsWithCanonicalRole = blueprint.roles.some((contractRole) => {
        const canonical = normalize(contractRole.name);
        return normalizedRole.startsWith(`${canonical} `);
      });
      if (startsWithCanonicalRole) continue;
      const roleFiles = extraRoles.get(role) || [];
      roleFiles.push(file);
      extraRoles.set(role, roleFiles);
      affected.add(file);
    }
  }
  if (extraRoles.size) {
    const names = [...extraRoles.keys()].slice(0, 5).join(", ");
    issues.push(`ROLE_CONTRACT_CONFLICT: role di luar blueprint ditemukan (${names})`);
  }

  const extraStatuses = new Map<string, FileName[]>();
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    for (const status of extractDeclaredLifecycleStatuses(files[file])) {
      // A role code such as ADMIN_FASILITAS can appear next to a lifecycle
      // field in a schema. It is not a newly invented lifecycle state.
      if (contractRoles.has(normalize(status))) continue;
      if (contractStatuses.has(normalize(status))) continue;
      const statusFiles = extraStatuses.get(status) || [];
      statusFiles.push(file);
      extraStatuses.set(status, statusFiles);
      affected.add(file);
    }
  }
  if (extraStatuses.size) {
    issues.push(`LIFECYCLE_CONTRACT_CONFLICT: status di luar blueprint ditemukan (${[...extraStatuses.keys()].slice(0, 5).join(", ")})`);
  }

  for (const status of canonicalStatusTerms(blueprint)) {
    const statusFiles = (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) => documentContains(files[file], status));
    const statusContext = statusFiles.flatMap((file) => linesOf(files[file]).filter((line) => documentContains(line, status)));
    const isPaymentState = statusContext.some((line) => /\b(?:bayar|pembayaran|payment|paid|invoice|pelunasan)\b/i.test(line));
    const isFulfilmentState = statusContext.some((line) => /\b(?:dapur|masak|kitchen|pesanan|order|siap\s+(?:saji|diambil))\b/i.test(line));
    if (isPaymentState && isFulfilmentState) {
      statusFiles.forEach((file) => affected.add(file));
      issues.push(`LIFECYCLE_SEMANTIC_CONFLICT: status ${status.toUpperCase()} dipakai untuk pembayaran dan pemenuhan pesanan`);
    }
  }

  for (const capability of EXTERNAL_CAPABILITIES) {
    const mentionedIn = documentFilesContaining(files, capability.pattern);
    if (!mentionedIn.length || documentContains(contractText, capability.name)) continue;
    mentionedIn.forEach((file) => affected.add(file));
    issues.push(`UNAUTHORIZED_REQUIREMENT_INTRODUCTION: ${capability.name} tidak tercatat di blueprint`);
  }

  // An integration may be allowed by name but still be repurposed by a
  // document. Detect the high-risk reporting-to-customer drift explicitly.
  const whatsappContract = [...blueprint.integrations, ...(blueprint.businessRules || [])]
    .filter((item) => /\bwhats?app\b/i.test(item))
    .join(" ");
  if (/\bwhats?app\b/i.test(whatsappContract) && /\b(?:laporan|report)\b/i.test(whatsappContract)) {
    const customerNotificationFiles = (Object.keys(DOCUMENT_LABELS) as FileName[]).filter((file) =>
      linesOf(files[file]).some((line) => /\bwhats?app\b/i.test(line) && /\b(?:pelanggan|customer)\b/i.test(line)),
    );
    if (customerNotificationFiles.length) {
      customerNotificationFiles.forEach((file) => affected.add(file));
      issues.push("INTEGRATION_PURPOSE_CONFLICT: WhatsApp untuk laporan di kontrak diubah menjadi notifikasi pelanggan");
    }
  }

  const asksForProfit = /\b(?:laba(?:\s+kotor)?|profit|margin|cogs|harga pokok)\b/i.test(`${files["PRD.md"]}\n${files["UI-UX.md"]}`);
  const schemaSupportsCost = /\b(?:cost(?:_per_unit)?|unit_cost|biaya(?:_per_unit)?|harga_beli|purchase_price|inventory_(?:receipt|batch|movement))\b/i.test(files["SCHEMA.md"]);
  if (asksForProfit && !schemaSupportsCost) {
    affected.add("PRD.md");
    affected.add("UI-UX.md");
    affected.add("SCHEMA.md");
    issues.push("REQUIREMENT_TO_SCHEMA_COVERAGE: laba atau margin belum memiliki data biaya/COGS pada schema");
  }

  if (!issues.length) return null;
  return {
    files: uniqueFiles(affected),
    detail: `Kontrak blueprint immutable dilanggar: ${issues.join("; ")}. Dokumen terdampak: ${issueFilesDetail(uniqueFiles(affected))}.`,
  };
}

function extractSchemaTablesAndColumns(schema: string): Map<string, Set<string>> {
  const definitions = new Map<string, Set<string>>();
  const ignoredHeadings = new Set(["prinsip", "erd", "relasi", "constraint", "constraints", "index", "indeks", "lifecycle", "audit", "retention", "retensi", "keamanan"]);
  const headingMatches = [...schema.matchAll(/^#{2,6}[ \t]+(?:tabel[ \t]*[:—-]?[ \t]*)?`?([^`\n]+?)`?[ \t]*$/gim)];

  for (let index = 0; index < headingMatches.length; index += 1) {
    const heading = headingMatches[index][1].replace(/[*_]/g, "").trim();
    const table = normalize(heading).replace(/\s+/g, "_");
    if (!table || ignoredHeadings.has(table) || table.split("_").length > 4) continue;
    const start = (headingMatches[index].index || 0) + headingMatches[index][0].length;
    const end = headingMatches[index + 1]?.index || schema.length;
    const section = schema.slice(start, end);
    const columns = definitions.get(table) || new Set<string>();

    for (const line of linesOf(section)) {
      const cells = markdownTableCells(line);
      if (cells.length && !/^(?:kolom|column|field|nama)$/i.test(cells[0]) && !/^:?-{2,}:?$/.test(cells[0])) {
        const column = normalize(cells[0]).replace(/\s+/g, "_");
        if (/^[a-z][a-z0-9_]{1,60}$/.test(column)) columns.add(column);
      }
      for (const match of line.matchAll(/`([a-z][a-z0-9_]{1,60})`/gi)) columns.add(match[1].toLowerCase());
    }
    if (columns.size) definitions.set(table, columns);
  }

  for (const createTable of schema.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z][a-z0-9_]*)`?\s*\(([\s\S]*?)\)\s*;/gi)) {
    const table = createTable[1].toLowerCase();
    const columns = definitions.get(table) || new Set<string>();
    for (const line of createTable[2].split(/\r?\n/)) {
      const match = line.match(/^\s*`?([a-z][a-z0-9_]*)`?\s+(?!PRIMARY\b|FOREIGN\b|CONSTRAINT\b|UNIQUE\b|CHECK\b)/i);
      if (match) columns.add(match[1].toLowerCase());
    }
    if (columns.size) definitions.set(table, columns);
  }
  return definitions;
}

function findSchemaReferenceIntegrityIssue(files: GeneratedFiles): SemanticIssue | null {
  const schema = files["SCHEMA.md"];
  const definitions = extractSchemaTablesAndColumns(schema);
  if (!definitions.size) return null;

  const issues = new Set<string>();
  for (const reference of schema.matchAll(/(?:\bindex\b|\bindeks\b)[^\n]{0,140}?\b(?:on\s+)?`?([a-z][a-z0-9_]*)`?\s*\(([^)]+)\)/gi)) {
    const table = reference[1].toLowerCase();
    const columns = definitions.get(table);
    if (!columns) continue;
    const missing = reference[2]
      .split(",")
      .map((column) => normalize(column.replace(/\b(?:asc|desc)\b/gi, "")).replace(/\s+/g, "_"))
      .filter((column) => column && !columns.has(column));
    if (missing.length) issues.add(`indeks ${table} merujuk kolom yang tidak didefinisikan: ${missing.join(", ")}`);
  }

  for (const reference of schema.matchAll(/\bREFERENCES\s+`?([a-z][a-z0-9_]*)`?\s*\(\s*`?([a-z][a-z0-9_]*)`?\s*\)/gi)) {
    const table = reference[1].toLowerCase();
    const column = reference[2].toLowerCase();
    const columns = definitions.get(table);
    if (columns && !columns.has(column)) issues.add(`foreign key merujuk ${table}.${column} yang tidak didefinisikan`);
  }

  const auditClaimsMultipleEntities = /\b(?:audit|riwayat\s+aktivitas|audit\s+trail)\b[\s\S]{0,260}\b(?:produk|product)\b[\s\S]{0,260}\b(?:bahan|inventory|persediaan)|\b(?:produk|product)\b[\s\S]{0,260}\b(?:audit|riwayat\s+aktivitas|audit\s+trail)\b[\s\S]{0,260}\b(?:bahan|inventory|persediaan)/i.test(schema);
  const auditHasGenericReference = /\b(?:entity|resource|subject|record)[_\s-]*(?:type|id)\b/i.test(schema);
  if (auditClaimsMultipleEntities && !auditHasGenericReference) {
    issues.add("audit mencakup banyak entitas tetapi belum memiliki entity_type dan entity_id generik");
  }

  if (!issues.size) return null;
  return {
    files: ["SCHEMA.md"],
    detail: `Referensi SCHEMA tidak valid: ${[...issues].join("; ")}.`,
  };
}

function indexReferenceFromLine(line: string): { table: string; columns: string[]; rawColumns: string } | null {
  const onMatch = line.match(/\bON\s+`?([a-z][a-z0-9_]*)`?\s*\(([^)]+)\)/i);
  const inlineMatch = line.match(/\b(?:index|indeks)\b[^\n(]{0,120}?`?([a-z][a-z0-9_]*)`?\s*\(([^)]+)\)/i);
  const match = onMatch || inlineMatch;
  if (!match) return null;
  return {
    table: match[1].toLowerCase(),
    rawColumns: match[2],
    columns: match[2]
      .split(",")
      .map((column) => normalize(column.replace(/\b(?:asc|desc)\b/gi, "")).replace(/\s+/g, "_"))
      .filter(Boolean),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function schemaSectionDefinesColumn(schema: string, table: string, column: string): boolean {
  const tableHeader = new RegExp(
    "^#{2,6}[ \\t]+(?:tabel[ \\t]*[:—-]?[ \\t]*)?`?" + escapeRegExp(table) + "`?[ \\t]*$",
    "im",
  );
  const heading = tableHeader.exec(schema);
  if (!heading || heading.index === undefined) return false;
  const remainder = schema.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(/^#{1,6}[ \t]+/m);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  const escapedColumn = escapeRegExp(column);
  return new RegExp("^\\s*\\|\\s*`?" + escapedColumn + "`?\\s*\\|", "im").test(section)
    || new RegExp("`" + escapedColumn + "`", "i").test(section);
}

function applyDeterministicSchemaFixes(schema: string): { content: string; changes: string[] } {
  const definitions = extractSchemaTablesAndColumns(schema);

  const changes: string[] = [];
  const fixedLines = schema.split(/\r?\n/).map((line) => {
    const indexReference = indexReferenceFromLine(line);
    if (indexReference) {
      const definedColumns = definitions.get(indexReference.table);
      if (definedColumns || schemaSectionDefinesColumn(schema, indexReference.table, indexReference.columns[0] || "")) {
        const validColumns = indexReference.columns.filter((column) =>
          Boolean(definedColumns?.has(column)) || schemaSectionDefinesColumn(schema, indexReference.table, column),
        );
        if (validColumns.length !== indexReference.columns.length) {
          if (validColumns.length) {
            changes.push(`Indeks ${indexReference.table} dinormalisasi ke kolom yang tersedia.`);
            return line.replace(indexReference.rawColumns, validColumns.join(", "));
          }
          changes.push(`Indeks ${indexReference.table} dihapus karena seluruh kolomnya belum didefinisikan.`);
          return "";
        }
      }
    }

    const foreignKey = line.match(/\bREFERENCES\s+`?([a-z][a-z0-9_]*)`?\s*\(\s*`?([a-z][a-z0-9_]*)`?\s*\)/i);
    if (foreignKey) {
      const table = foreignKey[1].toLowerCase();
      const targetColumn = foreignKey[2].toLowerCase();
      const definedColumns = definitions.get(table);
      // Replacing a mistyped target with its sole conventional primary key is
      // deterministic. Other ambiguous FK errors are deliberately left for
      // the targeted repair path.
      const hasTargetColumn = Boolean(definedColumns?.has(targetColumn)) || schemaSectionDefinesColumn(schema, table, targetColumn);
      const hasId = Boolean(definedColumns?.has("id")) || schemaSectionDefinesColumn(schema, table, "id");
      if ((definedColumns || hasId) && !hasTargetColumn && hasId) {
        changes.push(`Foreign key ${table}.${targetColumn} diarahkan ke ${table}.id.`);
        return line.replace(foreignKey[0], `REFERENCES ${foreignKey[1]}(id)`);
      }
    }
    return line;
  });

  return { content: fixedLines.filter(Boolean).join("\n"), changes };
}

export type DeterministicFixResult = {
  files: GeneratedFiles;
  changes: string[];
};

/**
 * Applies only unambiguous, loss-minimising fixes. It intentionally never
 * invents roles, features, lifecycle states, or a missing database column.
 */
/**
 * Deterministically fixes cross-document terminology FORM without guessing meaning.
 * Only handles: casing, whitespace, hyphen/underscore, exact canonical label, explicit alias, API prefix.
 * Does NOT: replace roles by similarity, change flag→status, remove content, guess synonyms.
 */
function applyCrossDocumentTerminologyFixes(
  blueprint: BlueprintContract,
  files: GeneratedFiles,
): { files: GeneratedFiles; changes: string[] } {
  const changes: string[] = [];
  let result = { ...files };

  // Build canonical terms from blueprint
  const canonicalRoles: CanonicalTerm[] = blueprint.roles.map((r) => ({
    label: r.name,
    aliases: r.aliases,
  }));

  const allStatuses = [
    ...blueprint.applicationStatuses.map((s) => s.name),
    ...(blueprint.lifecycles || []).flatMap((l) => l.statuses),
  ];
  const canonicalStatuses: CanonicalTerm[] = [...new Set(allStatuses)].map((s) => ({
    label: s,
    aliases: undefined,
  }));

  // Fix 1: Normalize role names using explicit aliases only
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    const content = result[file];
    const declaredRoles = extractDeclaredRoles(content);
    let fixed = content;
    for (const role of declaredRoles) {
      const canonical = normalizeCanonicalTerm(role, canonicalRoles);
      if (canonical !== role) {
        const regex = new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
        fixed = fixed.replace(regex, canonical);
      }
    }
    if (fixed !== content) {
      result = { ...result, [file]: fixed };
      changes.push(`Role dinormalisasi via alias di ${file}.`);
    }
  }

  // Fix 2: Normalize status casing using blueprint as source of truth
  for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
    const content = result[file];
    let fixed = content;
    for (const status of canonicalStatuses) {
      // Find any surface variant of this status in the text
      const surfacePattern = status.label
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "[\\s_\\-]+");
      const regex = new RegExp(surfacePattern, "gi");
      if (regex.test(fixed)) {
        fixed = fixed.replace(regex, status.label);
      }
    }
    if (fixed !== content) {
      result = { ...result, [file]: fixed };
      changes.push(`Casing status dinormalisasi di ${file}.`);
    }
  }

  // Fix 3: Normalize API endpoint version prefixes (delegates to existing function)
  // Already handled by normalizeTechApiEndpointPrefixes in applyDeterministicFastFixes

  return { files: result, changes };
}

export function applyDeterministicFastFixes(
  blueprint: BlueprintContract,
  files: GeneratedFiles,
): DeterministicFixResult {
  const changes: string[] = [];
  const normalizedTech = normalizeTechApiEndpointPrefixes(files["TECH-STACK.md"], blueprint.apiBasePath);
  if (normalizedTech !== files["TECH-STACK.md"]) {
    changes.push("Prefix endpoint API diselaraskan dengan kontrak proyek.");
  }
  const schemaFix = applyDeterministicSchemaFixes(files["SCHEMA.md"]);
  changes.push(...schemaFix.changes);

  // Cross-document terminology normalization
  const termFix = applyCrossDocumentTerminologyFixes(blueprint, {
    ...files,
    "TECH-STACK.md": normalizedTech,
    "SCHEMA.md": schemaFix.content,
  });
  changes.push(...termFix.changes);

  return {
    files: {
      ...files,
      "TECH-STACK.md": termFix.files["TECH-STACK.md"],
      "SCHEMA.md": termFix.files["SCHEMA.md"],
      "PRD.md": termFix.files["PRD.md"],
      "UI-UX.md": termFix.files["UI-UX.md"],
    },
    changes,
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

  const outputIsolationIssues = findDocumentOutputIsolationIssues(files);
  addCheck(
    checks,
    "document-output-isolation",
    "Isolasi output dokumen",
    outputIsolationIssues.length ? "failed" : "passed",
    outputIsolationIssues.length
      ? `Isolasi output gagal. Target terdampak: [${outputIsolationIssues.map((issue) => issue.file).join(", ")}]. ${outputIsolationIssues.map((issue) => `${issue.file}: ${issue.detail}`).join(" ")}`
      : "Setiap file dimulai dengan H1 yang tepat dan tidak memuat H1 dokumen lain.",
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
    "contract-enforcement",
    "Kontrak blueprint immutable",
    findContractEnforcementIssue(blueprint, files),
    "Role, lifecycle, fitur, integrasi, dan kebutuhan data tidak melampaui kontrak blueprint.",
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
    "schema-reference-integrity",
    "Referensi kolom SCHEMA valid",
    findSchemaReferenceIntegrityIssue(files),
    "Indeks dan foreign key hanya merujuk tabel serta kolom yang didefinisikan.",
  );
  addRepairCheck(
    checks,
    "security-feasibility",
    "Kontrol keamanan dapat diimplementasikan",
    findSecurityFeasibilityIssue(files),
    "Enkripsi, lookup unik, autentikasi, audit, dan privasi tidak saling bertentangan.",
  );
  addRepairCheck(
    checks,
    "auth-streaming-coherence",
    "Auth dan streaming koheren",
    findAuthStreamingCoherenceIssue(files),
    "Mekanisme auth, penyimpanan token, dan transport streaming dapat diimplementasikan tanpa kontradiksi.",
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
    if (check.id === "document-output-isolation") {
      const targets = check.detail.match(/Target terdampak:\s*\[([^\]]*)\]/i)?.[1] || "";
      for (const file of DOCUMENT_FILES) {
        if (targets.includes(file)) files.add(file);
      }
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
    if (["internal-leakage", "cross-document-terminology", "contract-enforcement", "requirement-schema-coverage", "permission-conflict"].includes(check.id)) {
      for (const file of Object.keys(DOCUMENT_LABELS) as FileName[]) {
        if (check.detail.includes(file)) files.add(file);
      }
    }
    if (["relationship-integrity", "schema-reference-integrity"].includes(check.id)) files.add("SCHEMA.md");
    if (check.id === "security-feasibility") {
      files.add("TECH-STACK.md");
      files.add("SCHEMA.md");
    }
    if (check.id === "auth-streaming-coherence") {
      files.add("TECH-STACK.md");
      files.add("SCHEMA.md");
    }
  }
  return DOCUMENTS_ORDER.filter((file) => files.has(file));
}

/**
 * Converts validation output to short product-language notes. Raw validation
 * details remain available only as focused AI context, never as UI copy.
 */
export function getUserFacingQualityNotes(report: QualityGateReport): UserFacingQualityNote[] {
  return report.checks
    // Warnings are informative only: they do not block the gate and should
    // not be presented as unfinished work or added to the bulk AI revision.
    .filter((check) => check.status === "failed" || check.status === "repair")
    .map((check) => {
      const copy = USER_FACING_NOTE_COPY[check.id] || {
        title: check.label,
        description: "Bagian ini perlu ditinjau agar dokumen proyek tetap selaras.",
      };
      const files = documentsNeedingQualityFix({ ...report, checks: [check] });
      const targetFiles = files.length ? files : DOCUMENTS_ORDER;
      return {
        id: check.id,
        title: copy.title,
        description: copy.description,
        files: targetFiles,
        actionInstruction: `Selaraskan ${copy.title.toLocaleLowerCase("id-ID")} pada ${targetFiles.join(", ")}. Perbarui hanya bagian yang terkait dan pertahankan struktur serta ketentuan proyek yang sudah ada.`,
        repairContext: check.detail,
      };
    });
}

const DOCUMENTS_ORDER: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];

// ─── Document Completeness & Truncation Detection ────────────────────────

/** Per-document minimum character thresholds. Based on typical output lengths. */
const DOCUMENT_MIN_LENGTH: Record<FileName, number> = {
  "PRD.md": 3000,
  "TECH-STACK.md": 2200,
  "UI-UX.md": 2000,
  "SCHEMA.md": 1800,
};

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
 * Enforces the file-boundary contract. A model may use earlier documents as
 * context, but the generated artifact must contain only its own document
 * title. This is deliberately strict because ZIP exports are consumed as
 * independent source files by downstream coding agents.
 */
export function validateDocumentOutputIsolation(
  file: FileName,
  content: string,
): CompletenessCheck {
  const trimmed = content.trim();
  const expectedTitle = `# ${file}`;
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() || "";
  const h1Titles = [...trimmed.matchAll(/^#[ \t]+(.+?)[ \t]*$/gm)]
    .map((match) => match[1].replace(/[*_`]/g, "").trim());
  const foreignDocumentTitles = h1Titles.filter((title) =>
    DOCUMENT_FILES.some((documentFile) => documentFile !== file && title === documentFile),
  );

  if (firstLine !== expectedTitle) {
    return {
      valid: false,
      code: "DOCUMENT_TITLE_INVALID",
      detail: `${file} harus dimulai tepat dengan "${expectedTitle}" sebagai satu-satunya H1.`,
    };
  }

  if (h1Titles.length !== 1 || h1Titles[0] !== file || foreignDocumentTitles.length > 0) {
    const foreign = foreignDocumentTitles.length ? ` H1 dokumen lain terdeteksi: ${foreignDocumentTitles.join(", ")}.` : "";
    return {
      valid: false,
      code: "DOCUMENT_OUTPUT_MIXED",
      detail: `${file} hanya boleh memiliki satu H1 tepat "${expectedTitle}".${foreign}`,
    };
  }

  return { valid: true, code: "OK", detail: "" };
}

export function findDocumentOutputIsolationIssues(files: GeneratedFiles): Array<{ file: FileName; detail: string }> {
  return DOCUMENT_FILES
    .map((file) => ({ file, check: validateDocumentOutputIsolation(file, files[file]) }))
    .filter(({ check }) => !check.valid)
    .map(({ file, check }) => ({ file, detail: check.detail }));
}

/**
 * Detect if text is truncated mid-content.
 * Conservative approach: only flag UNCLOSED CODE FENCES as definitive truncation.
 * Other patterns have too many false positives with normal markdown.
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
    "Security": ["security", "keamanan", "secure", "authentication", "autentikasi", "authorization", "otorisasi"],
    "Lifecycle": ["lifecycle", "siklus hidup", "state machine", "status flow"],
    "Audit": ["audit", "audit trail", "jejak audit", "logging", "log activity"],
    "Deployment": ["deployment", "deploy", "penerapan", "ci/cd", "pipeline", "hosting"],
    "Compatibility": ["compatibility", "kompatibilitas", "kompatibel", "backward compatible", "browser support"],
    "Version Policy": ["version policy", "kebijakan versi", "versioning", "api version"],
    "Assumption": ["assumption", "asumsi", "prerequisite", "prasyarat", "asumsi awal"],
    "Responsiv": ["responsiv", "responsive", "responsif", "mobile first", "adaptive"],
    "Index": ["index", "indeks", "indexes", "indexing", "pengindeksan", "performance index"],
    "Constraint": ["constraint", "constraints", "kendala", "batasan", "validasi", "validation rule"],
    "Entitas": ["entitas", "entity", "entities", "data model", "model data"],
    "Relasi": ["relasi", "relation", "relationships", "kardinalitas", "cardinality", "foreign key", "erd", "entity relationship"],
    "Ringkasan": ["ringkasan", "summary", "overview", "executive summary", "gambaran umum"],
    "Tujuan": ["tujuan", "goal", "objectives", "objective", "purpose", "visi", "misi"],
    "Fitur": ["fitur", "feature", "features", "functionality", "fungsionalitas", "capability"],
    "Stack": ["stack", "tech stack", "teknologi", "technologies", "framework", "library"],
    "API": ["api", "rest", "graphql", "endpoint", "web service", "restful"],
    "Alur": ["alur", "flow", "workflows", "workflow", "user journey", "user flow"],
    "Komponen": ["komponen", "component", "components", "ui component", "widget"],
    "Kriteria Penerimaan": ["kriteria penerimaan", "acceptance criteria", "kriteria keberhasilan", "definition of done"],
    "Scope": ["scope", "ruang lingkup", "boundaries", "batasan proyek"],
    "Design Token": ["design token", "design system", "style guide", "brand guideline"],
    "Wireframe": ["wireframe", "mockup", "prototype", "desain antarmuka"],
    "Desktop": ["desktop", "web", "browser", "desktop view"],
    "Mobile": ["mobile", "android", "ios", "responsive", "mobile view"],
    "Arsitektur": ["arsitektur", "architecture", "system design", "desain sistem"],
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

  // 1. Minimum length check (per-document threshold)
  const minLength = DOCUMENT_MIN_LENGTH[file] ?? 2000;
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

  // 3. File-boundary contract. Reject cross-document H1 contamination before
  // a document reaches repair, finalization, or ZIP export.
  const isolation = validateDocumentOutputIsolation(file, trimmed);
  if (!isolation.valid) return isolation;

  // 4. Required sections check
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
  const blueprintStatuses = canonicalStatusTerms(blueprint);

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
  const canonicalStatusNames = [...new Set([
    ...blueprint.applicationStatuses.map((status) => status.name),
    ...blueprint.entities.flatMap((entity) => entity.statuses ?? []),
    ...(blueprint.lifecycles || []).flatMap((lifecycle) => lifecycle.statuses),
  ])];
  const missing = canonicalStatusNames
    .filter((status) => !Object.values(files).some((document) => documentContains(document, status)));

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
