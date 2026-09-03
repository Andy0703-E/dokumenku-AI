import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";
import { classifyModel, getCachedModels, setCachedModels, type ModelItem, HARDCODED_MODELS } from "@/lib/models-config";
import { getConfiguredAiProviders } from "@/lib/ai-provider-pool";
import { fetchInvibuilderQuota } from "@/lib/invibuilder-quota";

export async function GET() {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Masuk sebagai admin diperlukan." }, { status: 403 });
  }

  try {
    const db = await getDatabase();
    const userCountResult = await db.execute("SELECT COUNT(*) AS value FROM users");
    const userCount = userCountResult.rows[0] as unknown as { value: number } | undefined;
    const creditsResult = await db.execute("SELECT COALESCE(SUM(available_credits), 0) AS value FROM users");
    const credits = creditsResult.rows[0] as unknown as { value: number } | undefined;
    const generationCountResult = await db.execute("SELECT COUNT(*) AS value FROM document_generations WHERE status = 'COMPLETED'");
    const generationCount = generationCountResult.rows[0] as unknown as { value: number } | undefined;
    const pendingReviewResult = await db.execute("SELECT COUNT(*) AS value FROM orders WHERE status = 'PENDING_REVIEW'");
    const pendingReview = pendingReviewResult.rows[0] as unknown as { value: number } | undefined;

    const providers = getConfiguredAiProviders();
    const primaryProvider = providers[0];
    const apiKey = primaryProvider?.apiKey;
    const totalDocs = generationCount?.value ?? 0;
    const estimatedTokens = totalDocs * 12500;
    const estimatedCostUsd = ((estimatedTokens / 1000) * 0.0015).toFixed(3);

    const providerInfo = {
      status: apiKey ? "connected" : "disconnected",
      providerName: providers.length > 1 ? `AI Gateway Pool (${providers.length} provider)` : primaryProvider?.name || "AI Gateway",
      providerUrl: providers.map((provider) => provider.baseUrl).join(" • ") || "Belum Dikonfigurasi",
      apiKeyMasked: apiKey ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : "Belum Dikonfigurasi",
      modelCount: 0,
      balanceText: apiKey ? `${providers.length > 1 ? "Failover aktif" : "Aktif"} • Kuota Siap Digunakan` : "Tidak Aktif",
      estimatedTokensUsed: estimatedTokens,
      estimatedCostUsd: `$${estimatedCostUsd} USD`,
      avgTokensPerBlueprint: "12.500 Token",
      models: [] as Array<{ id: string; name: string; isFlagship: boolean; tier: string; healthStatus?: string; availabilityLabel?: string; statusSource?: string; providerGrade?: string }>,
    };

    if (apiKey && primaryProvider) {
      const cached = getCachedModels();
      if (cached) {
        // Deduplicate by ID using Map and add hardcoded models
        const modelsMap = new Map(cached.map((m) => [m.id, m]));
        for (const hm of HARDCODED_MODELS) {
          if (!modelsMap.has(hm.id)) {
            modelsMap.set(hm.id, classifyModel(hm.id, hm.name, { enabled: true }));
          }
        }
        const allModels = [...modelsMap.values()];
        providerInfo.modelCount = allModels.length;
        providerInfo.models = allModels.map((m) => ({
          id: m.id,
          name: m.name,
          isFlagship: m.isFlagship,
          tier: m.tier,
          healthStatus: m.healthStatus,
          availabilityLabel: m.availabilityLabel,
          statusSource: m.statusSource,
          providerGrade: m.providerGrade,
        }));
      } else {
        try {
          const modelsRes = await fetch(`${primaryProvider.baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (modelsRes.ok) {
            const modelsPayload = await modelsRes.json();
            if (Array.isArray(modelsPayload.data)) {
              const classified: ModelItem[] = modelsPayload.data.map(
                (m: { id?: string; name?: string; display_name?: string; enabled?: boolean; grade?: string; vision?: boolean }) => {
                  const id = m.id ?? "";
                  const name = m.name || m.display_name || id;
                  return classifyModel(id, name, {
                    enabled: m.enabled ?? true,
                    grade: m.grade,
                    vision: m.vision,
                  });
                },
              );
              setCachedModels(classified);
              // Deduplicate by ID using Map
              const modelsMap = new Map(classified.map((m) => [m.id, m]));
              // Add hardcoded models
              for (const hm of HARDCODED_MODELS) {
                if (!modelsMap.has(hm.id)) {
                  modelsMap.set(hm.id, classifyModel(hm.id, hm.name, { enabled: true }));
                }
              }
              const dedupedModels = [...modelsMap.values()];
              providerInfo.modelCount = dedupedModels.length;
              providerInfo.models = dedupedModels.map((m) => ({
                id: m.id,
                name: m.name,
                isFlagship: m.isFlagship,
                tier: m.tier,
                healthStatus: m.healthStatus,
                availabilityLabel: m.availabilityLabel,
                statusSource: m.statusSource,
                providerGrade: m.providerGrade,
              }));
            }
          }
        } catch {
          // Fallback gracefully
        }
      }
    }

    // Fetch Invibuilder quota only for invibuilder provider
    const invibuilderProviders = providers.filter((p) => p.id === "invibuilder");
    const quotaResults = await Promise.all(
      invibuilderProviders.map(async (p) => {
        const result = await fetchInvibuilderQuota(p.baseUrl, p.apiKey);
        return { provider: p.name, ...result };
      }),
    );

    return NextResponse.json({
      summary: {
        users: userCount?.value ?? 0,
        credits: credits?.value ?? 0,
        completedDocuments: totalDocs,
        pendingReviewCount: pendingReview?.value ?? 0,
      },
      providerInfo,
      providerQuota: quotaResults,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Data admin tidak dapat dimuat." },
      { status: 503 },
    );
  }
}
