import { NextRequest } from "next/server";
import { getDatabase, insertAuditLogEntry } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { ERROR_CODES, apiError, apiSuccess, generateRequestId } from "@/lib/errors";

/**
 * The payment receipt is deliberately sent by the customer to the admin's
 * WhatsApp. This endpoint only puts the owned invoice into the manual review
 * queue; it never receives the image and it never adds credits.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_SESSION_EXPIRED, undefined, 401, requestId);
  }

  const { orderId } = (await request.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId || typeof orderId !== "string" || orderId.length > 100) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID invoice tidak valid.", 400, requestId);
  }

  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: "SELECT id, user_email, amount, credits, payment_method, status, expires_at FROM orders WHERE id = ?",
      args: [orderId],
    });
    const order = result.rows[0] as unknown as {
      id: string;
      user_email: string;
      amount: number;
      credits: number;
      payment_method: string;
      status: string;
      expires_at?: string | null;
    } | undefined;

    if (!order || order.user_email !== user.email) {
      return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Invoice tidak ditemukan.", 404, requestId);
    }
    if (order.status === "PAID" || order.status === "paid" || order.status === "COMPLETED") {
      return apiError(ERROR_CODES.PAYMENT_ALREADY_PROCESSED, "Kredit untuk invoice ini sudah ditambahkan.", 409, requestId);
    }
    if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      return apiError(ERROR_CODES.PAYMENT_ORDER_EXPIRED, "Invoice ini sudah kedaluwarsa. Buat pesanan baru untuk melanjutkan pembayaran.", 409, requestId);
    }
    if (order.status === "PENDING_REVIEW") {
      return apiSuccess({
        orderId,
        status: "PENDING_REVIEW",
        isPendingReview: true,
        message: "Invoice ini sudah menunggu pemeriksaan administrator.",
      }, 200, requestId);
    }
    if (order.status !== "CREATED") {
      return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, "Invoice tidak dapat dikirim untuk diperiksa pada status saat ini.", 409, requestId);
    }

    const now = new Date().toISOString();
    const manualReference = `MANUAL-WA-${order.id}`;
    const transaction = await db.transaction("write");
    try {
      const updated = await transaction.execute({
        sql: `UPDATE orders SET
          status = 'PENDING_REVIEW',
          proof_storage_key = 'whatsapp_manual',
          proof_uploaded_at = ?,
          ai_status = 'payment_pending_admin',
          ai_analysis = 'Bukti pembayaran dikirim pengguna melalui WhatsApp. Menunggu persetujuan administrator.',
          ocr_transaction_id = ?,
          ocr_status = 'MANUAL_WHATSAPP'
        WHERE id = ? AND status = 'CREATED'`,
        args: [now, manualReference, order.id],
      });

      if (updated.rowsAffected !== 1) {
        await transaction.rollback();
        return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, "Status invoice berubah. Muat ulang halaman lalu coba kembali.", 409, requestId);
      }

      await insertAuditLogEntry(transaction, {
        orderId: order.id,
        action: "PROOF_SENT_VIA_WHATSAPP",
        actorEmail: user.email,
        provider: order.payment_method || "QRIS",
        transactionId: manualReference,
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: "PENDING_REVIEW",
        notes: "Pengguna menyatakan bukti pembayaran dikirim sendiri melalui WhatsApp; menunggu pemeriksaan administrator.",
        createdAt: now,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return apiSuccess({
      orderId,
      status: "PENDING_REVIEW",
      isPendingReview: true,
      message: "Invoice sudah masuk antrean pemeriksaan. Kredit hanya ditambahkan setelah admin menyetujui pembayaran.",
    }, 200, requestId);
  } catch (error) {
    return apiError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Gagal mengirim invoice ke antrean pemeriksaan.",
      500,
      requestId,
    );
  }
}
