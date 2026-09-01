import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { generateApprovalToken, getDatabase, hashApprovalToken, insertAuditLogEntry } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { notifyAdminViaWhatsApp } from "@/lib/whatsapp-notifier";
import {
  ERROR_CODES,
  apiError,
  apiSuccess,
  detectMimeFromBytes,
  validateImageDimensions,
  generateRequestId,
} from "@/lib/errors";

const PROVIDER_BASE_URL = process.env.INVIBUILDER_BASE_URL || "https://api.invibuilder.com/api/v1";
const EXPECTED_MERCHANT_NAME = "Jasa pembuatan websi...";
const EXPECTED_NMID = "ID1026479441309";
const EXPECTED_AMOUNT = 20000;
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

interface ExtractedOcrData {
  merchant_name?: string;
  nmid?: string;
  amount?: string;
  transaction_id?: string;
  transaction_date?: string;
  displayed_payment_status?: string;
  payment_provider?: string;
  extracted_code: "NEEDS_BACKEND_VERIFICATION" | "DATA_MISMATCH" | "IMAGE_UNREADABLE";
  notes?: string;
}

function getOcrContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => getOcrContentText(part)).join("");
  }
  if (!content || typeof content !== "object") return "";
  const value = content as Record<string, unknown>;
  return getOcrContentText(value.text) || getOcrContentText(value.content) || getOcrContentText(value.value);
}

