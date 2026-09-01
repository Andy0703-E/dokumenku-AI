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
 * Windsurf, Copilot, Lovable, v0, Bolt.new) containing full implementation instructions
 * and all 4 architectural specification documents.
 */
export function generateVibeCoderPrompt(
  files: GeneratedFiles,
  projectName?: string,
): string {
  const prd = files["PRD.md"]?.trim() || "(Belum ada isi PRD.md)";
  const tech = files["TECH-STACK.md"]?.trim() || "(Belum ada isi TECH-STACK.md)";
  const uiux = files["UI-UX.md"]?.trim() || "(Belum ada isi UI-UX.md)";
  const schema = files["SCHEMA.md"]?.trim() || "(Belum ada isi SCHEMA.md)";

  const cleanProjectName = projectName?.trim() || "Aplikasi";

  return `# MASTER PROMPT VIBECODER: IMPLEMENTASI PENUH PROYEK ${cleanProjectName.toUpperCase()}

Anda bertindak sebagai **Senior Principal Software Architect & Lead Full-Stack Developer**.
Tugas Anda adalah mengimplementasikan aplikasi **${cleanProjectName}** secara lengkap, terstruktur, fungsional, dan siap produksi (production-ready) dari awal hingga akhir, dengan mengikuti secara ketat 4 dokumen arsitektur dan spesifikasi proyek yang terlampir di bawah.

---

## 🎯 PEDOMAN DAN PRINSIP UTAMA PENGKODEAN

1. **Strict Specification Compliance**:
   - Ikuti arsitektur, tech stack, dependensi, dan folder structure di \`TECH-STACK.md\`.
   - Terapkan seluruh entitas, tabel, tipe data, foreign key, dan indeks di \`SCHEMA.md\`.
   - Wujudkan seluruh fitur, role pengguna, alur kerja, business rules, dan permission di \`PRD.md\`.
   - Implementasikan desain visual, design token (warna, font, radius), wireframe layout, dan responsiveness di \`UI-UX.md\`.

2. **Kualitas Kode Produksi**:
   - Tulis kode secara utuh, bersih, dan modular. **HINDARI placeholder atau komentar seperti "// TODO: lengkapi nanti"**.
   - Gunakan TypeScript secara ketat (*strict typing*) dengan tipe data yang sinkron dengan database schema.
   - Tangani error handling, validasi input, loading states, dan empty states di setiap halaman dan endpoint.

3. **Keamanan & Konsistensi**:
   - Terapkan autentikasi dan otorisasi berbasis role (RBAC) pada setiap endpoint dan halaman privat.
   - Lindungi endpoint dengan sanitasi input, parameter binding pada query database, dan validasi skema (seperti Zod).

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
- Pastikan tidak ada runtime crash, missing types, atau dead links.

---

## 📄 LAMPIRAN 4 DOKUMEN SPESIFIKASI PROYEK

================================================================================
DOKUMEN 1 / 4: PRD.md (Product Requirement Document)
================================================================================
${prd}

================================================================================
DOKUMEN 2 / 4: TECH-STACK.md (Technical Architecture & Stack)
================================================================================
${tech}

================================================================================
DOKUMEN 3 / 4: UI-UX.md (UI/UX Guidelines, Wireframe & Design System)
================================================================================
${uiux}

================================================================================
DOKUMEN 4 / 4: SCHEMA.md (Database Schema & Data Model)
================================================================================
${schema}

================================================================================
AKHIR SPESIFIKASI PROYEK
================================================================================

Sekarang, mulailah dengan **FASE 1 (Project Scaffolding & Setup Lingkungan)**:
1. Rangkum arsitektur folder dan teknologi yang akan dibuat.
2. Buat file konfigurasi awal (\`package.json\`, \`.env.example\`, konfigurasi DB dan styling).
3. Lanjutkan langkah demi langkah hingga seluruh aplikasi selesai!`;
}
