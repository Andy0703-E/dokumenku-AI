import type { BlueprintContract } from "./blueprint-quality";
import type { FileName, GeneratedFiles } from "./types";
import type { RevisionScope } from "./revision-impact";

const DOCUMENT_FOCUS: Record<FileName, string> = {
  "PRD.md": "masalah, tujuan, pengguna, kebutuhan fungsional, alur utama, kriteria penerimaan, serta batasan produk",
  "TECH-STACK.md": "pilihan teknologi, alasan pemilihan, arsitektur, API/integrasi, keamanan, pengujian, dan deployment",
  "UI-UX.md": "arah visual, struktur informasi, daftar layar, alur pengguna, komponen/interaksi, responsivitas, dan aksesibilitas",
  "SCHEMA.md": "entitas data, atribut penting, relasi, indeks, validasi, hak akses data, serta audit bila relevan",
};

const DOCUMENT_OUTLINES: Record<FileName, string[]> = {
  "PRD.md": ["Ringkasan produk dan masalah", "Tujuan, metrik keberhasilan, dan batasan", "Role, kebutuhan pengguna, dan permission", "Fitur dan user story", "Scope MVP, V1, dan Future", "Lifecycle, alur pengecualian, dan kriteria penerimaan", "Assumptions & Open Questions"],
  "TECH-STACK.md": ["Keputusan arsitektur", "Stack frontend, backend, database, serta alasannya", "Compatibility Check", "Version Policy", "Struktur aplikasi dan aliran data", "API dan integrasi", "Risk-Based Security & Domain Compliance", "Strategi pengujian, observabilitas, deployment, dan lingkungan"],
  "UI-UX.md": ["Prinsip desain dan design tokens", "Struktur informasi serta navigasi", "Role dan lifecycle state", "Textual Wireframe — Desktop", "Textual Wireframe — Mobile", "Alur pengguna, state kosong, loading, sukses, dan galat", "Komponen, interaksi, responsivitas, serta aksesibilitas"],
  "SCHEMA.md": ["Prinsip data dan daftar entitas", "ERD Mermaid", "Tabel, kolom, tipe data, kunci, serta validasi", "Relasi dan kardinalitas antarentitas", "Constraints, indeks, dan lifecycle data", "Hak akses, audit trail, retensi, dan keamanan data"],
};

/**
 * Documents are intentionally produced as a dependency chain. A later
 * document can use an earlier one to keep terminology and implementation
 * choices aligned, but must never return that context as part of its output.
 */
const READ_ONLY_CONTEXT_FILES: Record<FileName, FileName[]> = {
  "PRD.md": [],
  "TECH-STACK.md": ["PRD.md"],
  "UI-UX.md": ["PRD.md", "TECH-STACK.md"],
  "SCHEMA.md": ["PRD.md", "TECH-STACK.md", "UI-UX.md"],
};

function outputIsolationRules(file: FileName): string {
  const otherFiles = (Object.keys(READ_ONLY_CONTEXT_FILES) as FileName[])
    .filter((candidate) => candidate !== file);

  return `STRICT OUTPUT RULE:
- Output ONLY ${file}.
- The first non-empty line MUST be exactly: # ${file}
- There may be only ONE H1 document title, and it MUST be exactly: # ${file}
- Do not include an H1 for ${otherFiles.join(", ")}.
- Do not reproduce, quote wholesale, or append any context document.
- Do not wrap the output in a code fence or add conversational text.`;
}

function readOnlyContextPrompt(
  file: FileName,
  generatedFiles: Partial<GeneratedFiles> = {},
): string {
  const contextFiles = READ_ONLY_CONTEXT_FILES[file];
  if (!contextFiles.length) return "";

  const instruction = file === "TECH-STACK.md"
    ? "Generate TECH-STACK.md using PRD.md as READ-ONLY CONTEXT."
    : file === "UI-UX.md"
      ? "PRD.md and TECH-STACK.md are READ-ONLY CONTEXT. Generate ONLY UI-UX.md. Do not repeat or reproduce any context document."
      : "PRD.md, TECH-STACK.md, and UI-UX.md are READ-ONLY CONTEXT. Generate ONLY SCHEMA.md. Do not reproduce the context documents.";

  const documents = contextFiles
    .map((contextFile) => {
      const content = generatedFiles[contextFile]?.trim();
      return content
        ? `--- BEGIN READ-ONLY ${contextFile} ---\n${content}\n--- END READ-ONLY ${contextFile} ---`
        : `--- ${contextFile} is unavailable; do not invent its contents. ---`;
    })
    .join("\n\n");

  return `${instruction}\n\n${outputIsolationRules(file)}\n\nREAD-ONLY CONTEXT — use it only to preserve facts and terminology; never reproduce it in the result:\n\n${documents}`;
}

