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
 *
 * ⚠️ NOTE: sf/step-3.5-flash and sf/step-3.7-flash from InviBuilder are experiencing
 * chronic timeouts (>10 seconds). These models have been deprioritized in favor of
 * more stable alternatives. The routing system will attempt fallbacks aggressively.
 */

import type { ModelItem } from "./models-config";

// ── Stage Definitions ──────────────────────────────────────────────────────

export type GenerationStage =
  | "blueprint"
  | "prd"
  | "tech-stack"
  | "ui-ux"
  | "schema"
  | "revision"
  | "quality-repair"
  | "targeted-repair"
  | "alignment";

export const ROUTING_VERSION = "1.0.2"; // Bumped for timeout-unstable model avoidance

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

const STAGE_PATTERNS = {
  promo05: /promo:05$/i,
  promo05Repair: /promo:05-repair$/i,
  // ⚠️ DEPRECATED: These models timeout frequently and should be avoided
  stepFlash: /sf\/step-3\.[57]-flash/i,
  step35Flash: /sf\/step-3\.5-flash$/i,
  step35Flash2603: /sf\/step-3\.5-flash-2603/i,
  step37Flash: /sf\/step-3\.7-flash$/i,
  // Alternative/fallback patterns for stable models
  gpt4oMini: /gpt-4o-mini/i,
  claude3Haiku: /claude-3-5-haiku/i,
  deepseekFlash: /deepseek-v4-flash/i,
  geminiFlash: /gemini-1\.5-flash/i,
  alternative: /gpt-4o-mini|claude-3-5-haiku|deepseek-v4-flash|gemini-1\.5-flash/i,
};

const STAGE_PREFERENCES: Record<GenerationStage, StagePreference> = {
  blueprint: {
    // Prioritize stable models first, then promo (which routes to unstable models)
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    // Deprioritize known timeout models
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40, // Strong penalty for timeout-prone models
  },
  prd: {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  "tech-stack": {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  "ui-ux": {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  schema: {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  revision: {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  "quality-repair": {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05Repair,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  "targeted-repair": {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05Repair,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
  alignment: {
    preferredPatterns: [
      STAGE_PATTERNS.alternative,
      STAGE_PATTERNS.promo05Repair,
    ],
    avoidPatterns: [STAGE_PATTERNS.stepFlash],
    preferredBonus: 30,
    avoidPenalty: 40,
  },
};

// Fast models are used for the first, high-volume pass. The explicit order
// makes routing predictable even before this server has enough latency data.
// A pattern may match with or without a provider prefix (e.g. a1/glm-5.1).
//
// ⚠️ ROUTING PRIORITY CHANGED:
// - Removed sf/step-3.5-flash and sf/step-3.7-flash from primary priority
// - Added stable alternatives (gpt-4o-mini, claude-3-5-haiku, deepseek-v4-flash, gemini-1.5-flash)
// - promo:05 models now act as fallback (they eventually route to the timeout-prone step models)
// - System will attempt fallback chain aggressively to find any available stable model
const STAGE_MODEL_PRIORITY: Record<GenerationStage, RegExp[]> = {
  // Main docs: prefer alternative stable models first, then promo as fallback
  // The order below ensures we try stable models before the problematic step models
  blueprint: [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  prd: [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  "tech-stack": [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  "ui-ux": [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  schema: [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  revision: [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05$/i,
    /sf\/step-3\.5-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.7-flash$/i,
  ],
  // Repair/Alignment: same pattern - prefer stable alternatives first
  "quality-repair": [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05-repair$/i,
    /sf\/step-3\.7-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.5-flash$/i,
  ],
  "targeted-repair": [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05-repair$/i,
    /sf\/step-3\.7-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.5-flash$/i,
  ],
  alignment: [
    /gpt-4o-mini/i,
    /claude-3-5-haiku/i,
    /deepseek-v4-flash/i,
    /gemini-1\.5-flash/i,
    /promo:05-repair$/i,
    /sf\/step-3\.7-flash$/i,
    /sf\/step-3\.5-flash-2603$/i,
    /sf\/step-3\.5-flash$/i,
  ],
};

function getStagePriority(modelId: string, stage: GenerationStage): number {
  const priority = STAGE_MODEL_PRIORITY[stage].findIndex((pattern) => pattern.test(modelId));
  return priority === -1 ? Number.MAX_SAFE_INTEGER : priority;
}

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

// ── Scoring Engine ────────────────────────────────────────────────────────

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

  scored.sort((a, b) => {
    const priorityDelta = getStagePriority(a.model.id, stage) - getStagePriority(b.model.id, stage);
    return priorityDelta || b.score - a.score;
  });

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
  attemptId?: string;
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
