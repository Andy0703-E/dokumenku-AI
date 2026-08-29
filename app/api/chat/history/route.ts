import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: "SELECT id, user_email, user_name, message, admin_reply, created_at FROM chat_messages WHERE user_email = ? ORDER BY created_at ASC",
      args: [user.email],
    });

    const messages = result.rows.map((row) => ({
      id: Number(row.id),
      userName: row.user_name,
      message: row.message,
      adminReply: row.admin_reply ?? null,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat riwayat chat." },
      { status: 500 },
    );
  }
}
