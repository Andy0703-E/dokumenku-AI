import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getPlanById } from "@/lib/packages";

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

  const planDef = getPlanById(plan);
  if (!planDef) {
    return NextResponse.json({ error: "Paket tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const orderId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    await db.execute({
      sql: `INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)`,
      args: [orderId, user.email, planDef.name, planDef.price, planDef.credits, paymentMethod, now, expiresAt],
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: orderId,
        userEmail: user.email,
        planName: planDef.name,
        amount: planDef.price,
        credits: planDef.credits,
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
