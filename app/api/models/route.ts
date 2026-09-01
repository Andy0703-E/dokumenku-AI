import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/db";
import { classifyModel, getCachedModels, setCachedModels, type ModelItem, HARDCODED_MODELS } from "@/lib/models-config";
import { isProviderMaintenance, PROVIDER_MAINTENANCE_MESSAGE } from "@/lib/provider-maintenance";
import { getConfiguredAiProviders } from "@/lib/ai-provider-pool";

export async function GET() {
  const providers = getConfiguredAiProviders();
  if (providers.length === 0) {
    return NextResponse.json(
      { error: "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu." },
      { status: 503 },
    );
  }

  let isPro = false;
  const user = await getCurrentUser();
  if (user) {
    if (user.role === "admin") {
      isPro = true;
    } else {
      try {
        const db = await getDatabase();
        const purchasedResult = await db.execute({
          sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
          args: [user.email],
        });
        if (purchasedResult.rows[0]) isPro = true;
      } catch {
        isPro = false;
      }
    }
  }

  const cached = getCachedModels();
  if (cached) {
    return NextResponse.json({ data: cached, isPro });
  }

  const results = await Promise.all(providers.map(async (provider) => {
    try {
      const upstreamResponse = await fetch(`${provider.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });
      const responseText = await upstreamResponse.text();
      if (!upstreamResponse.ok) {
        return { models: [] as ModelItem[], status: upstreamResponse.status, maintenance: isProviderMaintenance(upstreamResponse.status, responseText) };
      }
      const payload = JSON.parse(responseText) as { data?: unknown };
      if (!Array.isArray(payload.data)) return { models: [] as ModelItem[], status: 502, maintenance: false };
      const models = payload.data
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
      return { models, status: 200, maintenance: false };
    } catch {
      return { models: [] as ModelItem[], status: 502, maintenance: false };
    }
  }));

  const classifiedList = [...new Map(results.flatMap((result) => result.models).map((model) => [model.id, model])).values()];

  // Add hardcoded models (not returned by /models endpoint)
  const modelsMap = new Map(classifiedList.map((m) => [m.id, m]));
  for (const hm of HARDCODED_MODELS) {
    if (!modelsMap.has(hm.id)) {
      modelsMap.set(hm.id, classifyModel(hm.id, hm.name, { enabled: true }));
    }
  }
  const finalList = [...modelsMap.values()];

  if (!finalList.length) {
    const allMaintenance = results.every((result) => result.maintenance);
    return NextResponse.json(
      { error: allMaintenance ? PROVIDER_MAINTENANCE_MESSAGE : "Daftar model dari provider AI sedang tidak dapat dimuat. Silakan coba lagi beberapa saat lagi.", ...(allMaintenance ? { providerStatus: "maintenance" } : {}) },
      { status: allMaintenance ? 503 : 502 },
    );
  }

  finalList.sort((a: ModelItem, b: ModelItem) => {
    const aHealthy = a.healthStatus === "healthy" ? 1 : 0;
    const bHealthy = b.healthStatus === "healthy" ? 1 : 0;
    if (aHealthy !== bHealthy) return bHealthy - aHealthy;
    if (a.isFlagship !== b.isFlagship) return a.isFlagship ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  setCachedModels(finalList);
  return NextResponse.json({ data: finalList, isPro, providerCount: providers.length });
}
