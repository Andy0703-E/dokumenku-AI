import { NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { setModelHealthOverride, getModelHealthOverride, invalidateModelCache, type ModelHealthStatus } from "@/lib/models-config";
import { apiError, apiSuccess, generateRequestId } from "@/lib/errors";

const KNOWN_MODEL_STATS: Record<string, { health: ModelHealthStatus; rate: string }> = {
  "auto": { health: "healthy", rate: "100%" },
  "auto-debug": { health: "degraded", rate: "0%" },
  "claude-fable-5-b": { health: "degraded", rate: "0%" },
  "claude-opus-5": { health: "degraded", rate: "0%" },
  "claude-opus-5-b": { health: "degraded", rate: "0%" },
  "claude-sonnet-5": { health: "degraded", rate: "0%" },
  "claude-sonnet-5-b": { health: "degraded", rate: "0%" },
  "deepseek-v4-flash": { health: "healthy", rate: "100%" },
  "deepseek-v4-flash-0731": { health: "degraded", rate: "0%" },
  "deepseek-v4-flash-vision-exp": { health: "degraded", rate: "0%" },
  "deepseek-v4-mod": { health: "healthy", rate: "100%" },
  "deepseek-v4-pro": { health: "healthy", rate: "100%" },
  "deepseek-v4-pro-0813": { health: "healthy", rate: "100%" },
  "glm-5.1": { health: "degraded", rate: "0%" },
  "glm-5.2": { health: "healthy", rate: "100%" },
  "glm-5.3": { health: "healthy", rate: "100%" },
  "glm-5.3-flash": { health: "healthy", rate: "100%" },
  "gpt-5.6": { health: "degraded", rate: "0%" },
  "gpt-5.6-luna": { health: "degraded", rate: "0%" },
  "gpt-5.6-sol": { health: "degraded", rate: "0%" },
  "gpt-5.6-sol-xhigh": { health: "degraded", rate: "0%" },
  "gpt-5.6-terra": { health: "degraded", rate: "0%" },
  "hy3": { health: "healthy", rate: "100%" },
  "kimi-k2.6": { health: "degraded", rate: "0%" },
  "kimi-k2.7-code": { health: "degraded", rate: "0%" },
  "kimi-k2.7-code-highspeed": { health: "degraded", rate: "0%" },
  "kimi-k3": { health: "healthy", rate: "100%" },
  "mimo-v2.5-pro": { health: "healthy", rate: "100%" },
  "minimax-m3": { health: "healthy", rate: "100%" },
};

export function bootstrapModelHealth(): void {
  for (const [id, { health, rate }] of Object.entries(KNOWN_MODEL_STATS)) {
    if (!getModelHealthOverride(id)) {
      setModelHealthOverride(id, health, rate);
    }
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  const body = await request.json().catch(() => ({}));
  const { modelId, healthStatus, successRate } = body as {
    modelId?: string;
    healthStatus?: "healthy" | "degraded";
    successRate?: string;
  };

  if (!modelId || !healthStatus) {
    return apiError("VALIDATION_FAILED", "modelId and healthStatus required.", 400, requestId);
  }

  setModelHealthOverride(modelId, healthStatus as ModelHealthStatus, successRate ?? (healthStatus === "healthy" ? "100%" : "0%"));
  invalidateModelCache();

  return apiSuccess({ ok: true, modelId, healthStatus }, 200, requestId);
}

export async function GET() {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  const result = Object.entries(KNOWN_MODEL_STATS).map(([id, { health, rate }]) => {
    const override = getModelHealthOverride(id);
    return {
      modelId: id,
      healthStatus: override?.status ?? health,
      successRate: override?.successRate ?? rate,
    };
  });

  return apiSuccess(result, 200, requestId);
}
