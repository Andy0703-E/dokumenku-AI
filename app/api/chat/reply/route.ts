import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { chatId, reply } = (await request.json().catch(() => ({}))) as {
    chatId?: number;
    reply?: string;
  };

  if (!chatId || !reply || !reply.trim()) {
    return NextResponse.json({ error: "chatId and reply required." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const chatResult = await db.execute({
      sql: "SELECT id, user_email, user_name, message FROM chat_messages WHERE id = ?",
      args: [chatId],
    });
    const chat = chatResult.rows[0] as unknown as {
      id: number;
      user_email: string | null;
      user_name: string;
      message: string;
    } | undefined;

    if (!chat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    await db.execute({
      sql: "UPDATE chat_messages SET admin_reply = ?, created_at = ? WHERE id = ?",
      args: [reply.trim(), now, chatId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengirim balasan." },
      { status: 500 },
    );
  }
}
