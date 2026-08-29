import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";
import { classifyModel, getCachedModels, setCachedModels, type ModelItem } from "@/lib/models-config";
import { bootstrapModelHealth } from "@/app/api/admin/model-health/route";

const PROVIDER_BASE_URL = "https://bandelbanget.xyz/v1";

let bootstrapped = false;

export async function GET() {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Masuk sebagai admin diperlukan." }, { status: 403 });
  }

  if (!bootstrapped) {
    bootstrapModelHealth();
    bootstrapped = true;
  }

  try {
    const db = await getDatabase();
    const userCountResult = await db.execute("SELECT COUNT(*) AS value FROM users");
    const userCount = userCountResult.rows[0] as unknown as { value: number } | undefined;
    const creditsResult = await db.execute("SELECT COALESCE(SUM(available_credits), 0) AS value FROM users");
    const credits = creditsResult.rows[0] as unknown as { value: number } | undefined;
    const generationCountResult = await db.execute("SELECT COUNT(*) AS value FROM document_generations WHERE status = 'COMPLETED'");
    const generationCount = generationCountResult.rows[0] as unknown as { value: number } | undefined;
    const usersResult = await db.execute("SELECT email, available_credits AS credits, updated_at AS updatedAt FROM users ORDER BY updated_at DESC LIMIT 30");
    const users = usersResult.rows as unknown as Array<{ email: string; credits: number; updatedAt: string }>;
    const transactionsResult = await db.execute("SELECT id, user_email AS userEmail, amount, reason, created_at AS createdAt FROM credit_transactions ORDER BY id DESC LIMIT 30");
    const transactions = transactionsResult.rows as unknown as Array<{ id: number; userEmail: string; amount: number; reason: string; createdAt: string }>;
    const ordersResult = await db.execute("SELECT id, user_email AS userEmail, plan_name AS planName, amount, credits, payment_method AS paymentMethod, status, proof_image AS proofImage, ai_status AS aiStatus, ai_analysis AS aiAnalysis, ocr_merchant AS ocrMerchant, ocr_nmid AS ocrNmid, ocr_amount AS ocrAmount, ocr_transaction_id AS ocrTransactionId, ocr_date AS ocrDate, ocr_status AS ocrStatus, created_at AS createdAt, expires_at AS expiresAt, paid_at AS paidAt FROM orders ORDER BY created_at DESC LIMIT 50");
    const orders = ordersResult.rows as unknown as Array<{ id: string; userEmail: string; planName: string; amount: number; credits: number; paymentMethod: string; status: string; proofImage?: string; aiStatus?: string; aiAnalysis?: string; ocrMerchant?: string; ocrNmid?: string; ocrAmount?: string; ocrTransactionId?: string; ocrDate?: string; ocrStatus?: string; createdAt: string; expiresAt?: string; paidAt?: string }>;
    const auditLogsResult = await db.execute("SELECT id, order_id AS orderId, action, actor_email AS actorEmail, provider, transaction_id AS transactionId, amount, credits_granted AS creditsGranted, status_before AS statusBefore, status_after AS statusAfter, notes, created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT 50");
    const auditLogs = auditLogsResult.rows as unknown as Array<{ id: number; orderId: string; action: string; actorEmail: string; provider?: string; transactionId?: string; amount: number; creditsGranted: number; statusBefore: string; statusAfter: string; notes?: string; createdAt: string }>;

    const apiKey = process.env.BANDELBANGET_API_KEY;
    const totalDocs = generationCount?.value ?? 0;
    const estimatedTokens = totalDocs * 12500;
    const estimatedCostUsd = ((estimatedTokens / 1000) * 0.0015).toFixed(3);

    const providerInfo = {
      status: apiKey ? "connected" : "disconnected",
      providerName: "BandelAI Provider Proxy",
      providerUrl: PROVIDER_BASE_URL,
      apiKeyMasked: apiKey ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}` : "Belum Dikonfigurasi",
      modelCount: 0,
      balanceText: apiKey ? "Aktif • Kuota Siap Digunakan" : "Tidak Aktif",
      estimatedTokensUsed: estimatedTokens,
      estimatedCostUsd: `$${estimatedCostUsd} USD`,
      avgTokensPerBlueprint: "12.500 Token",
      models: [] as Array<{ id: string; name: string; isFlagship: boolean; tier: string }>,
    };

    if (apiKey) {
      const cached = getCachedModels();
      if (cached) {
        providerInfo.modelCount = cached.length;
        providerInfo.models = cached.map((m) => ({
          id: m.id,
          name: m.name,
          isFlagship: m.isFlagship,
          tier: m.tier,
          successRate: m.successRate,
          healthStatus: m.healthStatus,
        }));
      } else {
        try {
          const modelsRes = await fetch(`${PROVIDER_BASE_URL}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (modelsRes.ok) {
            const modelsPayload = await modelsRes.json();
            if (Array.isArray(modelsPayload.data)) {
              const classified: ModelItem[] = modelsPayload.data.map(
                (m: { id?: string; name?: string; display_name?: string }) => {
                  const id = m.id ?? "";
                  const name = m.name || m.display_name || id;
                  return classifyModel(id, name);
                },
              );
              setCachedModels(classified);
              providerInfo.modelCount = classified.length;
              providerInfo.models = classified.map((m) => ({
                id: m.id,
                name: m.name,
                isFlagship: m.isFlagship,
                tier: m.tier,
                successRate: m.successRate,
                healthStatus: m.healthStatus,
              }));
            }
          }
        } catch {
          // Fallback gracefully
        }
      }
    }

    return NextResponse.json({
      summary: {
        users: userCount?.value ?? 0,
        credits: credits?.value ?? 0,
        completedDocuments: totalDocs,
      },
      providerInfo,
      users,
      transactions,
      orders,
      auditLogs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Data admin tidak dapat dimuat." },
      { status: 503 },
    );
  }
}
