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

  const { orderId } = (await request.json().catch(() => ({}))) as unknown as { orderId?: string };

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json(
      { error: "ID pesanan wajib disertakan." },
      { status: 400 },
    );
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const orderResult = await db.execute({
      sql: "SELECT * FROM orders WHERE id = ? AND user_email = ?",
      args: [orderId, user.email],
    });
    const order = orderResult.rows[0] as unknown as
      | { id: string; status: string; credits: number }
      | undefined;

    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
    }

    if (order.status === "COMPLETED" || order.status === "PAID") {
      return NextResponse.json({ ok: true, message: "Pesanan sudah diproses sebelumnya.", orderId });
    }

    if (order.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Pesanan belum disetujui admin. Silakan upload bukti pembayaran dan tunggu persetujuan." },
        { status: 400 },
      );
    }

    const creditBonus = order.credits || 100;

    const tx = await db.transaction("write");
    try {
      await tx.execute({
        sql: "UPDATE users SET available_credits = available_credits + ?, updated_at = ? WHERE email = ?",
        args: [creditBonus, now, user.email],
      });

      await tx.execute({
        sql: "UPDATE orders SET status = 'COMPLETED', paid_at = ? WHERE id = ?",
        args: [now, orderId],
      });

      await tx.execute({
        sql: "INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at) VALUES (?, ?, ?, ?, 'PURCHASE', ?)",
        args: [user.email, creditBonus, `Pembelian ${order.id}`, orderId, now],
      });

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

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
