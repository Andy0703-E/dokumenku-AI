import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/db";
import { classifyModel, getCachedModels, setCachedModels, type ModelItem } from "@/lib/models-config";
import { isProviderMaintenance, PROVIDER_MAINTENANCE_MESSAGE } from "@/lib/provider-maintenance";

const PROVIDER_BASE_URL = "https://bandelbanget.xyz/v1";

export async function GET() {
  const apiKey = process.env.BANDELBANGET_API_KEY;
  if (!apiKey) {
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

  try {
    const upstreamResponse = await fetch(`${PROVIDER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const responseText = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      if (isProviderMaintenance(upstreamResponse.status, responseText)) {
        return NextResponse.json(
          { error: PROVIDER_MAINTENANCE_MESSAGE, providerStatus: "maintenance" },
          { status: 503 },
        );
      }

      return NextResponse.json(
        { error: "Daftar model dari provider AI sedang tidak dapat dimuat. Silakan coba lagi beberapa saat lagi." },
        { status: upstreamResponse.status },
      );
    }

    const payload = JSON.parse(responseText) as { data?: unknown };

    if (payload && Array.isArray(payload.data)) {
      const classifiedList: ModelItem[] = payload.data
        .filter((m: { id?: string }) => {
          const id = (m.id ?? "").trim().toLowerCase();
          return id && id !== "auto" && id !== "auto-debug" && id !== "hy3";
        })
        .map(
          (m: { id?: string; name?: string; display_name?: string; enabled?: boolean; grade?: string; vision?: boolean }) => {
            const id = m.id ?? "";
            const name = m.name || m.display_name || id;
            return classifyModel(id, name, {
              enabled: m.enabled,
              grade: m.grade,
              vision: m.vision,
            });
          },
        );

      classifiedList.sort((a: ModelItem, b: ModelItem) => {
        const aHealthy = a.healthStatus === "healthy" ? 1 : 0;
        const bHealthy = b.healthStatus === "healthy" ? 1 : 0;
        if (aHealthy !== bHealthy) return bHealthy - aHealthy;
        if (a.isFlagship !== b.isFlagship) return a.isFlagship ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      setCachedModels(classifiedList);

      return NextResponse.json({ data: classifiedList, isPro });
    }

    return NextResponse.json(payload, { status: upstreamResponse.status });
  } catch {
    return NextResponse.json({ error: "Tidak dapat memuat daftar model saat ini." }, { status: 502 });
  }
}
