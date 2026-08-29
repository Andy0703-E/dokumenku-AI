import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { sendWhatsAppMessage, getAdminPhone } from "@/lib/whatsapp-gateway";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { name, message } = body as { name?: string; message?: string };

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

  const userEmail = user.email;
  const userName = (name && name.trim()) || user.email.split("@")[0];
  const userMessage = message.trim();
  const now = new Date().toISOString();

  try {
    const db = await getDatabase();

    const result = await db.execute({
      sql: "INSERT INTO chat_messages (user_email, user_name, message, forwarded_to_admin, created_at) VALUES (?, ?, ?, 0, ?)",
      args: [userEmail, userName, userMessage, now],
    });
    const chatId = Number(result.lastInsertRowid ?? 0);

    let forwarded = false;
    const adminPhone = getAdminPhone();
    const waMessage = `💬 *Chat Baru dari Dokumenku AI*\n\n👤 *Nama:* ${userName}\n📧 *Email:* ${userEmail || "Guest"}\n🆔 *Chat ID:* #${chatId}\n\n💬 *Pesan:*\n${userMessage}\n\n---\nBalas pesan ini langsung di WhatsApp untuk membalas user.`;

    try {
      const waResult = await sendWhatsAppMessage(adminPhone, waMessage);
      forwarded = waResult.ok;
    } catch {
      forwarded = false;
    }

    await db.execute({
      sql: "UPDATE chat_messages SET forwarded_to_admin = ? WHERE id = ?",
      args: [forwarded ? 1 : 0, chatId],
    });

    return NextResponse.json({
      ok: true,
      chatId,
      forwarded,
      message: forwarded
        ? "Pesan Anda telah diteruskan ke admin. Balasan akan dikirim via WhatsApp."
        : "Pesan Anda tersimpan. Admin akan segera membalas.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengirim pesan." },
      { status: 500 },
    );
  }
}
