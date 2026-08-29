/**
 * Standardized Error Codes, Server-Side Validators, Dimension Parser & UX Messages
 * Implements 7-Layer Universal Validation & Security Architecture for Dokumenku AI
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const ERROR_CODES = {
  // Layer 1: Form & Input Validation
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INPUT_EMAIL_INVALID: "INPUT_EMAIL_INVALID",
  INPUT_PASSWORD_TOO_SHORT: "INPUT_PASSWORD_TOO_SHORT",
  INPUT_PROJECT_NAME_REQUIRED: "INPUT_PROJECT_NAME_REQUIRED",
  INPUT_PROJECT_NAME_TOO_LONG: "INPUT_PROJECT_NAME_TOO_LONG",
  INPUT_PROJECT_PROMPT_REQUIRED: "INPUT_PROJECT_PROMPT_REQUIRED",
  INPUT_PROJECT_PROMPT_TOO_SHORT: "INPUT_PROJECT_PROMPT_TOO_SHORT",
  INPUT_PROJECT_PROMPT_TOO_LONG: "INPUT_PROJECT_PROMPT_TOO_LONG",

  // Layer 2: Authentication & Authorization & Ownership
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  AUTH_CREDENTIALS_INVALID: "AUTH_CREDENTIALS_INVALID",
  AUTH_EMAIL_ALREADY_REGISTERED: "AUTH_EMAIL_ALREADY_REGISTERED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_FORBIDDEN: "RESOURCE_FORBIDDEN",

  // Layer 3: AI Provider & Sequential Document Dependencies & Generation Lifecycle
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_MODEL_UNAVAILABLE: "AI_MODEL_UNAVAILABLE",
  AI_GENERATION_FAILED: "AI_GENERATION_FAILED",
  AI_GENERATION_ALREADY_RUNNING: "AI_GENERATION_ALREADY_RUNNING",
  AI_DEPENDENCY_MISSING: "AI_DEPENDENCY_MISSING",
  AI_PRD_REQUIRED: "AI_PRD_REQUIRED",
  AI_TECH_SPEC_REQUIRED: "AI_TECH_SPEC_REQUIRED",
  AI_OUTPUT_INVALID: "AI_OUTPUT_INVALID",
  AI_REQUEST_TOO_LARGE: "AI_REQUEST_TOO_LARGE",
  AI_STREAMING_TIMEOUT: "AI_STREAMING_TIMEOUT",
  GENERATION_INVALID_STATE: "GENERATION_INVALID_STATE",
  GENERATION_STATE_INVARIANT_VIOLATION: "GENERATION_STATE_INVARIANT_VIOLATION",

  // Layer 4: Credit Reservation & Ledger Validation
  CREDIT_INSUFFICIENT: "CREDIT_INSUFFICIENT",
  CREDIT_RESERVATION_FAILED: "CREDIT_RESERVATION_FAILED",
  CREDIT_RESERVATION_EXISTS: "CREDIT_RESERVATION_EXISTS",
  CREDIT_RESERVATION_NOT_FOUND: "CREDIT_RESERVATION_NOT_FOUND",
  CREDIT_RESERVATION_INVALID_STATE: "CREDIT_RESERVATION_INVALID_STATE",
  CREDIT_BALANCE_INVARIANT_VIOLATION: "CREDIT_BALANCE_INVARIANT_VIOLATION",
  CREDIT_ALREADY_GRANTED: "CREDIT_ALREADY_GRANTED",

  // Layer 5: Payment & Proof Pre-Validation & Magic Bytes
  PROOF_IMAGE_INVALID: "PROOF_IMAGE_INVALID",
  PROOF_IMAGE_TOO_LARGE: "PROOF_IMAGE_TOO_LARGE",
  PROOF_IMAGE_MIME_MISMATCH: "PROOF_IMAGE_MIME_MISMATCH",
  PROOF_IMAGE_CORRUPTED: "PROOF_IMAGE_CORRUPTED",
  PROOF_IMAGE_DIMENSIONS_INVALID: "PROOF_IMAGE_DIMENSIONS_INVALID",
  PROOF_IMAGE_UNREADABLE: "PROOF_IMAGE_UNREADABLE",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  PAYMENT_MERCHANT_MISMATCH: "PAYMENT_MERCHANT_MISMATCH",
  PAYMENT_TRANSACTION_DUPLICATE: "PAYMENT_TRANSACTION_DUPLICATE",
  PAYMENT_TRANSACTION_DATE_INVALID: "PAYMENT_TRANSACTION_DATE_INVALID",
  PAYMENT_PENDING_REVIEW: "PAYMENT_PENDING_REVIEW",
  PAYMENT_ALREADY_PROCESSED: "PAYMENT_ALREADY_PROCESSED",
  PAYMENT_INVALID_STATE: "PAYMENT_INVALID_STATE",
  PAYMENT_ORDER_EXPIRED: "PAYMENT_ORDER_EXPIRED",
  PAYMENT_ORDER_NOT_FOUND: "PAYMENT_ORDER_NOT_FOUND",

  // Layer 6: Admin & Webhook Approval
  REJECTION_REASON_INVALID: "REJECTION_REASON_INVALID",
  REJECTION_NOTE_REQUIRED: "REJECTION_NOTE_REQUIRED",
  WEBHOOK_UNAUTHORIZED: "WEBHOOK_UNAUTHORIZED",
  WEBHOOK_REPLAY: "WEBHOOK_REPLAY",
  WEBHOOK_EVENT_INVALID: "WEBHOOK_EVENT_INVALID",
  APPROVAL_TOKEN_INVALID: "APPROVAL_TOKEN_INVALID",
  APPROVAL_TOKEN_EXPIRED: "APPROVAL_TOKEN_EXPIRED",
  APPROVAL_TOKEN_LOCKED: "APPROVAL_TOKEN_LOCKED",

  // Layer 7: Database / Storage / Rate Limiting
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  DATABASE_TRANSACTION_FAILED: "DATABASE_TRANSACTION_FAILED",
  STORAGE_UPLOAD_FAILED: "STORAGE_UPLOAD_FAILED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  SERVICE_TEMPORARILY_UNAVAILABLE: "SERVICE_TEMPORARILY_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Layer 1
  [ERROR_CODES.VALIDATION_FAILED]: "Format input data tidak valid.",
  [ERROR_CODES.INPUT_EMAIL_INVALID]: "Masukkan alamat email yang valid.",
  [ERROR_CODES.INPUT_PASSWORD_TOO_SHORT]: "Password minimal 8 karakter.",
  [ERROR_CODES.INPUT_PROJECT_NAME_REQUIRED]: "Nama proyek wajib diisi.",
  [ERROR_CODES.INPUT_PROJECT_NAME_TOO_LONG]: "Nama proyek maksimal 100 karakter.",
  [ERROR_CODES.INPUT_PROJECT_PROMPT_REQUIRED]: "Jelaskan website/aplikasi yang ingin dibuat.",
  [ERROR_CODES.INPUT_PROJECT_PROMPT_TOO_SHORT]: "Deskripsi proyek terlalu singkat. Berikan rincian kebutuhan minimal 20 karakter.",
  [ERROR_CODES.INPUT_PROJECT_PROMPT_TOO_LONG]: "Deskripsi proyek maksimal 50.000 karakter.",

  // Layer 2
  [ERROR_CODES.AUTH_SESSION_EXPIRED]: "Sesi Anda telah berakhir. Silakan masuk kembali.",
  [ERROR_CODES.AUTH_UNAUTHORIZED]: "Silakan masuk ke akun Anda terlebih dahulu.",
  [ERROR_CODES.AUTH_FORBIDDEN]: "Anda tidak memiliki izin untuk mengakses halaman ini.",
  [ERROR_CODES.AUTH_CREDENTIALS_INVALID]: "Email atau kata sandi tidak cocok.",
  [ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED]: "Alamat email ini sudah terdaftar. Silakan langsung masuk.",
  [ERROR_CODES.RESOURCE_NOT_FOUND]: "Data yang Anda cari tidak ditemukan.",
  [ERROR_CODES.RESOURCE_FORBIDDEN]: "Anda tidak memiliki akses ke data ini.",

  // Layer 3
  [ERROR_CODES.AI_PROVIDER_UNAVAILABLE]: "Provider AI yang dipilih sedang tidak tersedia.",
  [ERROR_CODES.AI_MODEL_UNAVAILABLE]: "Model AI tidak tersedia. Silakan pilih model lain.",
  [ERROR_CODES.AI_GENERATION_FAILED]: "Proses pembuatan dokumen gagal. Saldo reservasi kredit Anda telah dikembalikan.",
  [ERROR_CODES.AI_GENERATION_ALREADY_RUNNING]: "Proses pembuatan dokumen untuk proyek ini sedang berjalan.",
  [ERROR_CODES.AI_DEPENDENCY_MISSING]: "Dokumen prasyarat belum lengkap untuk membuat dokumen ini.",
  [ERROR_CODES.AI_PRD_REQUIRED]: "PRD belum tersedia. Selesaikan dokumen PRD terlebih dahulu.",
  [ERROR_CODES.AI_TECH_SPEC_REQUIRED]: "Technical Specification membutuhkan PRD dan Tech Spec sebagai sumber konteks.",
  [ERROR_CODES.AI_OUTPUT_INVALID]: "Hasil dokumen AI tidak valid atau tidak lengkap. Silakan coba kembali.",
  [ERROR_CODES.AI_REQUEST_TOO_LARGE]: "Ukuran payload permintaan AI melebihi batas yang diizinkan.",
  [ERROR_CODES.AI_STREAMING_TIMEOUT]: "Koneksi AI terputus. Anda dapat mencoba melanjutkan kembali.",
  [ERROR_CODES.GENERATION_INVALID_STATE]: "Status pekerjaan pembuatan dokumen tidak valid untuk proses finalisasi.",
  [ERROR_CODES.GENERATION_STATE_INVARIANT_VIOLATION]: "Terjadi inkonsistensi antara status reservasi kredit dan status dokumen generasi.",

  // Layer 4
  [ERROR_CODES.CREDIT_INSUFFICIENT]: "Saldo kredit Anda tidak mencukupi untuk membuat dokumen ini.",
  [ERROR_CODES.CREDIT_RESERVATION_FAILED]: "Gagal melakukan reservasi kredit. Saldo tidak mencukupi.",
  [ERROR_CODES.CREDIT_RESERVATION_EXISTS]: "Reservasi kredit untuk pekerjaan ini sudah aktif.",
  [ERROR_CODES.CREDIT_RESERVATION_NOT_FOUND]: "Data reservasi kredit tidak ditemukan.",
  [ERROR_CODES.CREDIT_RESERVATION_INVALID_STATE]: "Status reservasi kredit tidak valid untuk operasi ini.",
  [ERROR_CODES.CREDIT_BALANCE_INVARIANT_VIOLATION]: "Terjadi inkonsistensi pada saldo reservasi kredit akun.",
  [ERROR_CODES.CREDIT_ALREADY_GRANTED]: "Kredit untuk transaksi ini sudah pernah ditambahkan sebelumnya.",

  // Layer 5
  [ERROR_CODES.PROOF_IMAGE_INVALID]: "Format bukti harus JPG, PNG, atau WebP.",
  [ERROR_CODES.PROOF_IMAGE_TOO_LARGE]: "Ukuran file bukti transfer maksimal 5 MB.",
  [ERROR_CODES.PROOF_IMAGE_MIME_MISMATCH]: "Tipe file bukti transfer tidak sesuai dengan header gambar yang dideklarasikan.",
  [ERROR_CODES.PROOF_IMAGE_CORRUPTED]: "File gambar bukti transfer rusak, terpotong, atau tidak dapat didekode.",
  [ERROR_CODES.PROOF_IMAGE_DIMENSIONS_INVALID]: "Dimensi gambar tidak wajar (maksimal 8192x8192 piksel).",
  [ERROR_CODES.PROOF_IMAGE_UNREADABLE]: "Bukti pembayaran tidak dapat dibaca. Unggah gambar yang lebih jelas dan tidak terpotong.",
  [ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]: "Nominal pada bukti pembayaran tidak sesuai dengan total tagihan (Rp 49.000).",
  [ERROR_CODES.PAYMENT_MERCHANT_MISMATCH]: "Tujuan pembayaran pada bukti struk tidak sesuai dengan merchant tagihan QRIS Dokumenku AI.",
  [ERROR_CODES.PAYMENT_TRANSACTION_DUPLICATE]: "Transaksi ini sudah pernah digunakan untuk tagihan lain.",
  [ERROR_CODES.PAYMENT_TRANSACTION_DATE_INVALID]: "Waktu transaksi pada struk tidak sesuai dengan periode tagihan aktif.",
  [ERROR_CODES.PAYMENT_PENDING_REVIEW]: "Bukti telah diterima dan sedang menunggu verifikasi mutasi pembayaran.",
  [ERROR_CODES.PAYMENT_ALREADY_PROCESSED]: "Pembayaran ini sudah selesai diproses sebelumnya.",
  [ERROR_CODES.PAYMENT_INVALID_STATE]: "Pembayaran ini tidak dapat diproses pada status saat ini.",
  [ERROR_CODES.PAYMENT_ORDER_EXPIRED]: "Tagihan ini telah kedaluwarsa. Silakan buat pesanan baru.",
  [ERROR_CODES.PAYMENT_ORDER_NOT_FOUND]: "Data tagihan pembayaran tidak ditemukan.",

  // Layer 6
  [ERROR_CODES.REJECTION_REASON_INVALID]: "Alasan penolakan pembayaran tidak valid.",
  [ERROR_CODES.REJECTION_NOTE_REQUIRED]: "Catatan wajib diisi jika memilih alasan 'Lainnya'.",
  [ERROR_CODES.WEBHOOK_UNAUTHORIZED]: "Akses webhook tidak sah atau signature tidak valid.",
  [ERROR_CODES.WEBHOOK_REPLAY]: "Event webhook ini sudah pernah diproses sebelumnya.",
  [ERROR_CODES.WEBHOOK_EVENT_INVALID]: "Format payload event webhook tidak valid.",
  [ERROR_CODES.APPROVAL_TOKEN_INVALID]: "Token approval tidak valid untuk tagihan ini.",
  [ERROR_CODES.APPROVAL_TOKEN_EXPIRED]: "Token approval telah kedaluwarsa (berlaku 10 menit).",
  [ERROR_CODES.APPROVAL_TOKEN_LOCKED]: "Token approval terkunci karena melebihi batas 5 kali percobaan.",

  // Layer 7
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Terlalu banyak permintaan dalam waktu singkat. Silakan tunggu beberapa saat.",
  [ERROR_CODES.DATABASE_TRANSACTION_FAILED]: "Terjadi gangguan saat memproses transaksi pembayaran. Tidak ada saldo kredit yang berubah.",
  [ERROR_CODES.STORAGE_UPLOAD_FAILED]: "Bukti pembayaran gagal disimpan. Silakan coba kembali.",
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: "Terjadi kesalahan pada server. Silakan coba kembali.",
  [ERROR_CODES.SERVICE_TEMPORARILY_UNAVAILABLE]: "Layanan sedang sibuk. Silakan coba kembali beberapa saat lagi.",
};

// ── Standard Server-Side Rejection Codes ─────────────────────────────
export const REJECTION_CODES = [
  "AMOUNT_MISMATCH",
  "TRANSACTION_NOT_FOUND",
  "MERCHANT_MISMATCH",
  "PROOF_UNREADABLE",
  "TRANSACTION_DUPLICATE",
  "TRANSACTION_EXPIRED",
  "OTHER",
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export const REJECTION_LABELS: Record<RejectionCode, string> = {
  TRANSACTION_NOT_FOUND: "Transaksi tidak ditemukan pada mutasi pembayaran",
  AMOUNT_MISMATCH: "Nominal transfer tidak sesuai",
  MERCHANT_MISMATCH: "Merchant tujuan transfer tidak sesuai",
  PROOF_UNREADABLE: "Bukti transfer buram / terpotong / tidak terbaca",
  TRANSACTION_DUPLICATE: "ID transaksi sudah pernah digunakan sebelumnya",
  TRANSACTION_EXPIRED: "Transaksi dilakukan di luar tanggal tagihan aktif",
  OTHER: "Alasan lainnya",
};

/**
 * Inspect raw buffer magic bytes to accurately detect real image type
 */
