import { NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getModelHealthOverrides, invalidateModelCache, setModelHealthOverride, type ModelHealthStatus } from "@/lib/models-config";
import { apiError, apiSuccess, generateRequestId } from "@/lib/errors";

// This endpoint only stores explicit temporary overrides made by an admin.
// The normal model state comes directly from the provider's `enabled` field.
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
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

  setModelHealthOverride(modelId, healthStatus as ModelHealthStatus, statusNote?.trim() || undefined);
  invalidateModelCache();

  return apiSuccess({ ok: true, modelId, healthStatus }, 200, requestId);
}

export async function GET() {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  return apiSuccess(getModelHealthOverrides(), 200, requestId);
}
