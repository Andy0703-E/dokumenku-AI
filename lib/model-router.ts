/**
 * Dokumenku AI — Auto Model Router
 *
 * Selects the best model for each document generation stage based on:
 * - Stage-specific capability scores (JSON, reasoning, coding, design)
 * - Provider health status
 * - In-memory success/failure statistics
 * - User tier (starter vs pro)
 *
 * Fallback chain: primary → fallback #1 → fallback #2 → deterministic recovery
 */

import type { ModelItem } from "./models-config";

// ── Stage Definitions ──────────────────────────────────────────────────────

export type GenerationStage =
  | "blueprint"
  | "prd"
  | "tech-stack"
  | "ui-ux"
  | "schema"
  | "revision";

export const ROUTING_VERSION = "1.0.0";

// ── Per-Stage Model Preferences ────────────────────────────────────────────
// Higher weight = more important for that stage.
// These are base preferences; actual selection is weighted by runtime stats.

type StagePreference = {
  /** Regex patterns that indicate strong suitability for this stage */
  preferredPatterns: RegExp[];
  /** Regex patterns that indicate poor suitability (deprioritized) */
  avoidPatterns: RegExp[];
  /** Base score bonus for models matching preferred patterns (0-30) */
  preferredBonus: number;
  /** Penalty for models matching avoid patterns (0-50) */
  avoidPenalty: number;
};

const STAGE_PREFERENCES: Record<GenerationStage, StagePreference> = {
  blueprint: {
    preferredPatterns: [
      /glm-5/i,
      /claude-sonnet/i,
      /gpt-4o(?!-mini)/i,
      /gemini-pro/i,
      /deepseek-v4-pro/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
      /lite/i,
    ],
    preferredBonus: 20,
    avoidPenalty: 30,
  },
  prd: {
    preferredPatterns: [
      /claude-opus/i,
      /claude-sonnet/i,
      /gpt-5/i,
      /deepseek-r1/i,
      /deepseek-reasoner/i,
      /glm-5/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
    ],
    preferredBonus: 25,
    avoidPenalty: 30,
  },
  "tech-stack": {
    preferredPatterns: [
      /claude-sonnet/i,
      /deepseek-v4-pro/i,
      /qwen/i,
      /gpt-4o(?!-mini)/i,
      /glm-5/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
    ],
    preferredBonus: 20,
    avoidPenalty: 25,
  },
  "ui-ux": {
    preferredPatterns: [
      /claude-fable/i,
      /fable/i,
      /gemini-pro/i,
      /claude-sonnet/i,
      /gpt-4o(?!-mini)/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
    ],
    preferredBonus: 20,
    avoidPenalty: 25,
  },
  schema: {
    preferredPatterns: [
      /claude-sonnet/i,
      /deepseek-v4-pro/i,
      /glm-5/i,
      /gpt-4o(?!-mini)/i,
      /qwen/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
    ],
    preferredBonus: 20,
    avoidPenalty: 25,
  },
  revision: {
    preferredPatterns: [
      /claude-sonnet/i,
      /glm-5/i,
      /gpt-4o(?!-mini)/i,
      /deepseek-v4-pro/i,
    ],
    avoidPatterns: [
      /flash/i,
      /mini/i,
      /haiku/i,
    ],
    preferredBonus: 15,
    avoidPenalty: 20,
  },
};

// ── In-Memory Model Performance Stats ──────────────────────────────────────

type ModelStageStats = {
  successCount: number;
  failCount: number;
  totalLatencyMs: number;
  lastUpdated: number;
};

const modelStats: Map<string, ModelStageStats> = new Map();

function statsKey(modelId: string, stage: GenerationStage): string {
  return `${modelId}::${stage}`;
}

/**
 * Record the outcome of a model usage for a specific stage.
 * Called after each upstream attempt (success or failure).
 */