function parseOcrResult(content: unknown): Partial<ExtractedOcrData> | null {
  const raw = getOcrContentText(content).trim();
  if (!raw) return null;

  const withoutCodeFence = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonText = withoutCodeFence.startsWith("{")
    ? withoutCodeFence
    : withoutCodeFence.match(/\{[\s\S]*\}/)?.[0];

  if (!jsonText) return null;

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  return parsed;
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_SESSION_EXPIRED, undefined, 401, requestId);
  }

  const { orderId, proofImage } = (await request.json().catch(() => ({}))) as unknown as {
    orderId?: string;
    proofImage?: string;
  };

  if (!orderId || typeof orderId !== "string" || orderId.length > 100) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID pesanan wajib disertakan dan tidak boleh lebih dari 100 karakter.", 400, requestId);
  }

  if (!proofImage || typeof proofImage !== "string" || !proofImage.startsWith("data:image/")) {
    return apiError(ERROR_CODES.PROOF_IMAGE_INVALID, undefined, 400, requestId);
  }

  let proofSha256: string | null = null;
  let declaredMime = "image/jpeg";
  let proofSize = 0;
  let buffer: Buffer;

  try {
    const [header, base64Data] = proofImage.split(",");
    const mimeMatch = header.match(/data:([^;]+);/);
    if (mimeMatch) {
      declaredMime = mimeMatch[1].toLowerCase();
      if (declaredMime === "image/jpg") declaredMime = "image/jpeg";
    }
    buffer = Buffer.from(base64Data, "base64");
    proofSize = buffer.length;

    if (proofSize > MAX_UPLOAD_SIZE_BYTES) {
      return apiError(ERROR_CODES.PROOF_IMAGE_TOO_LARGE, undefined, 413, requestId);
    }

    const detectedMime = detectMimeFromBytes(buffer);
    if (!detectedMime) {
      return apiError(ERROR_CODES.PROOF_IMAGE_CORRUPTED, undefined, 400, requestId);
    }

    if (detectedMime !== declaredMime) {
      return apiError(ERROR_CODES.PROOF_IMAGE_MIME_MISMATCH, `Tipe file (${detectedMime}) tidak cocok dengan header yang dideklarasikan (${declaredMime}).`, 415, requestId);
    }

    const dimCheck = validateImageDimensions(buffer, detectedMime);
    if (!dimCheck.ok) {
      return apiError(ERROR_CODES.PROOF_IMAGE_DIMENSIONS_INVALID, dimCheck.error || "Dimensi gambar tidak valid.", 400, requestId);
    }

    proofSha256 = createHash("sha256").update(buffer).digest("hex");
  } catch {
    return apiError(ERROR_CODES.PROOF_IMAGE_CORRUPTED, undefined, 400, requestId);
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
    const order = orderResult.rows[0] as unknown as
      | { id: string; user_email: string; plan_name: string; amount: number; credits: number; status: string }
      | undefined;

    if (!order || (order.user_email !== user.email && user.role !== "admin")) {
      return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Data tagihan pembayaran tidak ditemukan.", 404, requestId);
    }

    if (order.status === "PAID" || order.status === "paid") {
      return apiError(ERROR_CODES.PAYMENT_ALREADY_PROCESSED, undefined, 409, requestId);
    }

    let extracted: ExtractedOcrData = {
      merchant_name: "Tidak terdeteksi",
      nmid: "Tidak terdeteksi",
      amount: "Tidak terdeteksi",
      transaction_id: "Tidak terdeteksi",
      transaction_date: "Tidak terdeteksi",
      displayed_payment_status: "Tidak terdeteksi",
      payment_provider: "QRIS",
      extracted_code: "NEEDS_BACKEND_VERIFICATION",
      notes: "Gambar bukti disimpan. Menunggu verifikasi mutasi riil dari Admin.",
    };

    const apiKey = process.env.INVIBUILDER_API_KEY;
    if (apiKey) {
      try {
        const prompt = `Anda adalah asisten ekstraksi data gambar bukti transfer/struk pembayaran QRIS di Indonesia.
Tugas Anda HANYA mengekstrak teks faktual dari gambar. DILARANG menentukan keaslian atau memberikan status 'lunas'.

Format output WAJIB JSON persis:
{
  "merchant_name": "nama toko/merchant penerima",
  "nmid": "NMID jika ada",
  "amount": "nominal transfer dalam format angka atau teks",
  "transaction_id": "nomor referensi / ID transaksi / RRN jika ada",
  "transaction_date": "tanggal dan jam transaksi",
  "displayed_payment_status": "status yang tertulis di gambar (contoh: Berhasil, Sukses, Pending)",
  "payment_provider": "aplikasi pengirim (contoh: BCA, Mandiri, GoPay, OVO, Dana, ShopeePay, QRIS)",
  "extracted_code": "NEEDS_BACKEND_VERIFICATION",
  "notes": "keterangan ringkas pembacaan OCR"
}

Jika gambar buram/bukan struk, isi "extracted_code": "IMAGE_UNREADABLE".`;

        const aiResponse = await fetch(`${PROVIDER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "qwen-vl-plus",
            messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: proofImage } }] }],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (aiResponse.ok) {
          const aiJson = await aiResponse.json() as { choices?: Array<{ message?: { content?: unknown } }> };
          const content = aiJson.choices?.[0]?.message?.content;
          const parsed = parseOcrResult(content);
          if (parsed) {
            const extractedCode = parsed.extracted_code === "DATA_MISMATCH" || parsed.extracted_code === "IMAGE_UNREADABLE"
              ? parsed.extracted_code
              : "NEEDS_BACKEND_VERIFICATION";
            extracted = {
              merchant_name: typeof parsed.merchant_name === "string" ? parsed.merchant_name : "Tidak terdeteksi",
              nmid: typeof parsed.nmid === "string" ? parsed.nmid : "Tidak terdeteksi",
              amount: typeof parsed.amount === "string" ? parsed.amount : "Tidak terdeteksi",
              transaction_id: typeof parsed.transaction_id === "string" ? parsed.transaction_id : "Tidak terdeteksi",
              transaction_date: typeof parsed.transaction_date === "string" ? parsed.transaction_date : "Tidak terdeteksi",
              displayed_payment_status: typeof parsed.displayed_payment_status === "string" ? parsed.displayed_payment_status : "Tidak terdeteksi",
              payment_provider: typeof parsed.payment_provider === "string" ? parsed.payment_provider : "QRIS",
              extracted_code: extractedCode,
              notes: typeof parsed.notes === "string" ? parsed.notes : "Data berhasil diekstrak dari gambar struk.",
            };
          } else {
            extracted.notes = "Provider OCR merespons, tetapi tidak mengirim data struk yang dapat dibaca. Menunggu konfirmasi manual admin melalui WhatsApp.";
          }
        } else {
          extracted.notes = `Provider OCR sedang tidak tersedia (HTTP ${aiResponse.status}). Menunggu konfirmasi manual admin melalui WhatsApp.`;
        }
      } catch (error) {
        const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
        extracted.notes = isTimeout
          ? "Provider OCR tidak merespons dalam batas waktu. Menunggu konfirmasi manual admin melalui WhatsApp."
          : "Koneksi ke provider OCR gagal. Menunggu konfirmasi manual admin melalui WhatsApp.";
      }
    } else {
      extracted.notes = "Provider OCR belum dikonfigurasi. Menunggu konfirmasi manual admin melalui WhatsApp.";
    }

    const validationNotes: string[] = [];

    const rawAmountDigits = (extracted.amount || "").replace(/[^0-9]/g, "");
    if (rawAmountDigits) {
      const parsedNum = parseInt(rawAmountDigits, 10);
      if (parsedNum !== order.amount) {
        const expectedFormatted = order.amount === 75000 ? "Rp 75.000" : "Rp 20.000";
        validationNotes.push(`Nominal struk terdeteksi (${extracted.amount}) tidak sesuai dengan nominal tagihan (${expectedFormatted}).`);
      }
    }

    const merchantLower = (extracted.merchant_name || "").toLowerCase();
    const isTargetMerchant = merchantLower.includes("jasa pembuatan websi") || merchantLower.includes("jasa pembuatan") || merchantLower.includes("dokumenku") || merchantLower.includes("andy dadung") || (extracted.nmid && extracted.nmid.includes(EXPECTED_NMID));
    if (merchantLower !== "tidak terdeteksi" && merchantLower !== "" && !isTargetMerchant) {
      validationNotes.push(`Merchant tujuan terdeteksi '${extracted.merchant_name}' bukan '${EXPECTED_MERCHANT_NAME}'.`);
    }

    const dateStr = (extracted.transaction_date || "").trim();
    const currentYear = new Date().getFullYear();
    const hasOldYear = dateStr.includes("2023") || dateStr.includes("2024") || dateStr.includes("2025") || (dateStr.length > 4 && !dateStr.includes(String(currentYear)));
    if (dateStr !== "Tidak terdeteksi" && hasOldYear && !dateStr.includes(String(currentYear))) {
      validationNotes.push(`Tanggal transaksi pada struk (${extracted.transaction_date}) berada di luar periode tagihan aktif.`);
    }

    if (extracted.transaction_id && extracted.transaction_id !== "Tidak terdeteksi" && extracted.transaction_id.length > 5) {
      const duplicateOrderResult = await db.execute({
        sql: "SELECT id FROM orders WHERE ocr_transaction_id = ? AND id != ? AND status IN ('PAID', 'paid')",
        args: [extracted.transaction_id, orderId],
      });
      const duplicateOrder = duplicateOrderResult.rows[0] as unknown as { id: string } | undefined;

      const duplicateVerifiedResult = await db.execute({
        sql: "SELECT order_id FROM verified_transactions WHERE transaction_id = ? AND order_id != ?",
        args: [extracted.transaction_id, orderId],
      });
      const duplicateVerified = duplicateVerifiedResult.rows[0] as unknown as { order_id: string } | undefined;

      if (duplicateOrder || duplicateVerified) {
        const conflictId = duplicateOrder?.id || duplicateVerified?.order_id;
        validationNotes.push(`ID Transaksi (${extracted.transaction_id}) sudah pernah digunakan pada invoice ${conflictId}.`);
      }
    }

    const isUnreadable = extracted.extracted_code === "IMAGE_UNREADABLE";
    const hasMismatch = validationNotes.length > 0 || extracted.extracted_code === "DATA_MISMATCH";

    // OCR is informational only. A valid proof image must always be sent to the
    // admin's WhatsApp review queue; only an admin can approve or reject payment.
    const newStatus = "PENDING_REVIEW";
    const aiStatus = hasMismatch || isUnreadable ? "needs_manual_review" : "pending_review";
    const rawApprovalToken = generateApprovalToken(6);
    const approvalTokenHash = rawApprovalToken ? hashApprovalToken(rawApprovalToken) : null;
    const approvalTokenExpiresAt = rawApprovalToken ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;

    const aiNotes = [
      ...validationNotes,
      ...(isUnreadable ? ["AI tidak dapat membaca gambar dengan jelas."] : []),
    ];
    const auditSummary = aiNotes.length > 0
      ? `Catatan pembacaan AI (bukan keputusan pembayaran): ${aiNotes.join(" • ")} Admin wajib mengonfirmasi pembayaran melalui WhatsApp.`
      : `Pembacaan AI dicatat sebagai referensi saja: Merchant=${extracted.merchant_name}, Nominal=${extracted.amount}, TrxID=${extracted.transaction_id}, Tanggal=${extracted.transaction_date}, ProofSHA256=${proofSha256?.slice(0, 12)}... Menunggu konfirmasi manual admin melalui WhatsApp.`;

    await db.execute({
      sql: `UPDATE orders SET
        status = ?, approval_token = ?, approval_token_hash = ?, approval_token_expires_at = ?,
        approval_token_attempts = 0, proof_image = ?, proof_sha256 = ?, proof_storage_key = ?,
        proof_mime = ?, proof_size = ?, proof_uploaded_at = ?,
        ai_status = ?, ai_analysis = ?,
        ocr_merchant = ?, ocr_nmid = ?, ocr_amount = ?, ocr_transaction_id = ?, ocr_date = ?,
        ocr_status = ?, ocr_raw_result = ?
      WHERE id = ?`,
      args: [
        newStatus, rawApprovalToken, approvalTokenHash, approvalTokenExpiresAt,
        proofImage, proofSha256, `proof_${orderId}_${Date.now()}`,
        declaredMime, proofSize, now,
        aiStatus, auditSummary,
        extracted.merchant_name || null, extracted.nmid || null, extracted.amount || null,
        extracted.transaction_id || null, extracted.transaction_date || null,
        extracted.extracted_code, JSON.stringify(extracted),
        orderId,
      ],
    });

    await insertAuditLogEntry(db, {
      orderId: order.id,
      action: "PROOF_UPLOADED",
      actorEmail: user.email,
      provider: extracted.payment_provider || "QRIS",
      transactionId: extracted.transaction_id || "N/A",
      amount: order.amount,
      creditsGranted: 0,
      statusBefore: order.status,
      statusAfter: newStatus,
      notes: auditSummary,
      createdAt: now,
    });

    void notifyAdminViaWhatsApp({
      orderId,
      userEmail: order.user_email,
      amount: order.amount,
      approvalToken: rawApprovalToken || undefined,
      proofImage,
      ocrData: extracted,
    });

    return apiSuccess({
      orderId,
      status: "PENDING_REVIEW",
      isPendingReview: true,
      extracted,
      message: "Bukti pembayaran berhasil diterima dan telah dikirim ke admin WhatsApp untuk konfirmasi manual. Hasil pembacaan AI hanya digunakan sebagai referensi dan tidak menolak pesanan.",
    }, 200, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memproses bukti pembayaran.", 500, requestId);
  }
}
