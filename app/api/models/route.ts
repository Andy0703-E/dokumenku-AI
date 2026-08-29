import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/db";
import { classifyModel, type ModelItem } from "@/lib/models-config";

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

  try {
    const upstreamResponse = await fetch(`${PROVIDER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const payload = await upstreamResponse.json();

    if (payload && Array.isArray(payload.data)) {
      const classifiedList: ModelItem[] = payload.data.map(
        (m: { id?: string; name?: string; display_name?: string }) => {
          const id = m.id ?? "";
          const name = m.name || m.display_name || id;
          return classifyModel(id, name);
        },
      );

      classifiedList.sort((a: ModelItem, b: ModelItem) => {
        const aHealthy = a.healthStatus === "healthy" ? 1 : 0;
        const bHealthy = b.healthStatus === "healthy" ? 1 : 0;
        if (aHealthy !== bHealthy) return bHealthy - aHealthy;
        if (a.isFlagship !== b.isFlagship) return a.isFlagship ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ data: classifiedList, isPro });
    }

    return NextResponse.json(payload, { status: upstreamResponse.status });
  } catch {
    return NextResponse.json({ error: "Tidak dapat memuat daftar model saat ini." }, { status: 502 });
  }
}
