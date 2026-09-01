import type { GeneratedFiles } from "./types";

/**
 * Checks whether all 4 core specification documents have non-empty content.
 */
export function hasAllDocumentsReady(files: GeneratedFiles): boolean {
  if (!files) return false;
  const prd = files["PRD.md"]?.trim();
  const tech = files["TECH-STACK.md"]?.trim();
  const uiux = files["UI-UX.md"]?.trim();
  const schema = files["SCHEMA.md"]?.trim();
  return Boolean(prd && tech && uiux && schema);
}

/**
 * Generates an end-to-end master prompt for AI coding agents (Cursor, Claude Code,
 * Windsurf, Copilot, Lovable, v0, Bolt.new). The four specifications are
 * shipped beside this file in the ZIP, so this prompt references them rather
 * than duplicating their full contents into the coding agent context.
 */
export function generateVibeCoderPrompt(
  files: GeneratedFiles,
  projectName?: string,
): string {
  const cleanProjectName = projectName?.trim() || "Aplikasi";
  const documentsReady = hasAllDocumentsReady(files);

  return `# MASTER PROMPT VIBECODER: IMPLEMENTASI PENUH PROYEK ${cleanProjectName.toUpperCase()}

Anda bertindak sebagai **Senior Principal Software Architect & Lead Full-Stack Developer**.
Tugas Anda adalah mengimplementasikan aplikasi **${cleanProjectName}** secara lengkap, terstruktur, fungsional, dan siap produksi (production-ready) dari awal hingga akhir.

---

## SUMBER SPESIFIKASI OTORITATIF

Keempat file berikut berada di direktori yang sama dengan prompt ini dan WAJIB dibaca sebelum menulis kode:

- \`PRD.md\` — fitur, role, alur, acceptance criteria, dan scope.
- \`TECH-STACK.md\` — arsitektur, API, auth, streaming, keamanan, dan deployment.
- \`UI-UX.md\` — design tokens, navigasi, wireframe, state UI, dan aksesibilitas.
- \`SCHEMA.md\` — tabel, tipe data, constraint, relasi, indeks, retensi, dan audit.

File tersebut adalah sumber kebenaran. Jangan menyalin ulang isi ke prompt, jangan mengurangi constraint-nya, dan jangan membuat keputusan yang bertentangan. ${documentsReady ? "Semua empat dokumen sudah tersedia." : "Jika ada file yang hilang, berhenti dan minta dokumen tersebut sebelum melanjutkan."}

Urutan prioritas bila ada konflik: **SCHEMA.md** untuk kontrak data, **TECH-STACK.md** untuk kontrak implementasi, **PRD.md** untuk aturan dan scope produk, lalu **UI-UX.md** untuk perilaku antarmuka. Laporkan konflik yang tidak dapat diselesaikan dari empat sumber tersebut sebelum mengimplementasikannya.

---

## ATURAN IMPLEMENTASI

- Tulis kode utuh, modular, typed, dan siap produksi. Jangan meninggalkan placeholder atau TODO sebagai pengganti implementasi.
- Terapkan constraint schema melalui migration, validasi input, parameterized query, dan tipe aplikasi yang selaras.
- Terapkan autentikasi/otorisasi sesuai strategi yang dipilih pada TECH-STACK.md serta RBAC pada setiap endpoint dan halaman privat.
- Tangani loading, empty, error, success, retry, aksesibilitas, dan responsivitas yang diwajibkan UI-UX.md.
- Untuk alur AI streaming, jangan retry setelah output parsial diterima. Terapkan timeout dan error handling sesuai TECH-STACK.md.
- Tambahkan test untuk aturan bisnis, authorization, lifecycle, dan edge case yang memiliki acceptance criteria.

---

## 🚀 ROADMAP EKSEKUSI BERTAHAP (VIBE-CODING EXECUTION PLAN)

Lakukan pengerjaan secara bertahap sesuai alur berikut:

### FASE 1: Project Scaffolding & Setup Lingkungan
- Setup repository dan struktur direktori sesuai panduan di \`TECH-STACK.md\`.
- Konfigurasi dependensi \`package.json\`, TypeScript (\`tsconfig.json\`), dan styling/Tailwind config.
- Buat file \`.env.example\` dengan seluruh variabel lingkungan yang diperlukan (DB URI, Auth Secret, API keys).

### FASE 2: Database Layer & ORM Modeling
- Buat file schema database (ORM/Prisma/Drizzle/SQL) berdasarkan seluruh definisi di \`SCHEMA.md\`.
- Siapkan migration script dan file seed data awal untuk akun pengujian default dan data master.
- Implementasikan database client helper / connection pooling.

### FASE 3: Backend API, Authentication & Business Rules
- Implementasikan sistem autentikasi (Login, Register, Session/JWT) dan middleware RBAC sesuai role di \`PRD.md\`.
- Buat API routes untuk seluruh endpoint yang terdaftar di \`TECH-STACK.md\`.
- Implementasikan state machine / lifecycle transitions pada entitas utama (misal: alur transaksi, status pesanan, pembayaran).

### FASE 4: Frontend Layout, Design System & UI Components
- Konfigurasi theme tokens (warna primer, aksen, font, border radius) sesuai \`UI-UX.md\`.
- Buat reusable components (Button, Input, Modal, Card, Table, Badge, Form) dan layout shell (Navbar, Sidebar, Footer).
- Bangun halaman-halaman utama dan wireframe yang didefinisikan pada \`UI-UX.md\`.

### FASE 5: Integrasi Full-Stack & State Management
- Hubungkan setiap halaman frontend ke API endpoint backend.
- Tambahkan feedback interaktif pengguna: toast notification, alert konfirmasi, dan skeleton loading.
- Pastikan responsive mobile-first / desktop layout berfungsi mulus.

### FASE 6: Validasi & Edge-Case Testing
- Lakukan pengecekan terhadap semua kriteria penerimaan (*Acceptance Criteria*) di \`PRD.md\`.
- Pastikan tidak ada runtime crash, missing types, dead links, pelanggaran RBAC, atau constraint schema yang tidak dapat diterapkan.

---

## DEFINITION OF DONE

- Seluruh fitur MVP dan acceptance criteria pada PRD.md dapat diuji.
- Database memiliki migration yang dapat dijalankan, semua FK/index/constraint valid, dan lifecycle tidak dapat dilanggar.
- API, auth, search, dan streaming mengikuti TECH-STACK.md tanpa kontradiksi semantik.
- UI memenuhi wireframe, state, design token, responsivitas, dan aksesibilitas pada UI-UX.md.
- Test relevan lulus, build berhasil, dan tidak ada data sensitif atau secret di source control.

Mulailah dari **FASE 1**: baca empat dokumen, ringkas keputusan implementasi yang akan diambil, lalu bangun aplikasi secara bertahap sampai Definition of Done terpenuhi.`;
}
