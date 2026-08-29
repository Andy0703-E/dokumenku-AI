import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";

export async function GET() {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  try {
    const db = await getDatabase();
    const result = await db.execute(
      "SELECT id, user_email, user_name, message, admin_reply, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 100"
    );

    const messages = result.rows.map((row) => ({
      id: Number(row.id),
      userEmail: row.user_email,
      userName: row.user_name,
      message: row.message,
      adminReply: row.admin_reply ?? null,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memuat chat." },
      { status: 500 },
    );
  }
}

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

    const chatResult = await db.execute({
      sql: "SELECT id FROM chat_messages WHERE id = ?",
      args: [chatId],
    });
    if (!chatResult.rows[0]) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    await db.execute({
      sql: "UPDATE chat_messages SET admin_reply = ? WHERE id = ?",
      args: [reply.trim(), chatId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengirim balasan." },
      { status: 500 },
    );
  }
}
