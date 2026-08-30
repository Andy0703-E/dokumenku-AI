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

export function getBlueprintSystemPrompt(): string {
  return `Anda adalah solution architect senior. Buat SATU kontrak internal kanonis untuk sebuah produk digital berdasarkan brief pengguna.

Keluarkan HANYA JSON valid tanpa Markdown, tanpa komentar, dan tanpa teks pembuka/penutup. Gunakan struktur tepat berikut:
{
  "version": "1.0",
  "projectSummary": "",
  "roles": [{ "id": "", "name": "", "description": "" }],
  "entities": [{ "name": "", "description": "", "statuses": [] }],
  "applicationStatuses": [{ "domain": "", "name": "", "description": "" }],
  "permissions": { "Nama Role": ["izin konkret"] },
  "features": [{ "id": "", "name": "", "phase": "MVP", "roles": [], "entities": [] }],
  "integrations": [],
  "deployment": { "frontend": "", "backend": "", "database": "", "environment": "" },
  "securityRequirements": [],
  "designTokens": { "colorPrimary": "", "colorAccent": "", "font": "", "radius": "", "spacing": "" },
  "assumptions": [],
  "openQuestions": [],
  "versionPolicy": [],
  "complianceRequirements": []
}

Aturan kontrak:
- Tulis dalam Bahasa Indonesia. Isi semua array yang relevan; jangan gunakan placeholder kosong.
- Fase fitur hanya boleh MVP, V1, atau FUTURE. MVP adalah nilai minimum yang benar-benar harus dirilis dulu.
- Setiap role dan entitas harus unik. Referensi roles/entities pada fitur dan permissions harus memakai nama yang ada di array utama.
- Lifecycle status harus eksplisit bila produk memiliki status proses, verifikasi, pembayaran, persetujuan, atau publikasi.
- Tentukan security dan compliance berdasarkan risiko domain nyata; jangan menulis klaim generik.
- Pilih teknologi yang kompatibel dan jelaskan kebijakan versi pada versionPolicy, tetapi jangan mengarang integrasi/fitur yang tidak tersirat dari brief.`;
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

export function getDocumentSystemPrompt(file: FileName, blueprint: BlueprintContract): string {
  const outline = DOCUMENT_OUTLINES[file].map((item) => `- ${item}`).join("\n");
  const canonicalBlueprint = JSON.stringify(blueprint, null, 2);
  return `Anda adalah product manager dan solution architect senior. Buat HANYA isi lengkap dokumen Markdown bernama ${file} berdasarkan brief pengguna.

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
- Hak keputusan final hanya boleh dimiliki oleh role yang dinyatakan sebagai approver final. Role lain dapat menyiapkan data atau rekomendasi, tetapi tidak boleh diberi endpoint maupun izin yang melewati keputusan final.
- Khusus TECH-STACK.md: Compatibility Check harus memeriksa kecocokan arsitektur, integrasi, deployment, dan skala; Version Policy harus menyatakan cara mengunci/menaikkan versi dependency. Risk-Based Security & Domain Compliance harus berdasarkan risiko domain produk.
- Khusus TECH-STACK.md: semua endpoint harus memakai prefix API yang sama. Jika identitas sensitif dienkripsi dan perlu unik/dicari, jelaskan ciphertext plus lookup token hash/HMAC yang diindeks unik, bukan UNIQUE pada ciphertext.
- Khusus UI-UX.md: kedua bagian Textual Wireframe harus menulis tata letak layar dalam teks/ASCII yang jelas untuk Desktop dan Mobile, termasuk state penting.
- Khusus SCHEMA.md: sertakan satu blok Mermaid dengan kata awal \`erDiagram\`, tabel lengkap, serta constraint eksplisit (misalnya PK, FK, UNIQUE, CHECK, NOT NULL) untuk entitas yang relevan. Keputusan bisnis yang dapat terjadi berkali-kali dalam satu proses harus memiliki relasi/FK ke record yang diputuskan.
- Khusus PRD.md: Scope MVP, V1, dan Future harus dibedakan tegas. Bagian Assumptions & Open Questions menjadi sumber terpusat bagi asumsi/pertanyaan dokumen.
- Jangan menulis pembuka percakapan, penutup, blok kode pembungkus, atau marker seperti <<<FILE:...>>>.`;
}

export function getRevisionSystemPrompt(
  file: FileName,
  existingContent: string,
  revisionComment: string,
  options: {
    scope?: RevisionScope;
    relatedFiles?: Partial<GeneratedFiles>;
  } = {},
): string {
  const relatedContext = Object.entries(options.relatedFiles || {})
    .filter(([relatedFile]) => relatedFile !== file)
    .map(([relatedFile, content]) => `### ${relatedFile}\n${content.slice(0, 5_000)}`)
    .join("\n\n");
  const scopeInstruction = options.scope === "related"
    ? "Dokumen ini adalah salah satu dokumen terdampak. Selaraskan istilah, role, status, permission, endpoint, dan data dengan dokumen terkait tanpa mengarang fakta baru."
    : "Revisi hanya dokumen ini. Jangan membuat klaim lintas dokumen baru dan pertahankan istilah serta fakta yang sudah ada pada dokumen terkait.";

  return `Anda adalah product manager dan solution architect senior. Tugas Anda adalah merevisi dan memperbarui dokumen Markdown bernama ${file} sesuai instruksi atau komentar revisi dari pengguna.

Dokumen saat ini:
\`\`\`markdown
${existingContent}
\`\`\`

Instruksi / Komentar Revisi dari Pengguna:
"${revisionComment}"

${relatedContext ? `Dokumen terkait sebagai referensi konsistensi (jangan dikutip mentah):\n${relatedContext}` : ""}

Aturan:
- Perbarui dokumen secara menyeluruh dengan menerapkan revisi yang diminta.
- Pertahankan struktur dokumen yang sudah rapi, jangan menghilangkan bagian penting yang tidak diminta diubah.
- ${scopeInstruction}
- Tulis dalam Bahasa Indonesia standar profesional, terstruktur, dan siap pakai.
- Jangan menulis pembuka percakapan, penutup, atau blok kode pembungkus. Tulis HANYA konten Markdown dokumen hasil revisi.`;
}
