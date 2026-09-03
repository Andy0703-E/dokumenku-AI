import { NextRequest } from "next/server";
import { getDatabase, executeAtomicPaymentApproval, insertAuditLogEntry } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";
import {
  ERROR_CODES,
  REJECTION_CODES,
  REJECTION_LABELS,
  RejectionCode,
  apiError,
  apiSuccess,
  generateRequestId,
} from "@/lib/errors";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentAdmin();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Akses terbatas untuk administrator.", 403, requestId);
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get("limit") || "10", 10) || 10));
  const offset = (page - 1) * limit;

  try {
    const db = await getDatabase();
    const countResult = await db.execute("SELECT COUNT(*) AS value FROM orders");
    const total = Number(countResult.rows[0]?.value ?? 0);
    const ordersResult = await db.execute({
      sql: `SELECT id, user_email AS userEmail, plan_name AS planName, amount, credits, payment_method AS paymentMethod, status, CASE WHEN proof_image IS NULL OR proof_image = '' THEN 0 ELSE 1 END AS hasProof, ai_status AS aiStatus, created_at AS createdAt, expires_at AS expiresAt, paid_at AS paidAt FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [limit, offset],
    });
    return apiSuccess({ orders: ordersResult.rows, total, page, limit }, 200, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memuat daftar pesanan.", 500, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentAdmin();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Forbidden: Akses hanya diizinkan untuk Admin.", 403, requestId);
  }

  const { orderId, action, reasonCode, reasonNote } = (await request.json().catch(() => ({}))) as unknown as {
    orderId?: string;
    action?: "approve" | "cancel" | "delete";
    reasonCode?: string;
    reasonNote?: string;
  };

  if (!orderId || typeof orderId !== "string" || orderId.length > 100) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID pesanan tidak valid.", 400, requestId);
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    if (action === "approve") {
      const result = await executeAtomicPaymentApproval(db, {
        orderId,
        actorEmail: user.email,
        notes: `Diverifikasi & Disetujui oleh Admin (${user.email}) setelah pemeriksaan mutasi riil via Dashboard`,
      });

      if (!result.ok) {
        return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, result.error || "Gagal menyetujui tagihan.", 400, requestId);
      }

      return apiSuccess({
        orderId,
        creditsGranted: result.creditsGranted,
        userEmail: result.order?.user_email,
        message: `Pembayaran ${orderId} berhasil diverifikasi! +${result.creditsGranted} Kredit ditambahkan ke ${result.order?.user_email}.`,
      }, 200, requestId);
    } else if (action === "delete") {
      const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
      const order = orderResult.rows[0] as unknown as { id: string; user_email: string; status: string; amount: number; payment_method: string } | undefined;

      if (!order) return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Tagihan tidak ditemukan.", 404, requestId);
      if (order.status === "PAID" || order.status === "paid" || order.status === "COMPLETED") {
        return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, "Invoice yang sudah membagikan kredit tidak dapat dihapus. Riwayat pembayaran tetap disimpan untuk menjaga saldo akun.", 409, requestId);
      }

      const transaction = await db.transaction("write");
      try {
        const ledgerResult = await transaction.execute({
          sql: "SELECT id FROM credit_transactions WHERE order_id = ? LIMIT 1",
          args: [orderId],
        });
        if (ledgerResult.rows[0]) {
          await transaction.rollback();
          return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, "Invoice ini sudah memiliki catatan kredit sehingga tidak dapat dihapus.", 409, requestId);
        }

        const deleted = await transaction.execute({
          sql: "DELETE FROM orders WHERE id = ? AND status NOT IN ('PAID', 'paid', 'COMPLETED')",
          args: [orderId],
        });
        if (deleted.rowsAffected !== 1) {
          await transaction.rollback();
          return apiError(ERROR_CODES.PAYMENT_INVALID_STATE, "Invoice tidak dapat dihapus karena statusnya telah berubah.", 409, requestId);
        }

        await insertAuditLogEntry(transaction, {
          orderId: order.id,
          action: "ORDER_DELETED",
          actorEmail: user.email,
          provider: order.payment_method || "QRIS",
          transactionId: "N/A",
          amount: order.amount,
          creditsGranted: 0,
          statusBefore: order.status,
          statusAfter: "DELETED",
          notes: `Invoice dihapus oleh administrator ${user.email}.`,
          createdAt: now,
        });
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      return apiSuccess({ orderId, status: "DELETED", message: `Invoice ${orderId} berhasil dihapus.` }, 200, requestId);
    } else if (action === "cancel") {
      const code = (reasonCode || "").trim().toUpperCase() as RejectionCode;

      if (!code || !REJECTION_CODES.includes(code)) {
        return apiError(ERROR_CODES.REJECTION_REASON_INVALID, "Alasan penolakan pembayaran wajib dipilih dari daftar yang valid.", 400, requestId);
      }

      const note = (reasonNote || "").trim();
      if (code === "OTHER" && !note) {
        return apiError(ERROR_CODES.REJECTION_NOTE_REQUIRED, "Catatan alasan penolakan wajib diisi jika memilih opsi 'Lainnya'.", 400, requestId);
      }

      const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
      const order = orderResult.rows[0] as unknown as { id: string; user_email: string; status: string; amount: number; payment_method: string } | undefined;

      if (!order) return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Tagihan tidak ditemukan.", 404, requestId);
      if (order.status === "PAID" || order.status === "paid") {
        return apiError(ERROR_CODES.PAYMENT_ALREADY_PROCESSED, "Tagihan tidak dapat ditolak karena sudah berstatus LUNAS (PAID).", 409, requestId);
      }

      const reasonLabel = REJECTION_LABELS[code] || "Penolakan administratif";
      const formattedReason = note ? `${reasonLabel} (${note})` : reasonLabel;
      const userFacingMessage = `Pembayaran belum dapat diverifikasi. Alasan: ${formattedReason}.`;

      await db.execute({
        sql: `UPDATE orders SET status = 'REJECTED', ai_status = 'rejected_by_admin', approval_token = NULL, approval_token_hash = NULL, ai_analysis = ? WHERE id = ?`,
        args: [userFacingMessage, orderId],
      });

      await insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_REJECTED",
        actorEmail: user.email,
        provider: order.payment_method || "QRIS",
        transactionId: "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: "REJECTED",
        notes: `Ditolak oleh Admin (${user.email}). Kode: ${code}. Keterangan: ${formattedReason}`,
        createdAt: now,
      });

      return apiSuccess({
        orderId,
        status: "REJECTED",
        reasonCode: code,
        reasonLabel: formattedReason,
        message: `Tagihan ${orderId} berhasil ditolak. Alasan: ${formattedReason}`,
      }, 200, requestId);
    }

    return apiError(ERROR_CODES.VALIDATION_FAILED, "Aksi tidak valid.", 400, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memproses aksi pesanan.", 500, requestId);
  }
}
