import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Masuk sebagai admin diperlukan." }, { status: 403 });
  }

  const { email, amount, reason } = await request.json() as unknown as { email?: string; amount?: number; reason?: string };
  const recipient = email?.trim().toLowerCase() ?? "";
  const credits = Number(amount);
  if (!recipient.includes("@") || !Number.isInteger(credits) || credits < 1 || credits > 10_000) {
    return NextResponse.json({ error: "Email atau jumlah kredit tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const note = reason?.trim() || `Top up oleh admin ${admin.email}`;
    const userResult = await db.execute({ sql: "SELECT email FROM users WHERE email = ?", args: [recipient] });
    if (!userResult.rows[0]) return NextResponse.json({ error: "Pengguna belum membuat akun." }, { status: 404 });
    await db.execute({
      sql: "UPDATE users SET available_credits = available_credits + ?, updated_at = ? WHERE email = ?",
      args: [credits, now, recipient],
    });
    await db.execute({
      sql: "INSERT INTO credit_transactions (user_email, amount, reason, created_at) VALUES (?, ?, ?, ?)",
      args: [recipient, credits, note, now],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kredit tidak dapat ditambahkan." },
      { status: 503 },
    );
  }
}
