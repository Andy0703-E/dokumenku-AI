import { NextRequest } from "next/server";
import {
  getDatabase,
  reserveCredits,
  checkProjectDependencies,
} from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isFlagshipModel, isAutoModel } from "@/lib/models-config";
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
    selectedModel,
    prompt,
    projectId = "default_project",
    projectName = "",
    documentType = "PRD",
    idempotencyKey,
  } = (await request.json().catch(() => ({}))) as unknown as {
    selectedModel?: string;
    prompt?: string;
    projectId?: string;
    projectName?: string;
    documentType?: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
    idempotencyKey?: string;
  };

  if (!selectedModel?.trim()) {
    return apiError(ERROR_CODES.AI_MODEL_UNAVAILABLE, "Pilih model AI terlebih dahulu.", 400, requestId);
  }

  const cleanPrompt = (prompt || "").trim();
  if (cleanPrompt.length > 50000) {
    return apiError(ERROR_CODES.INPUT_PROJECT_PROMPT_TOO_LONG, undefined, 400, requestId);
  }

  const modelId = selectedModel.trim();
  const isAuto = isAutoModel(modelId);
  const isFlagship = !isAuto && isFlagshipModel(modelId);
  const now = new Date().toISOString();
  const suppliedKey = typeof idempotencyKey === "string" ? idempotencyKey.trim() : request.headers.get("Idempotency-Key")?.trim() || "";
  if (suppliedKey && !/^[a-zA-Z0-9_-]{16,128}$/.test(suppliedKey)) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "ID permintaan pembuatan dokumen tidak valid.", 400, requestId);
  }
  const startRequestKey = suppliedKey || `start_${crypto.randomUUID()}`;

  if (user) {
    try {
      const db = await getDatabase();


      const depCheck = await checkProjectDependencies(db, {
        userEmail: user.email,
        projectId,
        documentType,
      });

      if (!depCheck.ok) {
        if (depCheck.missingDependency === "PRD") {
          return apiError(ERROR_CODES.AI_PRD_REQUIRED, "PRD belum tersedia. Selesaikan dokumen PRD terlebih dahulu.", 400, requestId);
        }
        return apiError(ERROR_CODES.AI_DEPENDENCY_MISSING, `Dokumen ${depCheck.missingDependency} dibutuhkan sebagai sumber konteks sebelum membuat ${documentType}.`, 400, requestId);
      }

      // Flagship model restriction: only enforce for non-auto explicit model selection.
      // Auto mode handles tier-appropriate selection internally.
      if (isFlagship && user.role !== "admin") {
        const purchasedResult = await db.execute({
          sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
          args: [user.email],
        });
        if (!purchasedResult.rows[0]) {
          return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Model Flagship eksklusif untuk akun Pro Studio. Silakan gunakan model Starter atau upgrade paket.", 403, requestId);
        }
      }

      // Register the browser action before reserving a credit. A repeated
      // request therefore reuses the same generation, even if the first
      // response was lost while the browser was refreshing.
      let generationId = "gen_" + crypto.randomUUID();
      const requestInsert = await db.execute({
        sql: `INSERT OR IGNORE INTO generation_start_requests
          (user_email, idempotency_key, generation_id, status, created_at, updated_at)
          VALUES (?, ?, ?, 'STARTING', ?, ?)`,
        args: [user.email, startRequestKey, generationId, now, now],
      });
      if (requestInsert.rowsAffected !== 1) {
        const prior = await db.execute({
          sql: `SELECT generation_id FROM generation_start_requests
            WHERE LOWER(user_email) = LOWER(?) AND idempotency_key = ?`,
          args: [user.email, startRequestKey],
        });
        const priorGenerationId = prior.rows[0]?.generation_id;
        if (typeof priorGenerationId !== "string" || !priorGenerationId) {
          return apiError(ERROR_CODES.GENERATION_INVALID_STATE, "Permintaan sebelumnya masih disiapkan. Silakan coba lagi.", 409, requestId);
        }
        generationId = priorGenerationId;
        const priorGeneration = await db.execute({
          sql: `SELECT id FROM document_generations WHERE id = ? AND LOWER(user_email) = LOWER(?)`,
          args: [generationId, user.email],
        });
        if (priorGeneration.rows[0]) {
          const balance = await db.execute({
            sql: "SELECT available_credits FROM users WHERE LOWER(email) = LOWER(?)",
            args: [user.email],
          });
          return apiSuccess({
            generationId,
            credits: Number(balance.rows[0]?.available_credits ?? 0),
            reservedCredits: 1,
            documentType,
            authenticated: true,
            replayed: true,
          }, 200, requestId);
        }
      }

      const resResult = await reserveCredits(db, {
        userEmail: user.email,
        generationId,
        amount: 1,
        documentType,
      });

      if (!resResult.ok && resResult.error !== "CREDIT_RESERVATION_EXISTS") {
        await db.execute({
          sql: "DELETE FROM generation_start_requests WHERE LOWER(user_email) = LOWER(?) AND idempotency_key = ? AND generation_id = ?",
          args: [user.email, startRequestKey, generationId],
        });
        return apiError(
          resResult.error === "CREDIT_RESERVATION_EXISTS" ? ERROR_CODES.CREDIT_RESERVATION_EXISTS : ERROR_CODES.CREDIT_INSUFFICIENT,
          undefined,
          402,
          requestId,
        );
      }

      await db.execute({
        sql: `INSERT INTO document_generations (id, user_email, project_id, document_type, model, prompt, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', ?)
          ON CONFLICT(id) DO NOTHING`,
        args: [generationId, user.email, projectId, documentType, modelId, cleanPrompt.slice(0, 1000), now],
      });

      await db.execute({
        sql: `UPDATE generation_start_requests SET status = 'STARTED', updated_at = ?
          WHERE LOWER(user_email) = LOWER(?) AND idempotency_key = ? AND generation_id = ?`,
        args: [now, user.email, startRequestKey, generationId],
      });

      const balance = await db.execute({
        sql: "SELECT available_credits, reserved_credits FROM users WHERE LOWER(email) = LOWER(?)",
        args: [user.email],
      });

      return apiSuccess({
        generationId,
        credits: Number(balance.rows[0]?.available_credits ?? resResult.remainingCredits ?? 0),
        reservedCredits: 1,
        documentType,
        authenticated: true,
      }, 201, requestId);
    } catch (error) {
      return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Pembuatan dokumen tidak dapat dimulai.", 500, requestId);
    }
  }

  return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Silakan masuk atau daftar akun terlebih dahulu.", 401, requestId);
}