export function recordModelOutcome(
  modelId: string,
  stage: GenerationStage,
  success: boolean,
  latencyMs: number,
): void {
  const key = statsKey(modelId, stage);
  const existing = modelStats.get(key);
  const now = Date.now();

  if (existing) {
    existing.successCount += success ? 1 : 0;
    existing.failCount += success ? 0 : 1;
    existing.totalLatencyMs += latencyMs;
    existing.lastUpdated = now;
  } else {
    modelStats.set(key, {
      successCount: success ? 1 : 0,
      failCount: success ? 0 : 1,
      totalLatencyMs: latencyMs,
      lastUpdated: now,
    });
  }
}

/**
 * Get performance stats for a model+stage combination.
 * Returns null if no data exists yet.
 */
export function getModelStageStats(
  modelId: string,
  stage: GenerationStage,
): ModelStageStats | null {
  return modelStats.get(statsKey(modelId, stage)) ?? null;
}

// ── Scoring Engine ─────────────────────────────────────────────────────────

/**
 * Calculate a composite score for a model on a given stage.
 *
 * score =
 *   successRate * 45 +      // reliability (most important)
 *   qualityBonus * 30 +      // stage suitability from preferences
 *   speedScore * 15 +        // latency efficiency
 *   costScore * 10           // tier appropriateness
 *
 * Returns 0-100.
 */
function scoreModel(
  model: ModelItem,
  stage: GenerationStage,
  userTier: "starter" | "pro",
): number {
  const prefs = STAGE_PREFERENCES[stage];
  const stats = getModelStageStats(model.id, stage);

  // 1. Success rate component (0-45)
  let successRateScore = 22.5; // default neutral if no data
  if (stats) {
    const total = stats.successCount + stats.failCount;
    if (total >= 3) {
      successRateScore = (stats.successCount / total) * 45;
    }
  }

  // 2. Stage suitability component (0-30)
  let qualityBonus = 10; // neutral baseline
  const modelIdLower = model.id.toLowerCase();
  if (prefs.preferredPatterns.some((p) => p.test(modelIdLower))) {
    qualityBonus += prefs.preferredBonus;
  }
  if (prefs.avoidPatterns.some((p) => p.test(modelIdLower))) {
    qualityBonus -= prefs.avoidPenalty;
  }
  qualityBonus = Math.max(0, Math.min(30, qualityBonus));

  // 3. Speed component (0-15)
  let speedScore = 7.5; // neutral
  if (stats && stats.successCount > 0) {
    const avgLatencyMs = stats.totalLatencyMs / stats.successCount;
    // Under 5s = full score, over 20s = 0
    if (avgLatencyMs <= 5000) {
      speedScore = 15;
    } else if (avgLatencyMs >= 20000) {
      speedScore = 2;
    } else {
      speedScore = 15 - ((avgLatencyMs - 5000) / 15000) * 13;
    }
  }

  // 4. Cost/tier component (0-10)
  // Pro users can use flagship models; starter users should prefer starter models
  let costScore = 5;
  if (userTier === "pro") {
    // Pro users: flagship gets slight preference (they paid for it)
    costScore = model.isFlagship ? 9 : 6;
  } else {
    // Starter users: avoid flagship (can't use them anyway)
    costScore = model.isFlagship ? 1 : 8;
  }

  // 5. Health penalty
  let healthMultiplier = 1.0;
  if (model.healthStatus === "maintenance") {
    healthMultiplier = 0;
  } else if (model.healthStatus === "degraded") {
    healthMultiplier = 0.3;
  } else if (model.healthStatus === "unknown") {
    healthMultiplier = 0.5;
  }

  const rawScore = successRateScore + qualityBonus + speedScore + costScore;
  return Math.round(rawScore * healthMultiplier * 10) / 10;
}

// ── Model Resolution ───────────────────────────────────────────────────────

export type ResolvedModel = {
  modelId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  isFallback: boolean;
};

/**
 * Get the best model for a given stage from available models.
 * Returns an ordered fallback chain (primary first).
 *
 * @param stage - The generation stage
 * @param availableModels - Models currently available from the provider
 * @param userTier - User's access tier
 * @param adminOverrides - Optional admin-specific model overrides per stage
 */
