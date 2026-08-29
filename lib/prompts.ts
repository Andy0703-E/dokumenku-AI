import type { FileName } from "./types";

const DOCUMENT_FOCUS: Record<FileName, string> = {
  "PRD.md": "masalah, tujuan, pengguna, kebutuhan fungsional, alur utama, kriteria penerimaan, serta batasan produk",
  "TECH-STACK.md": "pilihan teknologi, alasan pemilihan, arsitektur, API/integrasi, keamanan, pengujian, dan deployment",
  "UI-UX.md": "arah visual, struktur informasi, daftar layar, alur pengguna, komponen/interaksi, responsivitas, dan aksesibilitas",
  "SCHEMA.md": "entitas data, atribut penting, relasi, indeks, validasi, hak akses data, serta audit bila relevan",
};

const DOCUMENT_OUTLINES: Record<FileName, string[]> = {
  "PRD.md": ["Ringkasan produk dan masalah", "Tujuan, metrik keberhasilan, dan batasan", "Pengguna utama dan kebutuhan", "User story dan kebutuhan fungsional", "Alur pengguna serta kondisi pengecualian", "Kriteria penerimaan, kebutuhan nonfungsional, dan risiko"],
  "TECH-STACK.md": ["Keputusan arsitektur", "Stack frontend, backend, database, serta alasannya", "Struktur aplikasi dan aliran data", "API, integrasi, keamanan, dan privasi", "Strategi pengujian, observabilitas, deployment, dan lingkungan"],
  "UI-UX.md": ["Prinsip desain dan arah visual", "Struktur informasi serta navigasi", "Daftar layar beserta tujuan dan isi", "Alur pengguna, state kosong, loading, sukses, dan galat", "Komponen, interaksi, responsivitas, serta aksesibilitas"],
  "SCHEMA.md": ["Prinsip data dan daftar entitas", "Atribut, tipe data, kunci, serta validasi", "Relasi dan kardinalitas antarentitas", "Indeks, constraint, lifecycle data, dan query penting", "Hak akses, audit trail, retensi, dan keamanan data"],
};

export function getDocumentSystemPrompt(file: FileName): string {
  const outline = DOCUMENT_OUTLINES[file].map((item) => `- ${item}`).join("\n");
  return `Anda adalah product manager dan solution architect senior. Buat HANYA isi lengkap dokumen Markdown bernama ${file} berdasarkan brief pengguna.

Fokus dokumen ini: ${DOCUMENT_FOCUS[file]}.

Aturan:
- Tulis dalam Bahasa Indonesia yang konkret dan dapat langsung dipakai tim produk serta engineering.
- Gunakan heading, bullet, dan tabel Markdown bila membantu. Ini harus berupa dokumen lengkap, bukan jawaban singkat atau daftar ide.
- Gunakan semua bagian berikut sebagai heading atau subheading, dengan detail spesifik terhadap brief:
${outline}
- Targetkan sekitar 700–1.000 kata. Jika brief belum menyebut suatu detail, buat asumsi yang aman dan tandai sebagai "Asumsi"; jangan menghilangkan bagian tersebut.
- Jangan menulis pembuka percakapan, penutup, blok kode pembungkus, atau marker seperti <<<FILE:...>>>.`;
}

export function getRevisionSystemPrompt(file: FileName, existingContent: string, revisionComment: string): string {
  return `Anda adalah product manager dan solution architect senior. Tugas Anda adalah merevisi dan memperbarui dokumen Markdown bernama ${file} sesuai instruksi atau komentar revisi dari pengguna.

Dokumen saat ini:
\`\`\`markdown
${existingContent}
\`\`\`

Instruksi / Komentar Revisi dari Pengguna:
"${revisionComment}"

Aturan:
- Perbarui dokumen secara menyeluruh dengan menerapkan revisi yang diminta.
- Pertahankan struktur dokumen yang sudah rapi, jangan menghilangkan bagian penting yang tidak diminta diubah.
- Tulis dalam Bahasa Indonesia standar profesional, terstruktur, dan siap pakai.
- Jangan menulis pembuka percakapan, penutup, atau blok kode pembungkus. Tulis HANYA konten Markdown dokumen hasil revisi.`;
}
