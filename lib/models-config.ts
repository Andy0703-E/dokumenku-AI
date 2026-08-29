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

// Known live statistics from upstream provider (Pecut Market)
const UPSTREAM_HEALTH_MAP: Record<string, { success: string; health: ModelHealthStatus }> = {
  // Verified 100% Active & Ready
  "deepseek-v4-flash-0731": { success: "100%", health: "healthy" },
  "deepseek-v4-mod": { success: "100%", health: "healthy" },
  "glm-5.2": { success: "100%", health: "healthy" },
  "glm-5.3": { success: "100%", health: "healthy" },
  "glm-5.3-flash": { success: "100%", health: "healthy" },
  "kimi-k2.7-code": { success: "100%", health: "healthy" },

  // Known 0% / Offline at Provider Upstream
  "claude-fable-5-b": { success: "0%", health: "degraded" },
  "claude-opus-5": { success: "0%", health: "degraded" },
  "claude-opus-5-b": { success: "0%", health: "degraded" },
  "claude-sonnet-5": { success: "0%", health: "degraded" },
  "claude-sonnet-5-b": { success: "0%", health: "degraded" },
  "gpt-5.6": { success: "0%", health: "degraded" },
  "gpt-5.6-luna": { success: "0%", health: "degraded" },
  "gpt-5.6-sol": { success: "0%", health: "degraded" },
  "gpt-5.6-sol-xhigh": { success: "0%", health: "degraded" },
  "gpt-5.6-terra": { success: "0%", health: "degraded" },
  "auto": { success: "0%", health: "degraded" },
  "auto-debug": { success: "0%", health: "degraded" },
  "deepseek-v4-flash": { success: "0%", health: "degraded" },
  "deepseek-v4-flash-vision-exp": { success: "0%", health: "degraded" },
  "deepseek-v4-pro": { success: "0%", health: "degraded" },
  "deepseek-v4-pro-0813": { success: "0%", health: "degraded" },
  "glm-5.1": { success: "0%", health: "degraded" },
  "hy3": { success: "0%", health: "degraded" },
  "kimi-k2.6": { success: "—", health: "degraded" },
  "kimi-k2.7-code-highspeed": { success: "0%", health: "degraded" },
  "kimi-k3": { success: "0%", health: "degraded" },
  "mimo-v2.5-pro": { success: "0%", health: "degraded" },
  "minimax-m3": { success: "0%", health: "degraded" },
};

export function isModelHealthy(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return UPSTREAM_HEALTH_MAP[normalized]?.health === "healthy";
}

export function getModelHealth(modelId: string): { successRate: string; healthStatus: ModelHealthStatus } {
  const normalized = modelId.trim().toLowerCase();
  if (UPSTREAM_HEALTH_MAP[normalized]) {
    return {
      successRate: UPSTREAM_HEALTH_MAP[normalized].success,
      healthStatus: UPSTREAM_HEALTH_MAP[normalized].health,
    };
  }
  return { successRate: "—", healthStatus: "unknown" };
}

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

// Explicit starter models that should stay in starter even if matching general words
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

  // If in explicit starter exceptions, it's starter
  if (STARTER_EXCEPTIONS.some((pattern) => pattern.test(id))) {
    return false;
  }

  // If matches any flagship patterns (e.g. claude-fable, glm-5, gpt-5.6, kimi-k3, etc.)
  if (FLAGSHIP_PATTERNS.some((pattern) => pattern.test(id))) {
    return true;
  }

  // Standard heuristics: pro, reasoner, opus, sonnet are flagship
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

export function classifyModel(id: string, displayName?: string): ModelItem {
  const isFlagship = isFlagshipModel(id);
  const { successRate, healthStatus } = getModelHealth(id);
  return {
    id,
    name: displayName || id,
    tier: isFlagship ? "pro" : "starter",
    badge: isFlagship ? "Flagship (Pro)" : "Starter",
    isFlagship,
    successRate,
    healthStatus,
  };
}
