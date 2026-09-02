import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { message } = body as { message?: string };

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu untuk chat." }, { status: 401 });
  }

  if (!message || !message.trim() || message.trim().length < 3) {
    return NextResponse.json({ error: "Pesan minimal 3 karakter." }, { status: 400 });
  }
  if (message.trim().length > 2000) {
    return NextResponse.json({ error: "Pesan maksimal 2000 karakter." }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    const db = await getDatabase();

    const result = await db.execute({
      sql: "INSERT INTO chat_messages (user_email, user_name, message, forwarded_to_admin, created_at) VALUES (?, ?, ?, 0, ?)",
      args: [user.email, user.email.split("@")[0], message.trim(), now],
    });
    const chatId = Number(result.lastInsertRowid ?? 0);

    return NextResponse.json({
      ok: true,
      chatId,
      message: "Pesan terkirim! Admin akan segera merespons melalui dashboard.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengirim pesan." },
      { status: 500 },
    );
  }
}
