import { NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getDatabase, upsertModelOverride, loadModelOverrides, deleteModelOverride } from "@/db";
import { setModelHealthOverride, getModelHealthOverrides, invalidateModelCache, type ModelHealthStatus } from "@/lib/models-config";
import { apiError, apiSuccess, generateRequestId } from "@/lib/errors";

// POST: Set model health override (persisted to DB)
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const admin = await getCurrentAdmin();
  if (!admin) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  const body = await request.json().catch(() => ({}));
  const { modelId, healthStatus, statusNote } = body as {
    modelId?: string;
    healthStatus?: "healthy" | "degraded" | "maintenance";
    statusNote?: string;
  };

  if (!modelId || !healthStatus) {
    return apiError("VALIDATION_FAILED", "modelId and healthStatus required.", 400, requestId);
  }

  // Set in-memory override
  setModelHealthOverride(modelId, healthStatus as ModelHealthStatus, statusNote?.trim() || undefined);
  invalidateModelCache();

  // Persist to DB
  try {
    const db = await getDatabase();
    await upsertModelOverride(db, {
      overrideType: "health",
      targetKey: modelId.trim().toLowerCase(),
      value: healthStatus,
      note: statusNote?.trim() || undefined,
      createdBy: admin.email,
    });
  } catch {
    // In-memory override still works even if DB persistence fails
  }

  return apiSuccess({ ok: true, modelId, healthStatus }, 200, requestId);
}

// GET: List all model health overrides
export async function GET() {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  // Return in-memory overrides (includes any loaded from DB at startup)
  return apiSuccess(getModelHealthOverrides(), 200, requestId);
}
