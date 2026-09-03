export type ModelTier = "starter" | "pro";
export type ModelHealthStatus = "healthy" | "degraded" | "maintenance" | "unknown";

export type ModelItem = {
  id: string;
  name: string;
  tier: ModelTier;
  badge: string;
  isFlagship: boolean;
  healthStatus: ModelHealthStatus;
  availabilityLabel: string;
  statusSource: "provider" | "admin";
  providerGrade?: string;
  supportsVision?: boolean;
};

export type ProviderModelMetadata = {
  enabled?: boolean;
  grade?: string;
  vision?: boolean;
};

// ── Hardcoded Models (not returned by /models endpoint) ─────────────────────
// Models that work via the API but don't appear in the models list.
// Used as aliases or internal promotional models.
//
// ⚠️ NOTE: promo:05 and promo:05-repair have been REMOVED because they route
// to sf/step-3.5-flash and sf/step-3.7-flash, which experience chronic timeouts.
// The system now relies on direct model selection or provider-exposed models.
export const HARDCODED_MODELS: Array<{ id: string; name: string; tier: ModelTier; tokenMultiplier?: number }> = [
  // Removed: promo:05 and promo:05-repair (timeout-prone)
  // { id: "promo:05", name: "Promo 0,5 (3.5→3.5-2603→3.7)", tier: "starter", tokenMultiplier: 0.5 },
  // { id: "promo:05-repair", name: "Promo 0,5 Repair (3.7→3.5-2603→3.5)", tier: "starter", tokenMultiplier: 0.5 },
  
  { id: "auto:free", name: "Auto Free Model", tier: "starter", tokenMultiplier: 0 },
  
  // Removed: Individual step-flash models (timeout-prone)
  // { id: "sf/step-3.5-flash", name: "Step 3.5 Flash", tier: "starter", tokenMultiplier: 0.5 },
  // { id: "sf/step-3.5-flash-2603", name: "Step 3.5 Flash 2603", tier: "starter", tokenMultiplier: 0.5 },
  // { id: "sf/step-3.7-flash", name: "Step 3.7 Flash", tier: "starter", tokenMultiplier: 0.5 },
  //
  // These models are now retrieved from provider's /models endpoint or admin panel
  // and will be prioritized based on availability and performance stats.
];

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
  /^deepseek-v4-flash/i,
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
// Provider availability remains the default source of truth. An override is
// only for an explicit temporary administrative decision.
const healthOverrides: Record<string, { status: ModelHealthStatus; note?: string }> = {};

export function setModelHealthOverride(modelId: string, status: ModelHealthStatus, note?: string): void {
  healthOverrides[modelId.trim().toLowerCase()] = { status, note };
}

export function getModelHealthOverride(modelId: string): { status: ModelHealthStatus; note?: string } | null {
  return healthOverrides[modelId.trim().toLowerCase()] ?? null;
}

export function getModelHealthOverrides(): Array<{ modelId: string; status: ModelHealthStatus; note?: string }> {
  return Object.entries(healthOverrides).map(([modelId, override]) => ({ modelId, ...override }));
}

function getProviderAvailability(enabled: boolean | undefined): Pick<ModelItem, "healthStatus" | "availabilityLabel"> {
  if (enabled === true) {
    return { healthStatus: "healthy", availabilityLabel: "Aktif di provider" };
  }

  if (enabled === false) {
    return { healthStatus: "degraded", availabilityLabel: "Tidak aktif di provider" };
  }

  return { healthStatus: "unknown", availabilityLabel: "Status belum tersedia dari provider" };
}

export function classifyModel(id: string, displayName?: string, providerMetadata: ProviderModelMetadata = {}): ModelItem {
  const isFlagship = isFlagshipModel(id);
  const override = getModelHealthOverride(id);
  const providerAvailability = getProviderAvailability(providerMetadata.enabled);

  return {
    id,
    name: displayName || id,
    tier: isFlagship ? "pro" : "starter",
    badge: isFlagship ? "Flagship (Pro)" : "Starter",
    isFlagship,
    healthStatus: override?.status ?? providerAvailability.healthStatus,
    availabilityLabel: override?.note || (override ? "Status diatur admin" : providerAvailability.availabilityLabel),
    statusSource: override ? "admin" : "provider",
    providerGrade: providerMetadata.grade,
    supportsVision: providerMetadata.vision,
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

// ─── Auto-Routing Helpers ────────────────────────────────────────────────

/**
 * Check if a model ID represents the "auto" routing mode.
 */
export function isAutoModel(modelId: string): boolean {
  return modelId.trim().toLowerCase() === "auto";
}

/**
 * Filter models to only those usable for auto-routing:
 * - Not in maintenance
 * - Not disabled by provider
 * - Has a valid ID
 */
export function getUsableModels(models: ModelItem[]): ModelItem[] {
  return models.filter(
    (m) =>
      m.id &&
      m.id !== "auto" &&
      m.id !== "auto-debug" &&
      m.id !== "hy3" &&
      m.healthStatus !== "maintenance",
  );
}
