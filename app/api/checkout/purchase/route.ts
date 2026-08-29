import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Silakan masuk ke akun Anda terlebih dahulu untuk membeli paket." },
      { status: 401 },
    );
  }

  const { plan = "pro" } = (await request.json().catch(() => ({}))) as unknown as unknown as { plan?: string };

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const creditBonus = plan === "pro" ? 100 : 100;

    const updateRes = await db.execute({
      sql: "UPDATE users SET available_credits = available_credits + ?, updated_at = ? WHERE email = ?",
      args: [creditBonus, now, user.email],
    });

    if (updateRes.rowsAffected !== 1) {
      await db.execute({
        sql: "INSERT INTO users (email, password_hash, password_salt, available_credits, created_at, updated_at) VALUES (?, 'oauth', 'oauth', ?, ?, ?)",
        args: [user.email, creditBonus, now, now],
      });
    }

    await db.execute({
      sql: "INSERT INTO credit_transactions (user_email, amount, reason, created_at) VALUES (?, ?, 'Pembelian Paket Pro Studio (100 Kredit)', ?)",
      args: [user.email, creditBonus, now],
    });

    const accountResult = await db.execute({ sql: "SELECT available_credits FROM users WHERE email = ?", args: [user.email] });
    const account = accountResult.rows[0] as unknown as { available_credits: number } | undefined;

    return NextResponse.json({
      ok: true,
      credits: account?.available_credits ?? creditBonus,
      isPro: true,
      message: `Selamat! Paket Pro Studio (+${creditBonus} Kredit) berhasil aktif pada akun Anda.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transaksi tidak dapat diproses saat ini." },
      { status: 500 },
    );
  }
}
