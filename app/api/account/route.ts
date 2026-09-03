import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const isSummaryRequest = new URL(request.url).searchParams.get("view") === "summary";

  if (user) {
    try {
      const db = await getDatabase();
      const [accountResult, purchasedResult] = await Promise.all([
        db.execute({
          sql: "SELECT email, available_credits, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE email = ?",
          args: [user.email],
        }),
        db.execute({
          sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
          args: [user.email],
        }),
      ]);
      const account = accountResult.rows[0] as unknown as { email: string; available_credits: number; createdAt: string; updatedAt: string } | undefined;
      const purchased = purchasedResult.rows[0];

      const summary = {
        authenticated: true,
        email: user.email,
        role: user.role,
        credits: account?.available_credits ?? 0,
        createdAt: account?.createdAt ?? new Date().toISOString(),
        isPro: Boolean(purchased) || user.role === "admin",
      };

      if (isSummaryRequest) {
        return NextResponse.json(summary, { headers: { "Cache-Control": "no-store, private" } });
      }

      const [generationsResult, transactionsResult] = await Promise.all([
        db.execute({
          sql: "SELECT id, model, prompt, status, created_at AS createdAt, completed_at AS completedAt FROM document_generations WHERE user_email = ? ORDER BY created_at DESC LIMIT 50",
          args: [user.email],
        }),
        db.execute({
          sql: "SELECT id, amount, reason, created_at AS createdAt FROM credit_transactions WHERE user_email = ? ORDER BY id DESC LIMIT 50",
          args: [user.email],
        }),
      ]);
      const generations = generationsResult.rows as unknown as Array<{
        id: string;
        model: string;
        prompt: string | null;
        status: string;
        createdAt: string;
        completedAt: string | null;
      }>;
      const transactions = transactionsResult.rows as unknown as Array<{
        id: number;
        amount: number;
        reason: string;
        createdAt: string;
      }>;

      return NextResponse.json(
        { ...summary, generations, transactions },
        { headers: { "Cache-Control": "no-store, private" } },
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Akun tidak dapat dimuat." },
        { status: 503, headers: { "Cache-Control": "no-store, private" } },
      );
    }
  }

  // Guest Mode - no guest credits (users must authenticate to generate)
  const response = NextResponse.json(
    {
      authenticated: false,
      credits: 0,
      generations: [],
      transactions: [],
    },
    { headers: { "Cache-Control": "no-store, private" } },
  );

  return response;
}
