# Dokumenku AI

Generator otomatis empat dokumen proyek secara streaming: `PRD.md`, `TECH-STACK.md`, `UI-UX.md`, dan `SCHEMA.md`. AI menyusun blueprint kanonis terlebih dahulu, lalu menghasilkan keempat dokumen dari kontrak tersebut dengan Quality Gate yang memvalidasi konsistensi lintas dokumen.

## Teknologi & Database

- **Next.js 16** (App Router) + **React 19**, **Tailwind CSS 4**, **TypeScript**
- **Turso (libSQL)** sebagai *single source of truth* — dipakai bersama oleh aplikasi web (via `@libsql/client`) dan bot WhatsApp paralel. Tidak ada lagi database lokal `data/dokumenku.sqlite`.
- **Invibuilder AI Gateway** sebagai upstream LLM dengan pool provider, model-router per stage, dan telemetri per attempt.
- Skema dikelola idempotent melalui `ensureSchema()` (raw SQL) — aman dijalankan ulang; Drizzle tidak digunakan.

## Setup

1. Salin `.env.example` menjadi `.env.local`.
2. Isi variabel yang dibutuhkan (nama variabel saja — jangan commit nilai rahasia):
   - `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — cloud database Turso.
   - `APP_SESSION_SECRET` — kunci sesi (CSPRNG 64-char).
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` — kredensial panel `/admin`.
   - `APPROVAL_TOKEN_SECRET` + `AUDIT_CHAIN_SECRET` — HMAC token approval & rantai audit.
   - `INVIBUILDER_API_KEY` + `INVIBUILDER_BASE_URL` — provider AI.
   - Opsional: `ADMIN_WA_PHONE`, `WA_BOT_PORT`, `ALLOW_INITIAL_CREDITS`, `INITIAL_CREDITS`.
3. Jalankan `npm run dev`.

Pengguna mendaftar dengan email & kata sandi sendiri. Panel `/admin` memakai kredensial admin dari env.

## Alur Pembayaran QRIS (Manual)

1. User pilih paket di halaman `/pricing` → `POST /api/checkout/create-order` membuat invoice `CREATED` (expiry 24 jam).
2. Paket terdefinisi di `lib/packages.ts` sebagai satu sumber kebenaran harga & kredit.
3. User membayar QRIS lalu **mengirim sendiri bukti via WhatsApp** ke nomor admin (wa.me), kemudian menandai invoice sudah dikirim (`POST /api/checkout/submit-whatsapp-proof`) → status `PENDING_REVIEW`.
4. Admin menyetujui melalui dashboard (`/admin`) atau bot WhatsApp (perintah `ACC <INV-ID>` / token).
5. Persetujuan menjalankan `executeAtomicPaymentApproval`: verifikasi duplikat, kunci status `WHERE status='PENDING_REVIEW'`, catat `verified_transactions`, kredit user, ledger `PAYMENT_PURCHASE` (UNIQUE anti double-grant), dan entri audit hash-chain.
6. Penolakan via dashboard atau bot (`TOLAK <INV-ID>`) → status `REJECTED` + audit.

## Alur Kredit Dua Fase

- **Reserve**: saat generasi dimulai, kredit di-reserve (`RESERVED`) — saldo berkurang, `reserved_credits` bertambah. Idempoten per `generation_id`.
- **Capture / Release**: setelah generasi terminal, kredit di-*capture* (`CAPTURED`, penanda selesai) atau di-*release* (`RELEASED`, dana kembali penuh bila batal/gagal).
- Invariant dijaga DB-side (guard `available_credits >= ?`, `reserved_credits >= ?`, rollback otomatis).

## Alur Generasi Dokumen

1. **Blueprint**: SSE streaming dari `/api/generate` → kontrak JSON kanonis (roles, entities, statuses, API base path).
2. **4 dokumen paralel**: `PRD.md`, `TECH-STACK.md`, `UI-UX.md`, `SCHEMA.md` mengikuti kontrak.
3. **Quality Gate V2.1**: validasi deterministik (≈20+ cek blueprint, completeness per dokumen). Jika gagal: deterministic fast-fix → targeted repair AI per section → alignment lintas dokumen (partial, hanya section yang bermasalah) → opsi `finalizeAsDraft` bila tetap gagal (dokumen tetap bisa diunduh).
4. **Selesai**: dokumen disimpan server-side; user dapat unduh per file, ZIP, salin, atau lanjut **Edit Manual** — perubahan manual disimpan otomatis (debounce) ke server dengan audit `MANUAL_EDIT`.

## Bot WhatsApp Paralel

- Bot jalan di `bot/whatsapp-bot.mjs`, HTTP dispatcher di port `5050` (dapat diubah via `WA_BOT_PORT`).
- Memakai **database Turso yang sama** dengan web (`TURSO_DATABASE_URL`), menjalankan `ensureSchema()` saat start, dan menampilkan host DB yang terhubung di log.
- Perintah dari nomor admin: `ACC [INV-ID/token]` (setujui + kredit), `TOLAK [INV-ID]` (batalkan), `LIST` (daftar pending), `HELP`.
- Endpoint `/status`, `/notify-payment`, `/test-ping`, `/logout` tersedia untuk integrasi dashboard.

## Struktur Kode

```
app/api/            Route handlers (auth, generation, checkout, admin, chat)
bot/                WhatsApp bot paralel (Turso, approve/cancel via pesan)
components/         UI (StudioWorkbench, AdminDashboard, PricingPage, ChatWidget, ...)
db/index.ts         Koneksi Turso, ensureSchema, seluruh fungsi DB + audit chain
hooks/              useDocumentGenerator (orchestrasi generasi & quality gate)
lib/                prompts, blueprint-quality, model-router, packages, errors, ...
scripts/            Utilitas operasional (cek skema, baseline, cleanup)
```

## Keamanan

- Audit trail immutable (trigger anti update/delete) dengan rantai hash HMAC.
- Approval pembayaran anti-duplikat berlapis (DB constraint + status lock + verified_transactions).
- Rate-limit per user pada `/api/generate` (sliding window in-memory).
- Sesi di-sign; kredensial admin hanya dari env.
