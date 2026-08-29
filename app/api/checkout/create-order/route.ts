import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Silakan masuk ke akun Anda terlebih dahulu untuk membuat pesanan." },
      { status: 401 },
    );
  }

  const { plan = "pro", paymentMethod = "QRIS" } = (await request.json().catch(() => ({}))) as unknown as {
    plan?: string;
    paymentMethod?: string;
  };

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const orderId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const planName = plan === "pro" ? "Pro Studio" : "Pro Studio";
    const amount = 20000;
    const credits = 100;

    await db.execute({
      sql: `INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)`,
      args: [orderId, user.email, planName, amount, credits, paymentMethod, now, expiresAt],
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: orderId,
        userEmail: user.email,
        planName,
        amount,
        credits,
        paymentMethod,
        status: "CREATED",
        createdAt: now,
        expiresAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat tagihan pembayaran." },
      { status: 500 },
    );
  }
}
