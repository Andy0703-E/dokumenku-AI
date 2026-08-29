import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sesi autentikasi telah berakhir. Silakan masuk kembali." },
      { status: 401 },
    );
  }

  const { orderId } = (await request.json().catch(() => ({}))) as unknown as unknown as { orderId?: string };
  if (!orderId) {
    return NextResponse.json({ error: "ID pesanan tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
    const order = orderResult.rows[0] as unknown as
      | { id: string; user_email: string; plan_name: string; amount: number; credits: number; status: string }
      | undefined;

    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
    }

    if (order.user_email !== user.email && user.role !== "admin") {
      return NextResponse.json({ error: "Anda tidak memiliki izin memverifikasi pesanan ini." }, { status: 403 });
    }

    if (order.status === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true, message: "Pesanan ini sudah berhasil diverifikasi sebelumnya." });
    }

    await db.execute({ sql: "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?", args: [now, orderId] });

    const creditBonus = order.credits;
    const updateRes = await db.execute({
      sql: "UPDATE users SET available_credits = available_credits + ?, updated_at = ? WHERE email = ?",
      args: [creditBonus, now, order.user_email],
    });

    if (updateRes.rowsAffected !== 1) {
      await db.execute({
        sql: "INSERT INTO users (email, password_hash, password_salt, available_credits, created_at, updated_at) VALUES (?, 'oauth', 'oauth', ?, ?, ?)",
        args: [order.user_email, creditBonus, now, now],
      });
    }

    await db.execute({
      sql: "INSERT INTO credit_transactions (user_email, amount, reason, created_at) VALUES (?, ?, ?, ?)",
      args: [order.user_email, creditBonus, `Pembelian ${order.plan_name} (${orderId})`, now],
    });

    const accountResult = await db.execute({ sql: "SELECT available_credits FROM users WHERE email = ?", args: [order.user_email] });
    const account = accountResult.rows[0] as unknown as { available_credits: number } | undefined;

    return NextResponse.json({
      ok: true,
      credits: account?.available_credits ?? creditBonus,
      isPro: true,
      message: `Pembayaran berhasil diverifikasi! +${creditBonus} Kredit Pro Studio telah aktif.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memverifikasi pembayaran." },
      { status: 500 },
    );
  }
}