export function resolveModelForStage(
  stage: GenerationStage,
  availableModels: ModelItem[],
  userTier: "starter" | "pro" = "starter",
  adminOverrides?: Partial<Record<GenerationStage, string>>,
): ResolvedModel[] {
  // Check admin override first
  const adminModel = adminOverrides?.[stage];
  if (adminModel) {
    const found = availableModels.find(
      (m) => m.id === adminModel && m.healthStatus !== "maintenance",
    );
    if (found) {
      return [
        { modelId: found.id, score: 100, confidence: "high", isFallback: false },
      ];
    }
  }

  // Filter to usable models
  const usable = availableModels.filter((m) => {
    if (m.healthStatus === "maintenance") return false;
    if (userTier === "starter" && m.isFlagship) return false;
    return true;
  });

  if (usable.length === 0) {
    // Last resort: try any non-maintenance model
    const emergency = availableModels.filter((m) => m.healthStatus !== "maintenance");
    if (emergency.length > 0) {
      return [
        {
          modelId: emergency[0].id,
          score: 1,
          confidence: "low",
          isFallback: false,
        },
      ];
    }
    return [];
  }

  // Score and sort
  const scored = usable.map((m) => ({
    model: m,
    score: scoreModel(m, stage, userTier),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Build fallback chain: top 3 scored models
  const chain: ResolvedModel[] = scored.slice(0, 3).map((s, i) => ({
    modelId: s.model.id,
    score: s.score,
    confidence: i === 0 ? "high" : i === 1 ? "medium" : "low",
    isFallback: i > 0,
  }));

  return chain;
}

/**
 * Convenience: get just the best model for a stage.
 */
export function getBestModel(
  stage: GenerationStage,
  availableModels: ModelItem[],
  userTier: "starter" | "pro" = "starter",
  adminOverrides?: Partial<Record<GenerationStage, string>>,
): string | null {
  const chain = resolveModelForStage(
    stage,
    availableModels,
    userTier,
    adminOverrides,
  );
  return chain[0]?.modelId ?? null;
}

// ── Admin Override Storage ──────────────────────────────────────────────────

const adminRoutingOverrides: Partial<Record<GenerationStage, string>> = {};

export function setAdminRoutingOverride(
  stage: GenerationStage,
  modelId: string | "auto",
): void {
  if (modelId === "auto") {
    delete adminRoutingOverrides[stage];
  } else {
    adminRoutingOverrides[stage] = modelId;
  }
}

export function getAdminRoutingOverrides(): Partial<
  Record<GenerationStage, string>
> {
  return { ...adminRoutingOverrides };
}

// ── Routing Metadata for Logging ───────────────────────────────────────────

export type ModelUsedRecord = {
  provider: string;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
  finalStatus: "success" | "fallback" | "failed";
};

export type ModelsUsedMap = Partial<Record<GenerationStage, ModelUsedRecord>>;

/**
 * Get performance stats summary for admin visibility.
 */
export function getRoutingStats(): Array<{
  modelId: string;
  stage: GenerationStage;
  successCount: number;
  failCount: number;
  successRate: number;
  avgLatencyMs: number;
}> {
  const results: Array<{
    modelId: string;
    stage: GenerationStage;
    successCount: number;
    failCount: number;
    successRate: number;
    avgLatencyMs: number;
  }> = [];

  for (const [key, stats] of modelStats.entries()) {
    const [modelId, stage] = key.split("::");
    const total = stats.successCount + stats.failCount;
    results.push({
      modelId,
      stage: stage as GenerationStage,
      successCount: stats.successCount,
      failCount: stats.failCount,
      successRate: total > 0 ? Math.round((stats.successCount / total) * 1000) / 10 : 0,
      avgLatencyMs:
        stats.successCount > 0
          ? Math.round(stats.totalLatencyMs / stats.successCount)
          : 0,
    });
  }

  return results;
}
