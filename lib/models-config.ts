export type ModelTier = "starter" | "pro";
export type ModelHealthStatus = "healthy" | "degraded" | "unknown";

export type ModelItem = {
  id: string;
  name: string;
  tier: ModelTier;
  badge: string;
  isFlagship: boolean;
  successRate?: string;
  healthStatus?: ModelHealthStatus;
};

const FLAGSHIP_PATTERNS = [
  /claude-fable/i,
  /fable/i,
  /claude-opus/i,
  /claude-sonnet/i,
  /claude-3/i,
  /claude-4/i,
  /claude-5/i,
  /gpt-5/i,
  /gpt-4o(?!-mini)/i,
  /gpt-4-turbo/i,
  /gpt-4(?!-)/i,
  /\bo1\b/i,
  /\bo3\b/i,
  /glm-5/i,
  /kimi/i,
  /moonshot/i,
  /deepseek-v4-pro/i,
  /deepseek-v4-mod/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /mimo-v2\.5-pro/i,
  /minimax/i,
  /gemini-1\.5-pro/i,
  /gemini-2\.0-pro/i,
  /gemini-pro/i,
];

const STARTER_EXCEPTIONS = [
  /^auto$/i,
  /^auto-debug$/i,
  /^deepseek-v4-flash/i,
  /^hy3$/i,
  /gpt-4o-mini/i,
  /gemini-1\.5-flash/i,
  /claude-3-5-haiku/i,
];

export function isFlagshipModel(modelId: string): boolean {
  if (!modelId) return false;
  const id = modelId.trim().toLowerCase();

  if (STARTER_EXCEPTIONS.some((pattern) => pattern.test(id))) {
    return false;
  }

  if (FLAGSHIP_PATTERNS.some((pattern) => pattern.test(id))) {
    return true;
  }

  if (
    id.includes("pro") ||
    id.includes("opus") ||
    id.includes("sonnet") ||
    id.includes("fable") ||
    id.includes("reasoner")
  ) {
    return true;
  }

  return false;
}

// ─── Health Overrides (set by admin via /api/admin/model-health) ─────
const healthOverrides: Record<string, { status: ModelHealthStatus; successRate: string }> = {};

export function setModelHealthOverride(modelId: string, status: ModelHealthStatus, successRate: string): void {
  healthOverrides[modelId.trim().toLowerCase()] = { status, successRate };
}

export function getModelHealthOverride(modelId: string): { status: ModelHealthStatus; successRate: string } | null {
  return healthOverrides[modelId.trim().toLowerCase()] ?? null;
}

export function classifyModel(id: string, displayName?: string): ModelItem {
  const isFlagship = isFlagshipModel(id);
  const override = getModelHealthOverride(id);
  return {
    id,
    name: displayName || id,
    tier: isFlagship ? "pro" : "starter",
    badge: isFlagship ? "Flagship (Pro)" : "Starter",
    isFlagship,
    healthStatus: override?.status ?? "healthy",
    successRate: override?.successRate ?? "100%",
  };
}

// ─── In-Memory Cache for Model List ─────────────────────────────────
type CachedModels = {
  models: ModelItem[];
  fetchedAt: number;
};

let modelCache: CachedModels | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedModels(): ModelItem[] | null {
  if (!modelCache) return null;
  if (Date.now() - modelCache.fetchedAt > CACHE_TTL_MS) {
    modelCache = null;
    return null;
  }
  return modelCache.models;
}

export function setCachedModels(models: ModelItem[]): void {
  modelCache = { models, fetchedAt: Date.now() };
}

export function invalidateModelCache(): void {
  modelCache = null;
}