const TARGETED_REPAIR_SECTION_KEYWORDS: Record<FileName, string[]> = {
  "PRD.md": ["role", "permission", "fitur", "lifecycle", "alur", "kriteria", "asumsi"],
  "TECH-STACK.md": ["api", "integrasi", "security", "keamanan", "arsitektur"],
  "UI-UX.md": ["role", "lifecycle", "alur", "wireframe", "komponen", "aksesibilitas"],
  "SCHEMA.md": ["tabel", "relasi", "constraint", "index", "indeks", "lifecycle", "audit", "retensi"],
};

type MarkdownSection = {
  title: string;
  level: number;
  start: number;
  end: number;
  content: string;
};

function normalizeSectionTitle(value: string): string {
  return value
    .toLocaleLowerCase("id-ID")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function markdownSections(content: string): MarkdownSection[] {
  const matches = [...content.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm)];
  return matches.map((match, index) => {
    const level = match[1].length;
    const start = match.index || 0;
    const next = matches.slice(index + 1).find((candidate) => candidate[1].length <= level);
    const end = next?.index ?? content.length;
    return {
      title: match[2].replace(/[*_`]/g, "").trim(),
      level,
      start,
      end,
      content: content.slice(start, end).trim(),
    };
  });
}

export type TargetedRepairContext = {
  section: string;
  sectionTitles: string[];
};

/**
 * Extracts exact terms from related documents that must be used consistently.
 * Returns a compact reference string for the repair prompt.
 */
export function extractConsistentTerms(
  targetFile: FileName,
  relatedFiles: Partial<GeneratedFiles>,
  blueprint: BlueprintContract,
): string {
  const terms: string[] = [];

  // Canonical roles from blueprint
  const roleNames = blueprint.roles.map((r) => r.name);
  if (roleNames.length) {
    terms.push(`Role yang benar: ${roleNames.join(", ")}`);
  }

  // Canonical statuses from blueprint
  const statusNames = [
    ...blueprint.applicationStatuses.map((s) => s.name),
    ...(blueprint.lifecycles || []).flatMap((l) => l.statuses),
  ];
  const uniqueStatuses = [...new Set(statusNames)];
  if (uniqueStatuses.length) {
    terms.push(`Status lifecycle yang benar: ${uniqueStatuses.join(", ")}`);
  }

  // API base path from blueprint
  if (blueprint.apiBasePath) {
    terms.push(`Prefix API: ${blueprint.apiBasePath}`);
  }

  // Extract actual role usage from related documents
  for (const [file, content] of Object.entries(relatedFiles)) {
    if (file === targetFile || typeof content !== "string") continue;
    const roleMentions = content.match(/(?<=\*\*|##\s*|Role\s*:?\s*)[A-Z][a-zA-Z\s]+(?=\*\*|\s*[-:—])/g);
    if (roleMentions?.length) {
      const unique = [...new Set(roleMentions.map((r) => r.trim()))].slice(0, 5);
      terms.push(`Role di ${file}: ${unique.join(", ")}`);
    }
  }

  // Extract actual API endpoint patterns from TECH-STACK.md
  const techContent = relatedFiles["TECH-STACK.md"] || relatedFiles[targetFile];
  if (typeof techContent === "string" && targetFile !== "TECH-STACK.md") {
    const endpoints = techContent.match(/\/api\/v\d+\/[a-z-]+/gi);
    if (endpoints?.length) {
      const unique = [...new Set(endpoints.map((e) => e.split(/[?{(]/)[0]))].slice(0, 8);
      terms.push(`Endpoint di TECH-STACK.md: ${unique.join(", ")}`);
    }
  }

  return terms.length ? terms.join("\n") : "";
}

/** Selects only the affected Markdown sections, keeping repair prompts small. */
export function extractTargetedRepairContext(
  file: FileName,
  content: string,
  findings: string[],
): TargetedRepairContext {
  const sections = markdownSections(content);
  const findingHints = findings.join(" ").toLocaleLowerCase("id-ID");
  const matchesHints = (section: MarkdownSection, hints: string) => {
    const title = normalizeSectionTitle(section.title);
    return title.split(" ").some((word) => word.length >= 3 && hints.includes(word));
  };
  const directlyRelevant = sections.filter((section) => matchesHints(section, findingHints));
  const relevant = (directlyRelevant.length
    ? directlyRelevant
    : sections.filter((section) => matchesHints(section, TARGETED_REPAIR_SECTION_KEYWORDS[file].join(" ")))
  ).slice(0, 3);

  if (relevant.length) {
    return {
      section: relevant.map((section) => section.content).join("\n\n").slice(0, 6_000),
      sectionTitles: relevant.map((section) => section.title),
    };
  }

  return {
    section: content.slice(0, 6_000),
    sectionTitles: [],
  };
}

export function mergeTargetedRepairSections(
  document: string,
  replacement: string,
): string {
  const replacementSections = markdownSections(replacement);
  if (!replacementSections.length) return document;

  let merged = document;
  for (const section of replacementSections) {
    const targetTitle = normalizeSectionTitle(section.title);
    const target = markdownSections(merged).find((candidate) => normalizeSectionTitle(candidate.title) === targetTitle);
    if (target) {
      merged = `${merged.slice(0, target.start)}${section.content}\n${merged.slice(target.end).replace(/^\s*\n?/, "")}`;
    } else {
      merged = `${merged.trim()}\n\n${section.content}\n`;
    }
  }
  return merged.trim();
}

export function getTargetedRepairSystemPrompt(
  file: FileName,
  blueprint: BlueprintContract,
  context: TargetedRepairContext,
  findings: string[],
  relatedFiles?: Partial<GeneratedFiles>,
): string {
  const contract = {
    roles: blueprint.roles,
    entities: blueprint.entities,
    statuses: [
      ...blueprint.applicationStatuses,
      ...(blueprint.lifecycles || []).flatMap((lifecycle) => lifecycle.statuses.map((name) => ({ domain: lifecycle.domain, name }))),
    ],
    permissions: blueprint.permissions,
    features: blueprint.features,
    integrations: blueprint.integrations,
    businessRules: blueprint.businessRules || [],
    apiBasePath: blueprint.apiBasePath,
  };

  const relatedContext = Object.entries(relatedFiles || {})
    .filter(([relatedFile]) => relatedFile !== file)
    .filter(([, content]) => typeof content === "string" && content.trim().length > 0)
    .map(([relatedFile, content]) => `### ${relatedFile}\n${(content as string).slice(0, 4_000)}`)
    .join("\n\n");

  const consistentTerms = extractConsistentTerms(file, relatedFiles || {}, blueprint);
  const hasCrossDocFindings = findings.some((f) =>
    /lintas dokumen|seragam|selaras|istilah sama|ketentuan.*sama|belum seragam/i.test(f),
  );

  return `Perbaiki HANYA section Markdown berikut dari ${file}. Kembalikan HANYA section pengganti lengkap, termasuk heading yang sama. Jangan menulis pembuka, penutup, atau section lain.

Kontrak proyek yang tidak boleh diubah (JSON):

${JSON.stringify(contract, null, 2)}
${consistentTerms ? `\nIstilah WAJIB yang harus digunakan (jangan gunakan sinonim atau terjemahan):\n${consistentTerms}\n` : ""}
${relatedContext && hasCrossDocFindings ? `\nKonteks dokumen terkait (anda HARUS menggunakan istilah yang SAMA persis dari dokumen ini):\n\n${relatedContext}\n` : ""}

Temuan yang harus diselesaikan:
${findings.map((finding, index) => `${index + 1}. ${finding}`).join("\n")}

Section saat ini (Markdown):

${context.section}

Aturan ketat:
- Jangan menambah role, fitur, integrasi, status lifecycle, atau aturan bisnis baru.
- Jangan mengubah lifecycle atau fakta di luar kontrak.
- Jangan menulis ulang bagian dokumen lain.
- Selesaikan temuan di atas dengan istilah kontrak yang persis sama.
- GUNAKAN istilah dari "Istilah WAJIB" di atas. Contoh: jika role kanonis adalah "Admin Desa", jangan menulis "Admin" atau "Kepala Desa".
- Untuk endpoint API, gunakan prefix yang SAMA di seluruh dokumen (contoh: /api/v1/xxx).
- Salin persis nama role, status, dan endpoint dari dokumen terkait. Jangan menerjemahkan atau mengubah kapitalisasi.`;
}

/**
 * Fallback for providers that cannot return a section-only patch. The full
 * document is regenerated from the immutable contract and is accepted only
 * when it still passes the normal completeness check.
 */
export function getFullDocumentQualityRepairSystemPrompt(
  file: FileName,
  blueprint: BlueprintContract,
  existingContent: string,
  findings: string[],
  relatedFiles?: Partial<GeneratedFiles>,
): string {
  return `${getDocumentSystemPrompt(file, blueprint, relatedFiles)}

PERBAIKAN QUALITY GATE — instruksi ini wajib dipatuhi:
- Tulis ulang SELURUH ${file}, bukan patch atau ringkasan.
- Pertahankan struktur heading wajib dan detail yang masih sesuai kontrak.
- Hapus role, status lifecycle, integrasi, fitur, atau aturan bisnis bernama yang tidak ada di DATA PRODUK ACUAN.
- Jangan menambah asumsi sebagai keputusan sistem; tandai sebagai **Asumsi** bila benar-benar diperlukan.
- Kembalikan Markdown lengkap saja, tanpa blok kode pembungkus atau penjelasan. Terapkan STRICT OUTPUT RULE di atas, termasuk H1 tunggal # ${file}.

Temuan yang harus hilang setelah penulisan ulang:
${findings.map((finding, index) => `${index + 1}. ${finding}`).join("\n")}

Dokumen saat ini untuk dipertahankan bila masih sesuai kontrak:
${existingContent.slice(0, 12_000)}`;
}

/**
 * Creates a cross-document alignment prompt. After individual repairs,
 * this prompt sends ALL documents to the AI so it can align terminology,
 * roles, statuses, and endpoints across all files simultaneously.
 */
export function getAlignmentSystemPrompt(
  files: GeneratedFiles,
  blueprint: BlueprintContract,
  findings: string[],
): string {
  const contract = {
    roles: blueprint.roles,
    entities: blueprint.entities,
    statuses: [
      ...blueprint.applicationStatuses,
      ...(blueprint.lifecycles || []).flatMap((lifecycle) => lifecycle.statuses.map((name) => ({ domain: lifecycle.domain, name }))),
    ],
    apiBasePath: blueprint.apiBasePath,
  };

  const roleNames = blueprint.roles.map((r) => r.name).join(", ");
  const statusNames = [
    ...blueprint.applicationStatuses.map((s) => s.name),
    ...(blueprint.lifecycles || []).flatMap((l) => l.statuses),
  ];
  const uniqueStatuses = [...new Set(statusNames)].join(", ");

  return `Anda adalah solution architect senior. Tugas Anda: SELARASKAN istilah lintas keempat dokumen berikut agar konsisten.

KEMBALIKAN HANYA JSON valid dengan format:
{
  "PRD.md": "isi lengkap PRD.md yang sudah diselaraskan",
  "TECH-STACK.md": "isi lengkap TECH-STACK.md yang sudah diselaraskan",
  "UI-UX.md": "isi lengkap UI-UX.md yang sudah diselaraskan",
  "SCHEMA.md": "isi lengkap SCHEMA.md yang sudah diselaraskan"
}

Kontrak proyek (JSON):
${JSON.stringify(contract, null, 2)}

Istilah WAJIB yang harus digunakan secara KONSISTEN di keempat dokumen:
- Role: ${roleNames}
- Status lifecycle: ${uniqueStatuses}
- Prefix API: ${blueprint.apiBasePath || "/api/v1"}

Temuan yang harus diselesaikan:
${findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}

PRD.md:
${files["PRD.md"].slice(0, 6_000)}

TECH-STACK.md:
${files["TECH-STACK.md"].slice(0, 6_000)}

UI-UX.md:
${files["UI-UX.md"].slice(0, 6_000)}

SCHEMA.md:
${files["SCHEMA.md"].slice(0, 6_000)}

Aturan ketat:
- GUNAKAN nama role, status, dan endpoint yang SAMA persis di keempat dokumen.
- Jangan menambah role, fitur, integrasi, atau aturan bisnis baru.
- Jangan mengubah lifecycle atau fakta di luar kontrak.
- Fokus HANYA pada menyelaraskan istilah yang berbeda antar dokumen.
- Pertahankan struktur dan konten setiap dokumen. Hanya ubah istilah yang tidak konsisten.
- Kembalikan JSON dengan isi lengkap keempat dokumen.`;
}

export function getBlueprintSystemPrompt(): string {
  return `Anda adalah solution architect senior. Buat SATU kontrak internal kanonis untuk sebuah produk digital berdasarkan brief pengguna.

Keluarkan HANYA JSON valid tanpa Markdown, tanpa komentar, dan tanpa teks pembuka/penutup. Gunakan struktur tepat berikut:
{
  "version": "1.0",
  "projectSummary": "",
  "roles": [{ "id": "", "name": "", "description": "" }],
  "entities": [{ "name": "", "description": "", "statuses": [] }],
  "applicationStatuses": [{ "domain": "", "name": "", "description": "" }],
  "lifecycles": [{ "domain": "", "statuses": [""], "transitions": [{ "from": "", "to": "", "actor": "", "condition": "" }] }],
  "permissions": { "Nama Role": ["izin konkret"] },
  "features": [{ "id": "", "name": "", "phase": "MVP", "roles": [], "entities": [] }],
  "integrations": [],
  "businessRules": [],
  "deployment": { "frontend": "", "backend": "", "database": "", "environment": "" },
  "securityRequirements": [],
  "designTokens": { "colorPrimary": "", "colorAccent": "", "font": "", "radius": "", "spacing": "" },
  "assumptions": [],
  "openQuestions": [],
  "versionPolicy": [],
  "complianceRequirements": [],
  "apiBasePath": "/api/v1"
}

Aturan kontrak:
- Tulis dalam Bahasa Indonesia. Isi semua array yang relevan; jangan gunakan placeholder kosong.
- Fase fitur hanya boleh MVP, V1, atau FUTURE. MVP adalah nilai minimum yang benar-benar harus dirilis dulu.
- Setiap role dan entitas harus unik. Referensi roles/entities pada fitur dan permissions harus memakai nama yang ada di array utama. Aktor transisi lifecycle dapat berupa role yang terdaftar atau aktor sistem/otomatis (seperti 'Sistem', 'Cron', 'Webhook').
- Lifecycle status harus eksplisit bila produk memiliki status proses, verifikasi, pembayaran, persetujuan, atau publikasi.
- Jika terdapat lebih dari satu lifecycle (misalnya pesanan dan pembayaran), tiap lifecycle harus memiliki domain serta transisi status yang eksplisit.
- Masukkan aturan keputusan, pembatalan, stok, perhitungan, dan pengecualian yang memengaruhi implementasi ke businessRules. Dokumen turunan tidak boleh mengubah atau menambah aturan tersebut.
- Tentukan security dan compliance berdasarkan risiko domain nyata; jangan menulis klaim generik.
- Pilih teknologi yang kompatibel dan jelaskan kebijakan versi pada versionPolicy, tetapi jangan mengarang integrasi/fitur yang tidak tersirat dari brief.
- Jika proyek memakai API HTTP, tetapkan satu apiBasePath kanonis (misalnya "/api/v1"). Seluruh endpoint di TECH-STACK.md harus mengikuti nilai ini; jangan gunakan nilai tersebut untuk mengubah endpoint legacy atau migrasi yang secara eksplisit diberi label.`;
}

export function getBlueprintRecoveryPrompt(): string {
  return `Keluarkan HANYA satu objek JSON valid tanpa Markdown, tanpa komentar, dan tanpa teks lain. Buat kontrak produk yang ringkas dari brief pengguna dengan bentuk tepat ini:
{
  "projectSummary": "ringkasan produk",
  "roles": [{ "name": "Nama role" }],
  "entities": [{ "name": "Nama entitas" }],
  "applicationStatuses": [{ "domain": "nama proses", "name": "NAMA_STATUS" }],
  "permissions": { "Nama role": ["izin konkret"] },
  "features": [{ "name": "Nama fitur", "phase": "MVP", "roles": ["Nama role"], "entities": ["Nama entitas"] }]
}

Aturan penting: semua nama role atau entitas yang dirujuk harus sama persis dengan array utama. Fase hanya MVP, V1, atau FUTURE. Minimal isi satu role, satu entitas, dan satu fitur. Jangan gunakan trailing comma.`;
}

export function getDocumentSystemPrompt(
  file: FileName,
  blueprint: BlueprintContract,
  generatedFiles: Partial<GeneratedFiles> = {},
): string {
  const outline = DOCUMENT_OUTLINES[file].map((item) => `- ${item}`).join("\n");
  const canonicalBlueprint = JSON.stringify(blueprint, null, 2);
  const readOnlyContext = readOnlyContextPrompt(file, generatedFiles);
  return `Anda adalah product manager dan solution architect senior. Buat HANYA isi lengkap dokumen Markdown bernama ${file} berdasarkan brief pengguna.

${outputIsolationRules(file)}

Fokus dokumen ini: ${DOCUMENT_FOCUS[file]}.

DATA PRODUK ACUAN — gunakan hanya untuk menyusun dokumen, jangan dikutip atau dijelaskan di hasil:

\`\`\`json
${canonicalBlueprint}
\`\`\`

Gunakan data acuan tersebut secara konsisten pada keempat dokumen. Jangan menciptakan role, entitas, status lifecycle, permission, fitur, integrasi, atau fakta arsitektur baru yang bertentangan dengannya. Jika perlu penjelasan tambahan, taruh sebagai asumsi atau pertanyaan terbuka yang konsisten dengan data produk.

Aturan:
- Tulis dalam Bahasa Indonesia yang konkret dan dapat langsung dipakai tim produk serta engineering.
- Gunakan heading, bullet, dan tabel Markdown bila membantu. Ini harus berupa dokumen lengkap, bukan jawaban singkat atau daftar ide.
- Gunakan semua bagian berikut sebagai heading atau subheading, dengan detail spesifik terhadap brief:
${outline}
- Targetkan sekitar 700–1.000 kata. Jika brief belum menyebut suatu detail, buat asumsi yang aman dan tandai sebagai "Asumsi"; jangan menghilangkan bagian tersebut.
- Wajib gunakan istilah heading yang tercantum di atas agar struktur dokumen dapat divalidasi.
- Dokumen adalah artefak untuk pengguna akhir. Jangan pernah menyebut proses pembuatannya, provider, model, routing, recovery, fallback, blueprint, atau metadata/petunjuk internal lainnya.
- Gunakan satu istilah yang sama untuk setiap role, entity, state, flag, dan endpoint di seluruh dokumen. Jangan menyebut flag peninjauan sebagai status lifecycle; setiap flag atau state yang penting harus memiliki representasi penyimpanan yang jelas pada schema.
- DATA PRODUK ACUAN adalah kontrak yang tidak boleh diubah oleh dokumen ini: jangan memperkenalkan role, status, fitur, integrasi, atau aturan bisnis bernama baru. Jika detail non-kritis belum tercatat di kontrak, tulis sebagai **Asumsi** atau **Open Question**, bukan sebagai keputusan sistem.
- Hak keputusan final hanya boleh dimiliki oleh role yang dinyatakan sebagai approver final. Role lain dapat menyiapkan data atau rekomendasi, tetapi tidak boleh diberi endpoint maupun izin yang melewati keputusan final.
- Khusus TECH-STACK.md: Compatibility Check harus memeriksa kecocokan arsitektur, integrasi, deployment, dan skala; Version Policy harus menyatakan cara mengunci/menaikkan versi dependency. Risk-Based Security & Domain Compliance harus berdasarkan risiko domain produk.
- Khusus TECH-STACK.md: semua endpoint harus memakai prefix API yang sama. Jika identitas sensitif dienkripsi dan perlu unik/dicari, jelaskan ciphertext plus lookup token hash/HMAC yang diindeks unik, bukan UNIQUE pada ciphertext.
- Khusus UI-UX.md: kedua bagian Textual Wireframe harus menulis tata letak layar dalam teks/ASCII yang jelas untuk Desktop dan Mobile, termasuk state penting.
- Khusus SCHEMA.md: sertakan satu blok Mermaid dengan kata awal \`erDiagram\`, tabel lengkap, serta constraint eksplisit (misalnya PK, FK, UNIQUE, CHECK, NOT NULL) untuk entitas yang relevan. Jangan menggabungkan atau menghilangkan heading **Relasi**, **Constraint**, **Index**, **Lifecycle**, **Audit**, dan **Retention**; masing-masing harus memiliki penjelasan sendiri, termasuk bila hanya berisi asumsi atau kebijakan. Keputusan bisnis yang dapat terjadi berkali-kali dalam satu proses harus memiliki relasi/FK ke record yang diputuskan.
- Khusus PRD.md: Scope MVP, V1, dan Future harus dibedakan tegas. Bagian Assumptions & Open Questions menjadi sumber terpusat bagi asumsi/pertanyaan dokumen.
- Khusus TECH-STACK.md: tetapkan SATU rancangan autentikasi kanonis. Untuk Login/Register, pilih Credentials dengan password_hash yang kuat (misalnya Argon2id) ATAU Auth.js dengan adapter tabel accounts/sessions yang lengkap; jangan menyebut Auth.js tanpa menjelaskan strategi yang dipilih. Jangan memperlakukan cookie sesi, access JWT, dan refresh token sebagai mekanisme yang saling menggantikan. Bila token/sesi perlu disimpan, jelaskan penyimpanan hash, kedaluwarsa, dan pencabutan; jangan menaruh bearer token pada URL stream. Untuk EventSource/SSE di browser, gunakan cookie sesi HttpOnly atau mekanisme yang benar-benar bisa dikirim browser; EventSource tidak dapat mengirim header Authorization kustom.
- Khusus TECH-STACK.md: bila PRD memerlukan search conversation, tentukan strategi database yang konkret (misalnya PostgreSQL full-text atau pg_trgm) dan indeks yang dibutuhkan untuk title serta content. Untuk setiap alur streaming, pilih transport yang jelas dan konsisten (misalnya SSE atau WebSocket), otorisasi sebelum stream dibuka, serta jelaskan reconnect/cursor atau idempotensi bila relevan. Retry otomatis hanya boleh sebelum token pertama; untuk HTTP 429 patuhi Retry-After; jangan memulai request AI kedua setelah output parsial diterima. Bedakan first-token timeout, stream idle timeout, dan total generation timeout.
- Khusus SCHEMA.md: struktur auth harus mengikuti TECH-STACK.md. Jika sesi atau refresh token dipersistenkan, simpan hanya hash/token lookup yang aman beserta expiry, revocation, dan audit; jangan simpan bearer/access token mentah. Jika auth stateless tanpa penyimpanan sesi, jangan mendefinisikan tabel sesi sebagai mekanisme autentikasi aktif. Foreign key dengan ON DELETE SET NULL harus menunjuk kolom nullable; gunakan RESTRICT/CASCADE bila kolom wajib NOT NULL. Setiap relasi ERD harus didukung FK atau junction table; jangan tulis self-reference N:M tanpa relasi nyata. Hindari boolean yang menduplikasi enum status kecuali perannya berbeda secara eksplisit.
- Jangan menulis pembuka percakapan, penutup, blok kode pembungkus, atau marker seperti <<<FILE:...>>>.

${readOnlyContext}`;
}

export function getRevisionSystemPrompt(
  file: FileName,
  existingContent: string,
  revisionComment: string,
  options: {
    scope?: RevisionScope;
    relatedFiles?: Partial<GeneratedFiles>;
    reviewContext?: string;
    blueprint?: BlueprintContract | null;
  } = {},
): string {
  const relatedContext = Object.entries(options.relatedFiles || {})
    .filter(([relatedFile]) => relatedFile !== file)
    .map(([relatedFile, content]) => `### ${relatedFile}\n${content.slice(0, 5_000)}`)
    .join("\n\n");
  const scopeInstruction = options.scope === "related"
    ? "Dokumen ini adalah salah satu dokumen terdampak. Selaraskan istilah, role, status, permission, endpoint, dan data dengan dokumen terkait tanpa mengarang fakta baru."
    : "Revisi hanya dokumen ini. Jangan membuat klaim lintas dokumen baru dan pertahankan istilah serta fakta yang sudah ada pada dokumen terkait.";
  const reviewContext = options.reviewContext?.trim();
  const revisionContract = options.blueprint
    ? JSON.stringify({
        roles: options.blueprint.roles.map((role) => role.name),
        entities: options.blueprint.entities.map((entity) => entity.name),
        statuses: options.blueprint.applicationStatuses.map((status) => ({
          domain: status.domain,
          name: status.name,
        })),
        lifecycles: (options.blueprint.lifecycles || []).map((lifecycle) => ({
          domain: lifecycle.domain,
          statuses: lifecycle.statuses,
        })),
        features: options.blueprint.features.map((feature) => ({
          name: feature.name,
          phase: feature.phase,
          roles: feature.roles || [],
          entities: feature.entities || [],
        })),
        integrations: options.blueprint.integrations,
        apiBasePath: options.blueprint.apiBasePath || "/api/v1",
      }, null, 2)
    : "";

  return `Anda adalah product manager dan solution architect senior. Tugas Anda adalah merevisi dan memperbarui dokumen Markdown bernama ${file} sesuai instruksi atau komentar revisi dari pengguna.

Dokumen saat ini:
\`\`\`markdown
${existingContent}
\`\`\`

Instruksi / Komentar Revisi dari Pengguna:
"${revisionComment}"

${reviewContext ? `Catatan pemeriksaan untuk memfokuskan revisi (jangan ditulis, dikutip, atau disebutkan pada dokumen hasil):\n${reviewContext}` : ""}

${revisionContract ? `Kontrak blueprint proyek yang wajib dipatuhi (jangan ditulis, dikutip, atau disebutkan pada dokumen hasil):\n\`\`\`json\n${revisionContract}\n\`\`\`` : ""}

${relatedContext ? `Dokumen terkait sebagai referensi konsistensi (jangan dikutip mentah):\n${relatedContext}` : ""}

Aturan:
- Perbarui dokumen secara menyeluruh dengan menerapkan revisi yang diminta.
- Pertahankan struktur dokumen yang sudah rapi, jangan menghilangkan bagian penting yang tidak diminta diubah.
- Output HANYA ${file}. Baris tidak-kosong pertama harus tepat \`# ${file}\`, dan ini adalah satu-satunya H1. Jangan menulis H1 untuk PRD.md, TECH-STACK.md, UI-UX.md, atau SCHEMA.md yang bukan target.
- ${scopeInstruction}
- Bila catatan pemeriksaan menyebut role, status, fitur, integrasi, endpoint, atau entitas yang tidak sesuai, gunakan hanya istilah dalam kontrak blueprint di atas. Hapus atau ganti istilah lama yang berada di luar kontrak; jangan mempertahankannya hanya karena ada pada dokumen saat ini.
- Tulis dalam Bahasa Indonesia standar profesional, terstruktur, dan siap pakai.
- Jangan menulis pembuka percakapan, penutup, atau blok kode pembungkus. Tulis HANYA konten Markdown dokumen hasil revisi.`;
}
