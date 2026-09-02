import { NextRequest } from "next/server";
import { getDatabase, insertAuditLogEntry } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";
import { ERROR_CODES, apiError, apiSuccess, generateRequestId } from "@/lib/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Permanently deletes a regular user and their non-audit data. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const requestId = generateRequestId();
  const admin = await getCurrentAdmin();
  if (!admin) {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Akses terbatas untuk administrator.", 403, requestId);
  }

  const { email: rawEmail } = await params;
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "Email pengguna tidak valid.", 400, requestId);
  }

  try {
    const db = await getDatabase();
    const userResult = await db.execute({
      sql: "SELECT email FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      args: [email],
    });
    if (!userResult.rows[0]) {
      return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Pengguna tidak ditemukan.", 404, requestId);
    }

    // Admin records are managed separately and must not be removed through
    // the regular-user deletion control.
    const adminResult = await db.execute({
      sql: "SELECT id FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1",
      args: [email],
    });
    if (adminResult.rows[0]) {
      return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Akun administrator tidak dapat dihapus dari daftar pengguna.", 409, requestId);
    }

    const transaction = await db.transaction("write");
    try {
      await transaction.execute({
        sql: "DELETE FROM provider_attempts WHERE generation_id IN (SELECT id FROM document_generations WHERE user_email = ?)",
        args: [email],
      });
      await transaction.execute({ sql: "DELETE FROM generation_telemetry WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM generation_start_requests WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM credit_reservations WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM project_document_revisions WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM project_revision_requests WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM project_blueprints WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM project_documents WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM document_generations WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM verified_transactions WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM credit_transactions WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM orders WHERE user_email = ?", args: [email] });
      await transaction.execute({ sql: "DELETE FROM chat_messages WHERE user_email = ?", args: [email] });
      const deleted = await transaction.execute({ sql: "DELETE FROM users WHERE LOWER(email) = LOWER(?)", args: [email] });
      if (deleted.rowsAffected !== 1) {
        await transaction.rollback();
        return apiError(ERROR_CODES.RESOURCE_NOT_FOUND, "Pengguna tidak ditemukan.", 404, requestId);
      }

      await insertAuditLogEntry(transaction, {
        orderId: `USER-DELETED-${email}`,
        action: "USER_DELETED",
        actorEmail: admin.email,
        provider: "ADMIN",
        transactionId: "N/A",
        amount: 0,
        creditsGranted: 0,
        statusBefore: "ACTIVE",
        statusAfter: "DELETED",
        notes: `Akun pengguna ${email} beserta data non-auditnya dihapus oleh administrator.`,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return apiSuccess({ email, message: "Pengguna dan data terkait berhasil dihapus." }, 200, requestId);
  } catch (error) {
    return apiError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Gagal menghapus pengguna.",
      500,
      requestId,
    );
  }
}
