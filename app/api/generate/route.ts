import { NextRequest, NextResponse } from "next/server";
import { getDatabase, storeProviderAttempt, updateProviderAttemptResult, classifyFallbackReason } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isFlagshipModel, isAutoModel, getCachedModels, setCachedModels, classifyModel, type ModelItem } from "@/lib/models-config";
import { isProviderMaintenance, PROVIDER_MAINTENANCE_MESSAGE } from "@/lib/provider-maintenance";
import {
  getConfiguredAiProviders,
  shouldFailOverProvider,
  type AiProvider,
} from "@/lib/ai-provider-pool";
import {
  type GenerationStage,
  resolveModelForStage,
  recordModelOutcome,
  getAdminRoutingOverrides,
} from "@/lib/model-router";

const MAX_AUTO_FALLBACK_ATTEMPTS = 6;
const MAX_OUTPUT_TOKENS = 24_000;
const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;

// ── In-memory rate limiter (sliding window per user) ────────────────
const RATE_LIMIT_MAX_CONCURRENT = 3;
const RATE_LIMIT_MAX_PER_MINUTE = 10;
const rateLimitStore = new Map<string, { count: number; windowStart: number; concurrent: number }>();

function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry) {
    rateLimitStore.set(userId, { count: 1, windowStart: now, concurrent: 1 });
    return { ok: true };
  }

  // Reset window if expired
  if (now - entry.windowStart > 60_000) {
    entry.count = 0;
    entry.windowStart = now;
  }

  // Check concurrent limit
  if (entry.concurrent >= RATE_LIMIT_MAX_CONCURRENT) {
    return { ok: false, retryAfter: 5 };
  }

  // Check per-minute limit
  if (entry.count >= RATE_LIMIT_MAX_PER_MINUTE) {
    const retryAfter = Math.ceil((entry.windowStart + 60_000 - now) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  entry.count += 1;
  entry.concurrent += 1;
  return { ok: true };
}

function releaseConcurrent(userId: string) {
  const entry = rateLimitStore.get(userId);
  if (entry && entry.concurrent > 0) {
    entry.concurrent -= 1;
  }
}

/**
 * Fetch available models from provider, using cache if available.
 * Falls back to direct provider call if cache is empty.
 */
async function ensureAvailableModels(providers: AiProvider[]): Promise<ModelItem[]> {
  const cached = getCachedModels();
  if (cached && cached.length > 0) return cached;

  const results = await Promise.all(providers.map(async (provider) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_CONNECT_TIMEOUT_MS);
      try {
        const upstreamResponse = await fetch(`${provider.baseUrl}/models`, {
          headers: { Authorization: `Bearer ${provider.apiKey}` },
          signal: controller.signal,
        });
        if (!upstreamResponse.ok) return [] as ModelItem[];
        const payload = await upstreamResponse.json() as { data?: unknown };
        if (!payload || !Array.isArray(payload.data)) return [] as ModelItem[];
        return payload.data
          .filter((m: { id?: string }) => {
            const id = (m.id ?? "").trim().toLowerCase();
            return id && id !== "auto" && id !== "auto-debug" && id !== "hy3";
          })
          .map((m: { id?: string; name?: string; display_name?: string; enabled?: boolean; grade?: string; vision?: boolean }) => {
            const id = m.id ?? "";
            return classifyModel(id, m.name || m.display_name || id, {
              enabled: m.enabled ?? true,
              grade: m.grade,
              vision: m.vision,
            });
          });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        level: "error",
        stage: "ensureAvailableModels",
        provider: "unknown",
        error: errorMessage,
      }));
      return [] as ModelItem[];
    }
  }));

  const models = [...new Map(results.flat().map((model) => [model.id, model])).values()];

  // No longer injecting hardcoded promo models (they were timeout-prone)
  // Models are now retrieved directly from provider's /models endpoint

  if (models.length > 0) setCachedModels(models);
  return models;
}

