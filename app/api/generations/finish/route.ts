import { NextRequest } from "next/server";
import {
  getDatabase,
  releaseCredits,
} from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ERROR_CODES,
  apiError,
  apiSuccess,
  generateRequestId,
} from "@/lib/errors";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  const {
    generationId,
    completed,
    documentType = "PRD",
    failureReason,
  } = (await request.json().catch(() => ({}))) as unknown as {
    generationId?: string;
    completed?: boolean;
    documentType?: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT" | "ALL_DONE";
    failureReason?: string;
  };

  if (!generationId || typeof generationId !== "string") {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID pembuatan dokumen tidak valid.", 400, requestId);
  }

  if (user) {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const ownedGeneration = await db.execute({
        sql: "SELECT id FROM document_generations WHERE id = ? AND LOWER(user_email) = LOWER(?)",
        args: [generationId, user.email],
      });
      if (!ownedGeneration.rows[0]) {
        return apiError(ERROR_CODES.RESOURCE_FORBIDDEN, "Sesi pembuatan dokumen tidak ditemukan atau bukan milik akun Anda.", 403, requestId);
      }

      // Successful finalization is intentionally server-owned by Quality Gate V2.1.
      // This endpoint only releases a failed reservation; it must not be usable to
      // capture a credit or publish files directly from a browser request.
      if (documentType === "ALL_DONE") {
        return apiError(
          ERROR_CODES.GENERATION_INVALID_STATE,
          "Finalisasi dokumen dilakukan otomatis oleh Blueprint Quality Gate V2.1.",
          409,
          requestId,
        );
      }

      if (completed) {
        return apiError(
          ERROR_CODES.GENERATION_INVALID_STATE,
          "Simpan dan penangkapan kredit hanya dapat dilakukan setelah Blueprint Quality Gate V2.1 lulus.",
          409,
          requestId,
        );
      }

      // ── Failure: release credits ────────────────────────────────
      if (failureReason) {
        await releaseCredits(db, { generationId, reason: failureReason });

        await db.execute({
          sql: "UPDATE document_generations SET status = 'FAILED', completed_at = ? WHERE id = ? AND user_email = ?",
          args: [now, generationId, user.email],
        });

        const userRowResult = await db.execute({
          sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
          args: [user.email],
        });
        const userRow = userRowResult.rows[0] as unknown as { available_credits: number; reserved_credits: number };

        return apiSuccess({
          status: "RELEASED",
          generationId,
          refunded: true,
          credits: userRow?.available_credits ?? 0,
          message: `Pembuatan dokumen ${documentType} gagal. Saldo reservasi kredit telah dikembalikan secara penuh.`,
        }, 200, requestId);
      }

      return apiSuccess({ status: "GENERATING", generationId, message: "Status generasi tetap aktif di server." }, 200, requestId);
    } catch (error) {
      return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal menyelesaikan proses dokumen.", 500, requestId);
    }
  }

  return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Silakan masuk atau daftar akun terlebih dahulu.", 401, requestId);
}
