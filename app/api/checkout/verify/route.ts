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

  const { orderId } = (await request.json().catch(() => ({}))) as unknown as { orderId?: string };
  if (!orderId) {
    return NextResponse.json({ error: "ID pesanan tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();

    const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [orderId] });
    const order = orderResult.rows[0] as unknown as
      | { id: string; user_email: string; plan_name: string; amount: number; credits: number; status: string }
      | undefined;

    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
    }

    if (order.user_email !== user.email) {
      return NextResponse.json({ error: "Anda tidak memiliki izin melihat pesanan ini." }, { status: 403 });
    }

    const accountResult = await db.execute({ sql: "SELECT available_credits FROM users WHERE email = ?", args: [user.email] });
    const account = accountResult.rows[0] as unknown as { available_credits: number } | undefined;

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      status: order.status,
      credits: account?.available_credits ?? 0,
      message: order.status === "COMPLETED" || order.status === "PAID"
        ? "Pembayaran berhasil dicatat dan kredit sudah masuk ke akun Anda."
        : order.status === "PENDING_REVIEW"
          ? "Invoice sedang menunggu pemeriksaan administrator. Kredit akan masuk setelah pembayaran disetujui."
          : `Status pesanan: ${order.status}. Kirim bukti pembayaran melalui WhatsApp admin untuk melanjutkan.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memverifikasi pembayaran." },
      { status: 500 },
    );
  }
}