/**
 * Attempt a single upstream LLM call with strict connection timeout.
 * Returns the Response on success, or error info on retriable failure.
 */
async function attemptUpstreamCall(
  modelId: string,
  systemPrompt: string,
  userContent: string,
  maxOutputTokens: number,
  providers: AiProvider[],
): Promise<{ response: Response; latencyMs: number; provider: AiProvider } | { error: string; status: number }> {
  const start = Date.now();
  let lastError = "Provider AI tidak dapat dihubungi.";
  let lastStatus = 502;

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_CONNECT_TIMEOUT_MS);

      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            stream: true,
            temperature: 0.25,
            max_tokens: maxOutputTokens,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (upstreamResponse.ok) {
        console.error(JSON.stringify({
          level: "info",
          stage: "attemptUpstreamCall",
          model: modelId,
          provider: provider.id,
          status: 200,
          latencyMs: Date.now() - start,
        }));
        return { response: upstreamResponse, latencyMs: Date.now() - start, provider };
      }

      const errorPayload = await upstreamResponse.text();
      lastStatus = upstreamResponse.status;
      lastError = isProviderMaintenance(upstreamResponse.status, errorPayload)
        ? PROVIDER_MAINTENANCE_MESSAGE
        : errorPayload || `${provider.name} merespons HTTP ${upstreamResponse.status}.`;

      console.error(JSON.stringify({
        level: "error",
        stage: "attemptUpstreamCall",
        model: modelId,
        provider: provider.id,
        status: upstreamResponse.status,
        message: lastError,
        latencyMs: Date.now() - start,
      }));

      if (!shouldFailOverProvider(upstreamResponse.status)) break;
    } catch (error) {
      lastStatus = 502;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if it's a timeout/abort error
      const isTimeout = errorMessage.includes("abort") || errorMessage.includes("timeout");
      
      if (isTimeout) {
        lastError = `${provider.name} tidak merespons dalam ${UPSTREAM_CONNECT_TIMEOUT_MS / 1000} detik.`;
      } else if (errorMessage.includes("ECONNRESET") || errorMessage.includes("ECONNREFUSED")) {
        lastError = `${provider.name} memutus koneksi secara tidak terduga.`;
      } else {
        lastError = `${provider.name} tidak dapat dihubungi.`;
      }

      console.error(JSON.stringify({
        level: "error",
        stage: "attemptUpstreamCall",
        model: modelId,
        provider: provider.id,
        status: lastStatus,
        message: lastError,
        originalError: errorMessage,
        latencyMs: Date.now() - start,
      }));
    }
  }

  return { error: lastError, status: lastStatus };
}

/**
 * Check if an error is retriable (suitable for fallback to next model).
 */
function isRetriableError(status: number, errorBody: string): boolean {
  if (status === 429) return true; // rate limit
  if (status === 503) return true; // maintenance/overloaded
  if (status === 500) return true; // server error
  if (status === 502) return true; // bad gateway
  if (status === 504) return true; // gateway timeout
  if (status === 404) return true; // model not found
  if (status === 403) return true; // access denied
  const lower = errorBody.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many requests")) return true;
  if (lower.includes("overloaded") || lower.includes("server error")) return true;
  if (lower.includes("model_not_found") || lower.includes("does not exist")) return true;
  if (lower.includes("insufficient_quota") || lower.includes("balance")) return false; // quota issues won't be fixed by switching model
  return false;
}

/**
 * Wrap a non-streaming response into SSE format.
 */
