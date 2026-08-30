import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isFlagshipModel, isAutoModel, getCachedModels, setCachedModels, classifyModel, type ModelItem } from "@/lib/models-config";
import { isProviderMaintenance, PROVIDER_MAINTENANCE_MESSAGE } from "@/lib/provider-maintenance";
import {
  type GenerationStage,
  resolveModelForStage,
  recordModelOutcome,
  getAdminRoutingOverrides,
} from "@/lib/model-router";

const PROVIDER_BASE_URL = "https://bandelbanget.xyz/v1";
const MAX_AUTO_FALLBACK_ATTEMPTS = 3;

/**
 * Fetch available models from provider, using cache if available.
 * Falls back to direct provider call if cache is empty.
 */
async function ensureAvailableModels(apiKey: string): Promise<ModelItem[]> {
  const cached = getCachedModels();
  if (cached && cached.length > 0) return cached;

  try {
    const upstreamResponse = await fetch(`${PROVIDER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!upstreamResponse.ok) return [];

    const payload = await upstreamResponse.json() as { data?: unknown };
    if (!payload || !Array.isArray(payload.data)) return [];

    const models: ModelItem[] = payload.data
      .filter((m: { id?: string }) => {
        const id = (m.id ?? "").trim().toLowerCase();
        return id && id !== "auto" && id !== "auto-debug" && id !== "hy3";
      })
      .map((m: { id?: string; name?: string; display_name?: string; enabled?: boolean; grade?: string; vision?: boolean }) => {
        const id = m.id ?? "";
        const name = m.name || m.display_name || id;
        return classifyModel(id, name, {
          enabled: m.enabled,
          grade: m.grade,
          vision: m.vision,
        });
      });

    if (models.length > 0) {
      setCachedModels(models);
    }
    return models;
  } catch {
    return [];
  }
}

/**
 * Attempt a single upstream LLM call.
 * Returns the Response on success, or null on retriable failure.
 */
async function attemptUpstreamCall(
  modelId: string,
  systemPrompt: string,
  userContent: string,
  maxOutputTokens: number,
  apiKey: string,
): Promise<{ response: Response; latencyMs: number } | { error: string; status: number }> {
  const start = Date.now();
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${PROVIDER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    });
  } catch {
    return { error: "Tidak dapat terhubung ke bandelbanget.xyz. Coba beberapa saat lagi.", status: 502 };
  }

  const latencyMs = Date.now() - start;

  if (!upstreamResponse.ok) {
    const errorPayload = await upstreamResponse.text();
    if (isProviderMaintenance(upstreamResponse.status, errorPayload)) {
      return { error: PROVIDER_MAINTENANCE_MESSAGE, status: 503 };
    }
    return { error: errorPayload || `Provider merespons HTTP ${upstreamResponse.status}.`, status: upstreamResponse.status };
  }

  return { response: upstreamResponse, latencyMs };
}

/**
 * Check if an error is retriable (suitable for fallback to next model).
 */
function isRetriableError(status: number, errorBody: string): boolean {
  if (status === 429) return true; // rate limit
  if (status === 503) return true; // maintenance/overloaded
  if (status === 500) return true; // server error
  if (status === 502) return true; // bad gateway
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
function wrapJsonAsSSE(result: unknown): NextResponse {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new NextResponse(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    generationId,
    selectedModel,
    userContent,
    systemPrompt,
    maxOutputTokens = 24000,
    stage,
  } = body as {
    generationId?: string;
    selectedModel?: string;
    userContent?: string;
    systemPrompt?: string;
    maxOutputTokens?: number;
    stage?: string;
  };
  const apiKey = process.env.BANDELBANGET_API_KEY;

  if (!apiKey || !selectedModel || !userContent || !systemPrompt) {
    return NextResponse.json(
      { error: "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu." },
      { status: 503 },
    );
  }

  if (!generationId) {
    return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid." }, { status: 401 });
  }

  const user = await getCurrentUser();
  const isRevision = typeof generationId === "string" && generationId.startsWith("rev-");
  const isAuto = isAutoModel(selectedModel);
  const modelId = selectedModel.trim();

  // ── Authorization for non-auto mode ──────────────────────────────────
  if (!isAuto) {
    const isFlagship = isFlagshipModel(modelId);
    if (!isRevision && user) {
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
    } else if (isRevision && user && isFlagship && user.role !== "admin") {
      try {
        const db = await getDatabase();
        const purchasedResult = await db.execute({
          sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
          args: [user.email],
        });
        if (!purchasedResult.rows[0]) {
          return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
        }
      } catch {
        // ignore
      }
    } else if (!user && isFlagship) {
      return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun Pro Studio." }, { status: 403 });
    }
  }

  // ── Auto-Routing: resolve model for stage ────────────────────────────
  if (isAuto) {
    const resolvedStage = (stage || "blueprint") as GenerationStage;

    // Validate and update generation status to GENERATING
    if (!isRevision && user) {
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
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Pembuatan dokumen tidak dapat diverifikasi." }, { status: 503 });
      }
    }

    const availableModels = await ensureAvailableModels(apiKey);
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

    // Attempt with fallback chain
    let lastError = "";
    let lastStatus = 500;

    for (let attemptIndex = 0; attemptIndex < Math.min(fallbackChain.length, MAX_AUTO_FALLBACK_ATTEMPTS); attemptIndex++) {
      const candidate = fallbackChain[attemptIndex];
      const attemptStart = Date.now();

      const result = await attemptUpstreamCall(
        candidate.modelId,
        systemPrompt,
        userContent,
        maxOutputTokens,
        apiKey,
      );

      if ("response" in result) {
        // Success
        recordModelOutcome(candidate.modelId, resolvedStage, true, Date.now() - attemptStart);

        // If we used a fallback, log it
        if (attemptIndex > 0) {
          // Add header so frontend knows which model was actually used
          const response = result.response;
          const headers = new Headers(response.headers);
          headers.set("X-Model-Used", candidate.modelId);
          headers.set("X-Model-Fallback-Index", String(attemptIndex));

          if (!response.headers.get("content-type")?.includes("text/event-stream")) {
            const jsonResult = await response.json();
            return wrapJsonAsSSE(jsonResult);
          }

          return new NextResponse(response.body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Model-Used": candidate.modelId, "X-Model-Fallback-Index": String(attemptIndex) },
          });
        }

        // Direct pass-through for primary model
        const upstreamContentType = result.response.headers.get("content-type") ?? "";
        if (!upstreamContentType.includes("text/event-stream")) {
          const jsonResult = await result.response.json();
          return wrapJsonAsSSE(jsonResult);
        }

        return new NextResponse(result.response.body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no", "X-Model-Used": candidate.modelId },
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

    // All fallbacks exhausted
    return NextResponse.json({ error: lastError }, { status: lastStatus });
  }

  // ── Direct Model Mode (non-auto, backward compatible) ────────────────
  const isFlagship = isFlagshipModel(modelId);
  if (!isRevision && user) {
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
  } else if (isRevision && user && isFlagship && user.role !== "admin") {
    try {
      const db = await getDatabase();
      const purchasedResult = await db.execute({
        sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
        args: [user.email],
      });
      if (!purchasedResult.rows[0]) {
        return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
      }
    } catch {
      // ignore
    }
  } else if (!user && isFlagship) {
    return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun Pro Studio." }, { status: 403 });
  }

  // Direct upstream call for explicit model
  const upstreamResponse = await attemptUpstreamCall(
    modelId,
    systemPrompt,
    userContent,
    maxOutputTokens,
    apiKey,
  );

  if ("error" in upstreamResponse) {
    return NextResponse.json({ error: upstreamResponse.error }, { status: upstreamResponse.status });
  }

  const upstreamContentType = upstreamResponse.response.headers.get("content-type") ?? "";
  if (!upstreamContentType.includes("text/event-stream")) {
    const result = await upstreamResponse.response.json();
    return wrapJsonAsSSE(result);
  }

  return new NextResponse(upstreamResponse.response.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
