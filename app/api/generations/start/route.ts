import { NextRequest } from "next/server";
import { cookies } from "next/headers";
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
  } = (await request.json().catch(() => ({}))) as unknown as {
    selectedModel?: string;
    prompt?: string;
    projectId?: string;
    projectName?: string;
    documentType?: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
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
  const cookieStore = await cookies();
  const now = new Date().toISOString();
  const generationId = "gen_" + crypto.randomUUID();

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

      const resResult = await reserveCredits(db, {
        userEmail: user.email,
        generationId,
        amount: 1,
        documentType,
      });

      if (!resResult.ok) {
        return apiError(
          resResult.error === "CREDIT_RESERVATION_EXISTS" ? ERROR_CODES.CREDIT_RESERVATION_EXISTS : ERROR_CODES.CREDIT_INSUFFICIENT,
          undefined,
          402,
          requestId,
        );
      }

      await db.execute({
        sql: `INSERT INTO document_generations (id, user_email, project_id, document_type, model, prompt, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', ?)`,
        args: [generationId, user.email, projectId, documentType, modelId, cleanPrompt.slice(0, 1000), now],
      });

      return apiSuccess({
        generationId,
        credits: resResult.remainingCredits,
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