function wrapJsonAsSSE(result: unknown, metadata: Record<string, string> = {}): NextResponse {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const headers = new Headers({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  for (const [key, value] of Object.entries(metadata)) headers.set(key, value);
  return new NextResponse(stream, {
    status: 200,
    headers,
  });
}

/**
 * Create a graceful error SSE stream response (status 200 with error event).
 * This prevents 502 Bad Gateway when all fallbacks are exhausted.
 */
function createGracefulErrorResponse(errorMessage: string, metadata: Record<string, string> = {}): NextResponse {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const errorEvent = {
        message: errorMessage || "Semua model AI sedang sibuk atau mengalami gangguan. Silakan coba lagi dalam beberapa saat.",
      };
      controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`));
      controller.close();
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  for (const [key, value] of Object.entries(metadata)) headers.set(key, value);

  return new NextResponse(stream, {
    status: 200,
    headers,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu untuk membuat dokumen." }, { status: 401 });
  }

  // Rate limit check
  const rateCheck = checkRateLimit(user.email);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter || 5) } },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Permintaan pembuatan dokumen tidak valid." }, { status: 400 });
    }
    const {
      generationId,
      selectedModel,
      userContent,
      systemPrompt,
      maxOutputTokens = MAX_OUTPUT_TOKENS,
      stage,
    } = body as {
      generationId?: string;
      selectedModel?: string;
      userContent?: string;
      systemPrompt?: string;
      maxOutputTokens?: number;
      stage?: string;
    };
    if (typeof generationId === "string" && generationId.startsWith("rev-")) {
      return NextResponse.json(
        { error: "Revisi AI sudah tidak tersedia. Gunakan Edit Manual untuk memperbarui dokumen." },
        { status: 410 },
      );
    }

    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_OUTPUT_TOKENS) {
      return NextResponse.json({ error: `Batas keluaran dokumen harus antara 1 dan ${MAX_OUTPUT_TOKENS} token.` }, { status: 400 });
    }

    const configuredProviders = getConfiguredAiProviders();
    if (configuredProviders.length === 0 || !selectedModel || !userContent || !systemPrompt) {
      return NextResponse.json(
        { error: "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu." },
        { status: 503 },
      );
    }

    if (!generationId || typeof generationId !== "string" || generationId.length > 128) {
      return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid." }, { status: 401 });
    }
    if (typeof selectedModel !== "string" || typeof userContent !== "string" || typeof systemPrompt !== "string") {
      return NextResponse.json({ error: "Data pembuatan dokumen tidak valid." }, { status: 400 });
    }
    if (userContent.length > 60_000 || systemPrompt.length > 100_000) {
      return NextResponse.json({ error: "Isi dokumen melebihi batas yang diizinkan." }, { status: 400 });
    }
    const isAuto = isAutoModel(selectedModel);
    const modelId = selectedModel.trim();

    // A signed user must still be limited to models the configured provider has
    // explicitly exposed. Otherwise this route becomes an arbitrary-model proxy
    // that can spend more provider quota than one document credit represents.
    if (!isAuto) {
      const availableModels = await ensureAvailableModels(configuredProviders);
      const selected = availableModels.find((model) => model.id === modelId);
      if (!selected || selected.healthStatus === "maintenance" || selected.healthStatus === "degraded") {
        return NextResponse.json({ error: "Model yang dipilih tidak tersedia." }, { status: 400 });
      }
    }

    // Independent document stages rotate across the configured gateways in
    // balanced mode, while each stage keeps a stable preferred provider.
    const providerOrder = configuredProviders;

    // ── Authorization for non-auto mode ──────────────────────────────────
    if (!isAuto) {
      const isFlagship = isFlagshipModel(modelId);
      if (user) {
        try {
          const db = await getDatabase();
          const generationResult = await db.execute({
            sql: "SELECT id, status FROM document_generations WHERE id = ? AND user_email = ? AND status IN ('RESERVED', 'GENERATING', 'FINALIZE_FAILED')",
            args: [generationId, user.email],
          });
          const generation = generationResult.rows[0] as unknown as { id: string; status: string } | undefined;
          if (!generation) {
            return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid atau bukan milik akun Anda." }, { status: 403 });
          }
          if (generation.status !== "GENERATING") {
            await db.execute({ sql: "UPDATE document_generations SET status = 'GENERATING' WHERE id = ?", args: [generationId] });
          }
          if (isFlagship && user.role !== "admin") {
            const purchasedResult = await db.execute({
              sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
              args: [user.email],
            });
            if (!purchasedResult.rows[0]) {
              return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
            }
          }
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Pembuatan dokumen tidak dapat diverifikasi." }, { status: 503 });
        }
      } else if (isFlagship) {
        return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun Pro Studio." }, { status: 403 });
      }
    }

    // ── Auto-Routing: resolve model for stage ────────────────────────────
    if (isAuto) {
      const resolvedStage = (stage || "blueprint") as GenerationStage;

      // Validate and update generation status to GENERATING
      if (user) {
        try {
          const db = await getDatabase();
          const generationResult = await db.execute({
            sql: "SELECT id, status FROM document_generations WHERE id = ? AND user_email = ? AND status IN ('RESERVED', 'GENERATING', 'FINALIZE_FAILED')",
            args: [generationId, user.email],
          });
          const generation = generationResult.rows[0] as unknown as { id: string; status: string } | undefined;
          if (!generation) {
            return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid atau bukan milik akun Anda." }, { status: 403 });
          }
          if (generation.status !== "GENERATING") {
            await db.execute({ sql: "UPDATE document_generations SET status = 'GENERATING' WHERE id = ?", args: [generationId] });
          }
        } catch {
          return NextResponse.json({ error: "Gagal memverifikasi sesi pembuatan dokumen." }, { status: 503 });
        }
      }

      const availableModels = await ensureAvailableModels(configuredProviders);
      if (availableModels.length === 0) {
        return NextResponse.json(
          { error: "Daftar model belum dimuat dari provider. Silakan coba beberapa saat lagi." },
          { status: 503 },
        );
      }

      let userTier: "starter" | "pro" = user?.role === "admin" ? "pro" : "starter";
      // Users with purchased credits get pro tier (access to flagship models)
      if (user && user.role !== "admin") {
        try {
          const db = await getDatabase();
          const purchasedResult = await db.execute({
            sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
            args: [user.email],
          });
          if (purchasedResult.rows[0]) {
            userTier = "pro";
          }
        } catch {
          // ignore
        }
      }

      const adminOverrides = getAdminRoutingOverrides();
      const fallbackChain = resolveModelForStage(
        resolvedStage,
        availableModels,
        userTier,
        adminOverrides,
      );

      if (fallbackChain.length === 0) {
        return NextResponse.json(
          { error: "Tidak ada model AI yang tersedia saat ini. Silakan coba beberapa saat lagi." },
          { status: 503 },
        );
      }

      // ── Map promo model IDs based on stage ──────────────────────────────
      // promo:05 → sf/step-3.5-flash (Tier 1)
      // promo:05-repair → sf/step-3.7-flash (Tier 1)
      // The virtual combo is resolved to its cheapest concrete model first.
      // When that attempt times out (>10s) or fails, the loop escalates to
      // Tier 2 (glm-5.3-flash) then Tier 3 (minimax-m3).
      const REPAIR_STAGES = ["quality-repair", "targeted-repair", "alignment"] as const;
      const isRepairStage = REPAIR_STAGES.includes(resolvedStage as typeof REPAIR_STAGES[number]);

      function mapPromoModel(modelId: string): string {
        if (modelId === "promo:05") {
          return isRepairStage ? "sf/step-3.7-flash" : "sf/step-3.5-flash";
        }
        if (modelId === "promo:05-repair") {
          return isRepairStage ? "sf/step-3.7-flash" : "sf/step-3.5-flash";
        }
        return modelId;
      }

      // Apply mapping and de-duplicate to avoid calling the same model twice.
      const seenModels = new Set<string>();
      const mappedChain = fallbackChain
        .map((c) => ({ ...c, modelId: mapPromoModel(c.modelId) }))
        .filter((c) => {
          if (seenModels.has(c.modelId)) return false;
          seenModels.add(c.modelId);
          return true;
        });

      // Attempt with fallback chain
      let lastError = "";
      let lastStatus = 500;

      for (let attemptIndex = 0; attemptIndex < Math.min(mappedChain.length, MAX_AUTO_FALLBACK_ATTEMPTS); attemptIndex++) {
        const candidate = mappedChain[attemptIndex];
        const attemptStart = Date.now();

        // Create attempt row BEFORE provider call (server-authoritative)
        let attemptId = "";
        try {
          const db = await getDatabase();
          attemptId = await storeProviderAttempt(db, {
            generationId,
            stage: resolvedStage,
            operationId: candidate.modelId,
            provider: "",
            model: candidate.modelId,
            attempt: attemptIndex + 1,
            transportSuccess: false,
            semanticStatus: "UNKNOWN",
          });
        } catch (e) {
          console.error(JSON.stringify({
            level: "error",
            stage: "storeProviderAttempt",
            generationId,
            model: candidate.modelId,
            error: e instanceof Error ? e.message : String(e),
          }));
        }

        const result = await attemptUpstreamCall(
          candidate.modelId,
          systemPrompt,
          userContent,
          maxOutputTokens,
          providerOrder,
        );

        // Update attempt row with transport results (attempt MUST not stay UNKNOWN on transport failure)
        if (attemptId) {
          try {
            const db = await getDatabase();
            if ("response" in result) {
              await updateProviderAttemptResult(db, attemptId, {
                provider: result.provider.id,
                model: candidate.modelId,
                latencyMs: Date.now() - attemptStart,
                transportSuccess: true,
                httpStatus: 200,
                fallbackReasonCode: attemptIndex > 0 ? "FALLBACK_PRIMARY_FAILED" : undefined,
                fallbackReasonDetail: attemptIndex > 0 ? lastError || undefined : undefined,
              });
            } else {
              const fallbackClass = classifyFallbackReason(result.status, result.error);
              // Transport failure: semantic MUST be FAILED, not UNKNOWN
              await db.execute({
                sql: `UPDATE provider_attempts SET
                  provider = ?, model = ?, latency_ms = ?,
                  transport_success = 0, http_status = ?,
                  semantic_status = 'FAILED',
                  fallback_reason_code = ?, fallback_reason_detail = ?
                WHERE attempt_id = ? AND semantic_status = 'UNKNOWN'`,
                args: [
                  providerOrder[0]?.id || "unknown",
                  candidate.modelId,
                  Date.now() - attemptStart,
                  result.status,
                  fallbackClass.code,
                  fallbackClass.detail,
                  attemptId,
                ],
              });
            }
          } catch (e) {
            console.error(JSON.stringify({
              level: "error",
              stage: "updateProviderAttemptResult",
              generationId,
              attemptId,
              model: candidate.modelId,
              error: e instanceof Error ? e.message : String(e),
            }));
            // Last resort: ensure attempt does not stay UNKNOWN on transport failure
            if (!("response" in result)) {
              try {
                const db = await getDatabase();
                await db.execute({
                  sql: `UPDATE provider_attempts SET semantic_status = 'FAILED', fallback_reason_code = 'TELEMETRY_WRITE_FAILED'
                    WHERE attempt_id = ? AND semantic_status = 'UNKNOWN'`,
                  args: [attemptId],
                });
              } catch (e2) {
                console.error(JSON.stringify({
                  level: "error",
                  stage: "lastResortSemanticFAILED",
                  generationId,
                  attemptId,
                  error: e2 instanceof Error ? e2.message : String(e2),
                }));
              }
            }
          }
        }

        if ("response" in result) {
          // An HTTP 200 only means the stream was accepted. The browser reports
          // the semantic result after it validates the completed output.

          // If we used a fallback, log it
          if (attemptIndex > 0) {
            const response = result.response;
            const metadata: Record<string, string> = {
              "X-Model-Used": candidate.modelId,
              "X-Model-Fallback-Index": String(attemptIndex),
              "X-AI-Provider": result.provider.id,
            };
            if (attemptId) metadata["X-Attempt-Id"] = attemptId;

            if (!response.headers.get("content-type")?.includes("text/event-stream")) {
              const jsonResult = await response.json();
              return wrapJsonAsSSE(jsonResult, metadata);
            }

            return new NextResponse(response.body, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no",
                "X-Model-Used": candidate.modelId, "X-Model-Fallback-Index": String(attemptIndex), "X-AI-Provider": result.provider.id,
                ...(attemptId ? { "X-Attempt-Id": attemptId } : {}),
              },
            });
          }

          // Direct pass-through for primary model
          const upstreamContentType = result.response.headers.get("content-type") ?? "";
          if (!upstreamContentType.includes("text/event-stream")) {
            const jsonResult = await result.response.json();
            return wrapJsonAsSSE(jsonResult, {
              "X-Model-Used": candidate.modelId, "X-AI-Provider": result.provider.id,
              ...(attemptId ? { "X-Attempt-Id": attemptId } : {}),
            });
          }

          return new NextResponse(result.response.body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no",
              "X-Model-Used": candidate.modelId, "X-AI-Provider": result.provider.id,
              ...(attemptId ? { "X-Attempt-Id": attemptId } : {}),
            },
          });
        }

        // Failure
        recordModelOutcome(candidate.modelId, resolvedStage, false, Date.now() - attemptStart);

        lastError = result.error;
        lastStatus = result.status;

        // If error is not retriable, stop trying
        if (!isRetriableError(result.status, result.error)) {
          break;
        }
      }

      // All fallbacks exhausted: return graceful error response (status 200 with error event)
      console.error(JSON.stringify({
        level: "error",
        stage: "allFallbacksExhausted",
        generationId,
        resolvedStage,
        lastError,
        lastStatus,
      }));

      return createGracefulErrorResponse(
        lastError || "Semua model AI sedang sibuk atau mengalami gangguan. Silakan coba lagi dalam beberapa saat.",
        { "X-Generation-Id": generationId }
      );
    }

    // ── Direct Model Mode (non-auto, backward compatible) ────────────────
    const isFlagship = isFlagshipModel(modelId);
    if (user) {
      try {
        const db = await getDatabase();
        const generationResult = await db.execute({
          sql: "SELECT id, status FROM document_generations WHERE id = ? AND user_email = ? AND status IN ('RESERVED', 'GENERATING', 'FINALIZE_FAILED')",
          args: [generationId, user.email],
        });
        const generation = generationResult.rows[0] as unknown as { id: string; status: string } | undefined;
        if (!generation) {
          return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid atau bukan milik akun Anda." }, { status: 403 });
        }
        if (generation.status !== "GENERATING") {
          await db.execute({ sql: "UPDATE document_generations SET status = 'GENERATING' WHERE id = ?", args: [generationId] });
        }
        if (isFlagship && user.role !== "admin") {
          const purchasedResult = await db.execute({
            sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
            args: [user.email],
          });
          if (!purchasedResult.rows[0]) {
            return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
          }
        }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Pembuatan dokumen tidak dapat diverifikasi." }, { status: 503 });
      }
    } else if (isFlagship) {
      return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun Pro Studio." }, { status: 403 });
    }

    // Direct upstream call for explicit model
    const directStart = Date.now();

    // Create attempt row BEFORE provider call
    let directAttemptId = "";
    if (generationId) {
      try {
        const db = await getDatabase();
        directAttemptId = await storeProviderAttempt(db, {
          generationId,
          stage: (stage || "unknown") as string,
          operationId: modelId,
          provider: "",
          model: modelId,
          attempt: 1,
          transportSuccess: false,
          semanticStatus: "UNKNOWN",
        });
      } catch (e) {
        console.error(JSON.stringify({
          level: "error",
          stage: "storeProviderAttempt-direct",
          generationId,
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    }

    const upstreamResponse = await attemptUpstreamCall(
      modelId,
      systemPrompt,
      userContent,
      maxOutputTokens,
      providerOrder,
    );

    // Update attempt row with transport results (attempt MUST not stay UNKNOWN on transport failure)
    if (directAttemptId) {
      try {
        const db = await getDatabase();
        if ("response" in upstreamResponse) {
          await updateProviderAttemptResult(db, directAttemptId, {
            provider: upstreamResponse.provider.id,
            model: modelId,
            latencyMs: Date.now() - directStart,
            transportSuccess: true,
            httpStatus: 200,
          });
        } else {
          const fallbackClass = classifyFallbackReason(upstreamResponse.status, upstreamResponse.error);
          // Transport failure: semantic MUST be FAILED, not UNKNOWN
          await db.execute({
            sql: `UPDATE provider_attempts SET
              provider = ?, model = ?, latency_ms = ?,
              transport_success = 0, http_status = ?,
              semantic_status = 'FAILED',
              fallback_reason_code = ?, fallback_reason_detail = ?
            WHERE attempt_id = ? AND semantic_status = 'UNKNOWN'`,
            args: [
              providerOrder[0]?.id || "unknown",
              modelId,
              Date.now() - directStart,
              upstreamResponse.status,
              fallbackClass.code,
              fallbackClass.detail,
              directAttemptId,
            ],
          });
        }
      } catch (e) {
        console.error(JSON.stringify({
          level: "error",
          stage: "updateProviderAttemptResult-direct",
          generationId,
          attemptId: directAttemptId,
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }));
        // Last resort: ensure attempt does not stay UNKNOWN on transport failure
        if (!("response" in upstreamResponse)) {
          try {
            const db = await getDatabase();
            await db.execute({
              sql: `UPDATE provider_attempts SET semantic_status = 'FAILED', fallback_reason_code = 'TELEMETRY_WRITE_FAILED'
                WHERE attempt_id = ? AND semantic_status = 'UNKNOWN'`,
              args: [directAttemptId],
            });
          } catch (e2) {
            console.error(JSON.stringify({
              level: "error",
              stage: "lastResortSemanticFAILED-direct",
              generationId,
              attemptId: directAttemptId,
              error: e2 instanceof Error ? e2.message : String(e2),
            }));
          }
        }
      }
    }

    if ("error" in upstreamResponse) {
      // Direct mode: return graceful error response on failure
      console.error(JSON.stringify({
        level: "error",
        stage: "directModeFailure",
        generationId,
        model: modelId,
        status: upstreamResponse.status,
        message: upstreamResponse.error,
      }));

      return createGracefulErrorResponse(
        upstreamResponse.error || "Semua model AI sedang sibuk atau mengalami gangguan. Silakan coba lagi dalam beberapa saat.",
        { "X-Generation-Id": generationId }
      );
    }

    const directHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no",
      "X-AI-Provider": upstreamResponse.provider.id,
      "X-Model-Used": modelId,
    };
    if (directAttemptId) directHeaders["X-Attempt-Id"] = directAttemptId;

    const upstreamContentType = upstreamResponse.response.headers.get("content-type") ?? "";
    if (!upstreamContentType.includes("text/event-stream")) {
      const result = await upstreamResponse.response.json();
      return wrapJsonAsSSE(result, directHeaders);
    }

    return new NextResponse(upstreamResponse.response.body, {
      status: 200,
      headers: directHeaders,
    });
  } catch (error) {
    // Catch-all: prevent unhandled errors from causing 502
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      stage: "generate-route-catch-all",
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    }));

    return createGracefulErrorResponse(
      "Terjadi kesalahan internal. Silakan coba lagi dalam beberapa saat."
    );
  } finally {
    releaseConcurrent(user.email);
  }
}