export function detectMimeFromBytes(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP magic bytes: RIFF .... WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50    // P
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Inspect image header, structural chunks and validate dimensions & pixel bounds
 * Bounds: max 8192px width, max 8192px height, max 35,000,000 total pixels
 * Also verifies stream decode integrity (detects truncated or corrupted chunk streams)
 */
export function validateImageDimensions(
  buffer: Buffer,
  mime: "image/jpeg" | "image/png" | "image/webp"
): { ok: boolean; width?: number; height?: number; error?: string } {
  try {
    let width = 0;
    let height = 0;

    if (mime === "image/png") {
      if (buffer.length < 32) {
        return { ok: false, error: "Data PNG terlalu pendek atau rusak." };
      }
      // PNG IHDR chunk: Length (4 bytes at 8), "IHDR" (4 bytes at 12), Width (4 bytes at 16), Height (4 bytes at 20)
      const chunkType = buffer.subarray(12, 16).toString("ascii");
      if (chunkType !== "IHDR") {
        return { ok: false, error: "Header PNG IHDR tidak ditemukan." };
      }
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);

      // Verify at least one IDAT chunk exists and file is non-empty
      const hasIdat = buffer.includes(Buffer.from("IDAT", "ascii"));
      if (!hasIdat && buffer.length > 64) {
        return { ok: false, error: "Struktur data gambar PNG rusak (IDAT chunk hilang)." };
      }
    } else if (mime === "image/jpeg") {
      if (buffer.length < 32) {
        return { ok: false, error: "Data JPEG terlalu pendek atau rusak." };
      }
      // JPEG SOF parser
      let offset = 2;
      let foundSof = false;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (
          marker === 0xc0 || // SOF0 (baseline)
          marker === 0xc1 || // SOF1 (extended sequential)
          marker === 0xc2    // SOF2 (progressive)
        ) {
          height = buffer.readUInt16BE(offset + 5);
          width = buffer.readUInt16BE(offset + 7);
          foundSof = true;
          break;
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
      if (!foundSof && buffer.length < 1024) {
        return { ok: false, error: "Header frame JPEG tidak valid atau terpotong." };
      }
    } else if (mime === "image/webp") {
      if (buffer.length < 30) {
        return { ok: false, error: "Data WebP terlalu pendek atau rusak." };
      }
      // WebP VP8 / VP8L / VP8X parser
      const vp8Type = buffer.subarray(12, 16).toString("ascii");
      if (vp8Type === "VP8 ") {
        width = buffer.readUInt16LE(26) & 0x3fff;
        height = buffer.readUInt16LE(28) & 0x3fff;
      } else if (vp8Type === "VP8L") {
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        width = 1 + (((b1 & 0x3f) << 8) | b0);
        height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      } else if (vp8Type === "VP8X") {
        width = 1 + buffer.readUIntLE(24, 3);
        height = 1 + buffer.readUIntLE(27, 3);
      } else {
        return { ok: false, error: "Format chunk WebP tidak dikenali." };
      }
    }

    if (width > 0 && height > 0) {
      if (width > 8192 || height > 8192 || width * height > 35_000_000) {
        return { ok: false, width, height, error: "Dimensi gambar melebihi batas maksimal 8192x8192 piksel." };
      }
      return { ok: true, width, height };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal mendecode struktur data gambar." };
  }
}

/**
 * Generate a traceable unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

/**
 * Standardized API Error Response
 */
export function apiError(
  code: ErrorCode,
  customMessage?: string,
  statusCode = 400,
  requestId = generateRequestId()
): NextResponse {
  const message = customMessage || ERROR_MESSAGES[code] || "Terjadi kesalahan pada permintaan.";
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
      error: message,
      requestId,
    },
    { status: statusCode }
  );
}

/**
 * Standardized API Success Response
 */
export function apiSuccess<T>(
  data: T,
  statusCode = 200,
  requestId = generateRequestId()
): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      data,
      requestId,
    },
    { status: statusCode }
  );
}
