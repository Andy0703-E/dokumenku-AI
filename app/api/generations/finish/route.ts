import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  getDatabase,
  executeAtomicDocumentFinalization,
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
  const cookieStore = await cookies();
  const {
    generationId,
    completed,
    documentType = "PRD",
    projectId = "default_project",
    fileName = "document.md",
    content = "",
    failureReason,
  } = (await request.json().catch(() => ({}))) as unknown as {
    generationId?: string;
    completed?: boolean;
    documentType?: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
    projectId?: string;
    fileName?: string;
    content?: string;
    failureReason?: string;
  };

  if (!generationId || typeof generationId !== "string") {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID pembuatan dokumen tidak valid.", 400, requestId);
  }

  if (user) {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();

      if (completed && content && content.trim().length > 50) {
        const finalizationResult = await executeAtomicDocumentFinalization(db, {
          userEmail: user.email,
          projectId,
          documentType,
          fileName,
          content,
          generationId,
        });

        if (!finalizationResult.ok) {
          return apiError(ERROR_CODES.DATABASE_TRANSACTION_FAILED, "Gagal menyimpan dokumen ke database. Kredit Anda tetap aman dalam reservasi dan dapat difinalisasi ulang.", 500, requestId);
        }

        return apiSuccess({
          status: "COMPLETED",
          generationId,
          credits: finalizationResult.availableCredits ?? 0,
          availableCredits: finalizationResult.availableCredits ?? 0,
          reservedCredits: finalizationResult.reservedCredits ?? 0,
          alreadyProcessed: finalizationResult.alreadyProcessed ?? false,
          message: `Dokumen ${documentType} berhasil disimpan dan kredit telah dikonfirmasi.`,
        }, 200, requestId);
      }

      if (completed && (!content || content.trim().length <= 50)) {
        const settleResult = await db.execute({
          sql: `UPDATE credit_reservations SET status = 'CAPTURED', settled_at = ? WHERE generation_id = ? AND status = 'RESERVED'`,
          args: [now, generationId],
        });
        if ((settleResult.rowsAffected ?? 0) > 0) {
          await db.execute({
            sql: `UPDATE users SET reserved_credits = MAX(0, COALESCE(reserved_credits, 0) - 25), updated_at = ? WHERE email = ?`,
            args: [now, user.email],
          });
        }
        await db.execute({
          sql: "UPDATE document_generations SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND user_email = ?",
          args: [now, generationId, user.email],
        });
        const userRow = await db.execute({
          sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
          args: [user.email],
        });
        const u = userRow.rows[0] as unknown as { available_credits: number; reserved_credits: number } | undefined;
        return apiSuccess({
          status: "COMPLETED",
          generationId,
          credits: u?.available_credits ?? 0,
          reservedCredits: u?.reserved_credits ?? 0,
          message: `Dokumen ${documentType} selesai. Kredit telah dikonfirmasi.`,
        }, 200, requestId);
      }

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

  // Guest Mode Handling
  if (!completed && failureReason) {
    let guestCredits = 0;
    const guestCookie = cookieStore.get("dokumenku_guest")?.value;
    if (guestCookie !== undefined) {
      const parsed = Number.parseInt(guestCookie, 10);
      if (!Number.isNaN(parsed)) guestCredits = parsed;
    }
    const refundedCredits = Math.min(3, guestCredits + 1);
    const response = apiSuccess({ ok: true, refunded: true }, 200, requestId);
    response.cookies.set("dokumenku_guest", String(refundedCredits), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  }

  return apiSuccess({ status: "COMPLETED", generationId }, 200, requestId);
}
