import { NextRequest } from "next/server";
import { getDatabase, executeAtomicPaymentApproval, insertAuditLogEntry } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ERROR_CODES,
  REJECTION_CODES,
  REJECTION_LABELS,
  RejectionCode,
  apiError,
  apiSuccess,
  generateRequestId,
} from "@/lib/errors";

export async function GET() {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Akses terbatas untuk administrator.", 403, requestId);
  }

  try {
    const db = await getDatabase();
    const ordersResult = await db.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100");
    return apiSuccess({ orders: ordersResult.rows }, 200, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memuat daftar pesanan.", 500, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Forbidden: Akses hanya diizinkan untuk Admin.", 403, requestId);
  }

  const { orderId, action, reasonCode, reasonNote } = (await request.json().catch(() => ({}))) as unknown as {
    orderId?: string;
    action?: "approve" | "cancel";
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
