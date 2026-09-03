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
 * Extracts key technology choices from TECH-STACK.md content.
 * Returns a formatted string listing the core stack, or empty string if extraction fails.
 */
export function extractTechStackSummary(techContent: string): string {
  if (!techContent?.trim()) return "";

  const tech = techContent;
  const found: string[] = [];

  // Framework detection
  const frameworks = [
    /(?:Next\.?js|Nextjs)/i, /React/i, /Vue\.?js|Nuxt/i, /Angular/i,
    /Svelte|SvelteKit/i, /Remix/i, /Astro/i, /Express\.?js|Express\b/i,
    /Fastify/i, /Nest\.?js|NestJS/i, /Hono/i, /Django/i, /Flask/i,
    /Laravel/i, /Ruby on Rails/i, /Spring Boot/i, /Gin/i, /Fiber/i,
  ];
  for (const pattern of frameworks) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Database detection
  const databases = [
    /PostgreSQL|Postgres/i, /MySQL/i, /MariaDB/i, /SQLite/i,
    /MongoDB|Mongo/i, /Supabase/i, /Neon/i, /PlanetScale/i,
    /Turso|libSQL/i, /Convex/i, /Firebase/i, /DynamoDB/i,
    /Redis/i, /Upstash/i,
  ];
  for (const pattern of databases) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // ORM detection
  const orms = [
    /Prisma/i, /Drizzle/i, /TypeORM/i, /Sequelize/i,
    /Mongoose/i, /Kysely/i, /MikroORM/i,
  ];
  for (const pattern of orms) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Auth detection
  const authSolutions = [
    /Auth\.?js|NextAuth/i, /Clerk/i, /Supabase Auth/i,
    /Firebase Auth/i, /Lucia/i, /Passport\.?js/i,
    /Argon2|bcrypt/i, /JWT|jsonwebtoken/i,
  ];
  for (const pattern of authSolutions) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Payment detection
  const payments = [
    /Midtrans/i, /Stripe/i, /Xendit/i, /DOKU/i,
    /Payment Gateway/i, /QRIS/i,
  ];
  for (const pattern of payments) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Deployment detection
  const deployments = [
    /Vercel/i, /Netlify/i, /Cloudflare/i, /AWS/i,
    /Docker/i, /Railway/i, /Fly\.?io/i, /DigitalOcean/i,
  ];
  for (const pattern of deployments) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // UI framework detection
  const uiFrameworks = [
    /Tailwind CSS|Tailwind/i, /shadcn/i, /Radix/i, /Chakra UI/i,
    /MUI|Material UI/i, /Ant Design/i, /Mantine/i, /DaisyUI/i,
    /Bootstrap/i,
  ];
  for (const pattern of uiFrameworks) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Language detection
  const languages = [
    /TypeScript/i, /JavaScript/i, /Python/i, /Go\b/i, /Rust/i, /Kotlin/i,
  ];
  for (const pattern of languages) {
    const match = tech.match(pattern);
    if (match) { found.push(match[0]); break; }
  }

  // Deduplicate and return
  const unique = [...new Set(found.map((f) => f.trim()))];
  return unique.length > 0 ? unique.join(", ") : "";
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
  const techSummary = extractTechStackSummary(files["TECH-STACK.md"] || "");
  const techLine = techSummary ? `\nTech stack yang teridentifikasi: **${techSummary}**. WAJIB gunakan teknologi ini — jangan mengganti dengan alternatif tanpa alasan kuat yang terdokumentasi.` : "";

  return `# MASTER PROMPT VIBECODER: IMPLEMENTASI PENUH PROYEK ${cleanProjectName.toUpperCase()}

Anda bertindak sebagai **Senior Principal Software Architect & Lead Full-Stack Developer**.
Tugas Anda adalah mengimplementasikan aplikasi **${cleanProjectName}** secara lengkap, terstruktur, fungsional, dan siap produksi (production-ready) dari awal hingga akhir.${techLine}

---

## SUMBER SPESIFIKASI OTORITATIF

Keempat file berikut berada di direktori yang sama dengan prompt ini dan WAJIB dibaca sebelum menulis kode:

- \`PRD.md\` — fitur, role, alur, acceptance criteria, dan scope.
- \`TECH-STACK.md\` — arsitektur, API, auth, dan deployment.
- \`UI-UX.md\` — design tokens, navigasi, wireframe, state UI, dan aksesibilitas.
- \`SCHEMA.md\` — tabel, tipe data, constraint, relasi, indeks, retensi, dan audit.

File tersebut adalah sumber kebenaran. Jangan menyalin ulang isi ke prompt, jangan mengurangi constraint-nya, dan jangan membuat keputusan yang bertentangan. ${documentsReady ? "Semua empat dokumen sudah tersedia." : "Jika ada file yang hilang, berhenti dan minta dokumen tersebut sebelum melanjutkan."}

Urutan prioritas bila ada konflik: **SCHEMA.md** > **TECH-STACK.md** > **PRD.md** > **UI-UX.md**. Laporkan konflik yang tidak dapat diselesaikan dari empat sumber tersebut sebelum mengimplementasikannya.

---

## ATURAN IMPLEMENTASI UTAMA

- Tulis kode utuh, modular, typed, dan siap produksi. Jangan meninggalkan placeholder atau TODO sebagai pengganti implementasi.
- WAJIB menggunakan tech stack yang dipilih di \`TECH-STACK.md\` (Framework, Database, ORM, Payment Gateway, dll). Jangan diganti dengan teknologi lain tanpa persetujuan eksplisit.
- Terapkan constraint schema (UNIQUE, CHECK, FK) melalui migration ORM (Prisma/Drizzle) dan validasi input di level aplikasi.
- Autentikasi dan otorisasi (RBAC) WAJIB diterapkan di setiap endpoint dan halaman privat sesuai role di \`PRD.md\`.
- Tangani loading, empty, error, success, retry, aksesibilitas, dan responsivitas yang diwajibkan \`UI-UX.md\`.
- Tambahkan test untuk aturan bisnis, authorization, lifecycle, dan edge case yang memiliki acceptance criteria.

---

## 🚀 ROADMAP EKSEKUSI BERTAHAP (VIBE-CODING EXECUTION PLAN)

Lakukan pengerjaan secara bertahap sesuai alur berikut:

### FASE 1: Project Scaffolding & Setup Lingkungan
- Setup repository dan struktur direktori sesuai panduan di \`TECH-STACK.md\`.
- Konfigurasi dependensi \`package.json\`, TypeScript, dan styling config.
- Buat file \`.env.example\` dengan seluruh variabel lingkungan yang diperlukan.

### FASE 2: Database Layer & ORM Modeling
- Buat file schema database (ORM) berdasarkan seluruh definisi di \`SCHEMA.md\`.
- Siapkan migration script dan file seed data awal.
- Implementasikan database client helper / connection pooling.

### FASE 3: Backend API, Authentication & Business Rules
- Implementasikan sistem autentikasi dan middleware RBAC.
- Buat API routes untuk seluruh endpoint yang terdaftar di \`TECH-STACK.md\`.
- Implementasikan state machine / lifecycle transitions pada entitas utama.

### FASE 4: Frontend Layout, Design System & UI Components
- Konfigurasi theme tokens sesuai \`UI-UX.md\`.
- Buat reusable components dan layout shell.
- Bangun halaman-halaman utama dan wireframe yang didefinisikan pada \`UI-UX.md\`.

### FASE 5: Integrasi Full-Stack & State Management
- Hubungkan setiap halaman frontend ke API endpoint backend.
- Tambahkan feedback interaktif pengguna: toast notification, alert konfirmasi, dan skeleton loading.

### FASE 6: Validasi & Edge-Case Testing
- Lakukan pengecekan terhadap semua kriteria penerimaan (*Acceptance Criteria*) di \`PRD.md\`.
- Pastikan tidak ada runtime crash, missing types, atau pelanggaran RBAC.

---

## DEFINITION OF DONE

- Semua fitur MVP dan acceptance criteria pada PRD.md dapat diuji.
- Database memiliki migration yang dapat dijalankan, semua FK/index/constraint valid.
- API, auth, dan UI mengikuti spesifikasi tanpa kontradiksi semantik.
- Test relevan lulus, build berhasil, dan tidak ada data sensitif di source control.

Mulailah dari **FASE 1**: baca empat dokumen, ringkas keputusan implementasi yang akan diambil, lalu bangun aplikasi secara bertahap sampai Definition of Done terpenuhi.`;
}
