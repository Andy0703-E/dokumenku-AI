import { NextRequest } from "next/server";
import {
  getDatabase,
  reconcileTerminalProviderAttempts,
  releaseCredits,
  settleGenerationCredits,
  updateGenerationTelemetry,
} from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { terminalDraftTelemetry } from "@/lib/generation-telemetry";
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
    preserveDraft = false,
  } = (await request.json().catch(() => ({}))) as unknown as {
    generationId?: string;
    completed?: boolean;
    documentType?: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT" | "ALL_DONE";
    failureReason?: string;
    preserveDraft?: boolean;
  };

  if (!generationId || typeof generationId !== "string") {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID pembuatan dokumen tidak valid.", 400, requestId);
  }

  if (user) {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      const ownedGeneration = await db.execute({
        sql: "SELECT id, status, project_id FROM document_generations WHERE id = ? AND LOWER(user_email) = LOWER(?)",
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
        const generation = ownedGeneration.rows[0] as { status?: string; project_id?: string };
        if (preserveDraft && generation.project_id) {
          const draftCount = await db.execute({
            sql: `SELECT COUNT(*) AS count FROM project_documents
              WHERE LOWER(user_email) = LOWER(?) AND project_id = ?
                AND status = 'DRAFT' AND LENGTH(TRIM(content)) > 0`,
            args: [user.email, generation.project_id],
          });
          const draftBlueprint = await db.execute({
            sql: `SELECT 1 FROM project_blueprints
              WHERE LOWER(user_email) = LOWER(?) AND project_id = ? AND generation_id = ? AND quality_status = 'FAILED'`,
            args: [user.email, generation.project_id, generationId],
          });
          if (Number(draftCount.rows[0]?.count ?? 0) === 4 && draftBlueprint.rows[0]) {
            const settled = await settleGenerationCredits(db, { generationId, userEmail: user.email });
            if (settled.ok) {
              await db.execute({
                sql: "UPDATE document_generations SET status = 'DRAFT_READY', completed_at = ? WHERE id = ? AND LOWER(user_email) = LOWER(?)",
                args: [now, generationId, user.email],
              });
              await reconcileTerminalProviderAttempts(db, generationId);
              // Server-authoritative telemetry update
              await updateGenerationTelemetry(db, generationId, {
                ...terminalDraftTelemetry(now),
              }, user.email).catch((e) => {
                console.error(`[TELEMETRY_WRITE_FAILED] gen=${generationId} fn=finish-draftReady error=${e instanceof Error ? e.message : String(e)}`);
              });
              return apiSuccess({
                status: "DRAFT_READY",
                generationId,
                refunded: false,
                credits: settled.availableCredits ?? 0,
                message: "Empat dokumen sudah tersimpan sebagai draf. Kredit digunakan satu kali dan draf tetap dapat diunduh atau direvisi.",
              }, 200, requestId);
            }
          }
        }

        const releaseResult = await releaseCredits(db, { generationId, reason: failureReason });
        if (!releaseResult.ok && releaseResult.error === "CREDIT_RESERVATION_INVALID_STATE") {
          return apiSuccess({
            status: generation.status === "DRAFT_READY" ? "DRAFT_READY" : "SETTLED",
            generationId,
            refunded: false,
            message: "Dokumen atau kredit telah diselesaikan sebelumnya; tidak ada kredit tambahan yang dikembalikan.",
          }, 200, requestId);
        }
        if (!releaseResult.ok) {
          return apiError(ERROR_CODES.CREDIT_RESERVATION_INVALID_STATE, "Reservasi kredit belum dapat diselesaikan. Silakan coba lagi; kredit tetap aman.", 409, requestId);
        }

        await db.execute({
          sql: "UPDATE document_generations SET status = 'FAILED', completed_at = ? WHERE id = ? AND user_email = ?",
          args: [now, generationId, user.email],
        });
        await reconcileTerminalProviderAttempts(db, generationId);

        // Server-authoritative telemetry update
        await updateGenerationTelemetry(db, generationId, {
          creditResult: "RELEASED",
          finalStatus: "FAILED",
        }, user.email).catch((e) => {
          console.error(`[TELEMETRY_WRITE_FAILED] gen=${generationId} fn=finish-released error=${e instanceof Error ? e.message : String(e)}`);
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
