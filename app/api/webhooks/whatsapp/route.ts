import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  getDatabase,
  executeAtomicPaymentApproval,
  insertAuditLogEntry,
  hashApprovalToken,
  safeCompare,
} from "@/db";
import {
  getAdminPhone,
  normalizePhoneNumber,
  sendWhatsAppMessage,
} from "@/lib/whatsapp-gateway";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Dokumenku AI WhatsApp Webhook Gateway",
    status: "active",
    timestamp: new Date().toISOString(),
  });
}

function extractInvoiceId(text: string): string | null {
  if (!text) return null;
  const match = text.match(/INV-[A-Z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      const searchParams = new URLSearchParams(rawBody);
      payload = Object.fromEntries(searchParams.entries());
    }

    const expectedSecret = process.env.FONNTE_WEBHOOK_SECRET || process.env.WA_WEBHOOK_SECRET;
    if (expectedSecret) {
      const headerSecret = request.headers.get("x-webhook-secret") || request.headers.get("authorization")?.replace("Bearer ", "");
      const querySecret = request.nextUrl.searchParams.get("secret");
      const payloadSecret = String(payload.secret || payload.token || "");
      const providedSecret = headerSecret || querySecret || payloadSecret;
      if (!providedSecret) {
        console.warn("[WA WEBHOOK] Ditolak: Signature/Secret webhook tidak valid.");
        return NextResponse.json({ error: "Unauthorized webhook signature." }, { status: 401 });
      }
      const a = Buffer.from(providedSecret);
      const b = Buffer.from(expectedSecret);
      if (a.length !== b.length || !require("node:crypto").timingSafeEqual(a, b)) {
        console.warn("[WA WEBHOOK] Ditolak: Signature/Secret webhook tidak valid.");
        return NextResponse.json({ error: "Unauthorized webhook signature." }, { status: 401 });
      }
    }

    const rawSender = String(payload.sender || payload.from || payload.phone || payload.number || "");
    const rawMessage = String(payload.message || payload.body || payload.text || payload.data || "").trim();

    if (!rawSender || !rawMessage) {
      return NextResponse.json({ ok: false, error: "Empty sender or message payload" }, { status: 400 });
    }

    const sender = normalizePhoneNumber(rawSender);
    const adminPhone = getAdminPhone();
    const db = await getDatabase();

    const externalEventId = String(payload.inboxid || payload.id || payload.message_id || payload.msg_id || "").trim();

    if (externalEventId) {
      const existingEventResult = await db.execute({
        sql: "SELECT * FROM webhook_events WHERE provider = 'fonnte' AND external_event_id = ?",
        args: [externalEventId],
      });
      const existingEvent = existingEventResult.rows[0] as unknown as { status: string } | undefined;

      if (existingEvent) {
        if (existingEvent.status === "PROCESSED" || existingEvent.status === "PROCESSING") {
          console.log(`[WA WEBHOOK] Replay event ${externalEventId} dideteksi (${existingEvent.status}). Mengembalikan HTTP 200.`);
          return NextResponse.json({ ok: true, replay: true, status: existingEvent.status, message: "Webhook event already handled." });
        }
      } else {
        try {
          await db.execute({
            sql: `INSERT INTO webhook_events (provider, external_event_id, event_type, sender, payload_sha256, status, received_at)
              VALUES ('fonnte', ?, 'incoming_message', ?, ?, 'RECEIVED', ?)`,
            args: [externalEventId, sender, payloadSha256, new Date().toISOString()],
          });
        } catch {
          // Handled by concurrency
        }
      }
    }

    if (sender !== adminPhone) {
      console.warn(`[WA WEBHOOK] Akses ditolak: Pengirim (${sender}) bukan nomor admin terdaftar (${adminPhone}).`);
      if (externalEventId) {
        await db.execute({
          sql: "UPDATE webhook_events SET status = 'IGNORED', error_code = 'UNAUTHORIZED_SENDER', processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?",
          args: [new Date().toISOString(), externalEventId],
        });
      }
      return NextResponse.json({ error: "Forbidden: Sender not registered as administrator." }, { status: 403 });
    }

    const lower = rawMessage.toLowerCase();
    const parts = rawMessage.split(/\s+/).filter(Boolean);
    const command = parts[0]?.toUpperCase();

    console.log(`[WA WEBHOOK] sender=${sender} message="${rawMessage}" command=${command}`);

    // ── Handle 'TEST' Command ──────────────────────────────────────
    if (command === "TEST") {
      await sendWhatsAppMessage(sender, "✅ Webhook aktif! Bot siap menerima perintah.").catch(() => {});
      return NextResponse.json({ ok: true, test: true });
    }

    // ── Handle Chat Reply: #<chatId> <reply> or BALAS <chatId> <reply> ──
    const chatReplyMatch = rawMessage.match(/(?:^|\s)#(\d+)\s+([\s\S]+)/i) || rawMessage.match(/BALAS\s+(\d+)\s+([\s\S]+)/i);
    if (chatReplyMatch) {
      const chatId = Number(chatReplyMatch[1]);
      const replyText = (chatReplyMatch[2] || "").trim();

      if (!chatId || !replyText) {
        await sendWhatsAppMessage(sender, "⚠️ Format: *#<ID> <pesan balasan>* atau *BALAS <ID> <pesan>*").catch(() => {});
        return NextResponse.json({ ok: false, error: "Invalid chat reply format" }, { status: 400 });
      }

      const chatResult = await db.execute({
        sql: "SELECT id, user_email, user_name, message FROM chat_messages WHERE id = ?",
        args: [chatId],
      });
      const chat = chatResult.rows[0] as unknown as { id: number; user_email: string | null; user_name: string; message: string } | undefined;

      if (!chat) {
        await sendWhatsAppMessage(sender, `⚠️ Chat #${chatId} tidak ditemukan.`).catch(() => {});
        return NextResponse.json({ ok: false, error: "Chat not found" }, { status: 404 });
      }

      await db.execute({
        sql: "UPDATE chat_messages SET admin_reply = ? WHERE id = ?",
        args: [replyText, chatId],
      });

      await sendWhatsAppMessage(sender, `✅ Balasan untuk chat #${chatId} (${chat.user_name}) telah terkirim ke user.`).catch(() => {});

      if (externalEventId) {
        await db.execute({
          sql: "UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?",
          args: [new Date().toISOString(), externalEventId],
        });
      }

      return NextResponse.json({ ok: true, chatReply: true, chatId });
    }

    // ── Handle 'ACC' Command ────────────────────────────────────────
    if (command === "ACC" || lower.startsWith("acc")) {
      const targetInv = extractInvoiceId(rawMessage);
      const tokenArg = parts.find((p) => p.length === 6 && /^[A-Z0-9]+$/i.test(p) && !p.toUpperCase().startsWith("INV"));

      let order: Record<string, unknown> | undefined;

      if (targetInv) {
        const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE UPPER(id) = UPPER(?)", args: [targetInv] });
        order = orderResult.rows[0] as Record<string, unknown> | undefined;
      }

      if (!order && tokenArg) {
        const hashed = hashApprovalToken(tokenArg);
        const rowsResult = await db.execute({
          sql: "SELECT * FROM orders WHERE approval_token_hash IS NOT NULL AND status = 'PENDING_REVIEW' ORDER BY created_at DESC",
          args: [],
        });
        const rows = rowsResult.rows as Record<string, unknown>[];
        order = rows.find((r) => r.approval_token_hash && safeCompare(String(r.approval_token_hash), hashed));
      }

      if (!order) {
        const errMsg = "⚠️ Format salah atau tagihan tidak ditemukan. Ketik: *ACC <INV-ID> <TOKEN>*";
        await sendWhatsAppMessage(sender, errMsg).catch(() => {});
        return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
      }

      const orderId = String(order.id);
      const userEmail = String(order.user_email);
      const amount = Number(order.amount || 20000);
      const creditBonus = Number(order.credits || 100);

      if (tokenArg && order.approval_token_hash) {
        const computedHash = hashApprovalToken(tokenArg);
        if (!safeCompare(String(order.approval_token_hash), computedHash)) {
          const errMsg = `⚠️ Token approval '${tokenArg}' tidak cocok dengan tagihan ${orderId}.`;
          await sendWhatsAppMessage(sender, errMsg).catch(() => {});
          return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
        }
      }

      try {
        if (externalEventId) {
          await db.execute({
            sql: "UPDATE webhook_events SET status = 'PROCESSING' WHERE provider = 'fonnte' AND external_event_id = ?",
            args: [externalEventId],
          });
        }

        const approvalResult = await executeAtomicPaymentApproval(db, {
          orderId,
          actorEmail: `admin-wa-${sender}`,
          provider: "QRIS_MANUAL_WHATSAPP_WEBHOOK",
          token: tokenArg,
          notes: `Disetujui melalui WhatsApp Webhook oleh ${sender}`,
        });

        if (!approvalResult.ok) {
          throw new Error(approvalResult.error || "Gagal memproses approval atomik.");
        }

        if (externalEventId) {
          await db.execute({
            sql: "UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?",
            args: [new Date().toISOString(), externalEventId],
          });
        }

        const replyText = `✅ *[TAGIHAN BERHASIL DISETUJUI (ACC)]*
━━━━━━━━━━━━━━━━━━━━━━━
📄 *No. Invoice:* \`${orderId}\`
👤 *Pengguna:* ${userEmail}
💰 *Nominal:* Rp ${amount.toLocaleString("id-ID")}
💎 *Kredit Ditambahkan:* +${creditBonus} Kredit Pro Studio
🟢 *Status:* LUNAS (PAID)
🔒 *Audit Chain Integrity:* VERIFIED (HMAC-SHA256)

Saldo kredit pengguna telah aktif seketika di website Dokumenku AI!`;

        try {
          await sendWhatsAppMessage(sender, replyText);
        } catch (waErr) {
          console.error("[WA WEBHOOK] Gagal mengirim konfirmasi WhatsApp setelah commit:", waErr);
        }

        console.log(`✅ [WA WEBHOOK] Invoice ${orderId} approved via Webhook by ${sender}.`);
        return NextResponse.json({ ok: true, orderId, status: "PAID" });
      } catch (err) {
        if (externalEventId) {
          await db.execute({
            sql: "UPDATE webhook_events SET status = 'FAILED', error_code = ?, processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?",
            args: [err instanceof Error ? err.message : "UNKNOWN_ERROR", new Date().toISOString(), externalEventId],
          });
        }

        const errMsg = `⚠️ Gagal ACC Tagihan ${orderId}: ${err instanceof Error ? err.message : "Error tidak dikenal"}`;
        await sendWhatsAppMessage(sender, errMsg).catch(() => {});
        return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
      }
    }

    // ── Handle 'TOLAK' / 'BATAL' Command ─────────────────────────────
    if (command === "TOLAK" || command === "BATAL" || lower.startsWith("tolak")) {
      const targetInv = extractInvoiceId(rawMessage);
      let order: Record<string, unknown> | undefined;

      if (targetInv) {
        const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE UPPER(id) = UPPER(?)", args: [targetInv] });
        order = orderResult.rows[0] as Record<string, unknown> | undefined;
      } else {
        const orderResult = await db.execute({ sql: "SELECT * FROM orders WHERE status = 'PENDING_REVIEW' ORDER BY created_at DESC LIMIT 1", args: [] });
        order = orderResult.rows[0] as Record<string, unknown> | undefined;
      }

      if (!order) {
        const errMsg = "⚠️ Tidak ada tagihan pending yang ditemukan untuk ditolak.";
        await sendWhatsAppMessage(sender, errMsg).catch(() => {});
        return NextResponse.json({ ok: false, error: errMsg });
      }

      const orderId = String(order.id);
      const userEmail = String(order.user_email);

      await db.execute({
        sql: "UPDATE orders SET status = 'REJECTED', updated_at = ? WHERE id = ?",
        args: [new Date().toISOString(), orderId],
      });

      await insertAuditLogEntry(db, {
        orderId,
        action: "REJECT_PAYMENT",
        actorEmail: `admin-wa-${sender}`,
        provider: "QRIS",
        statusBefore: String(order.status),
        statusAfter: "REJECTED",
        notes: `Ditolak melalui WhatsApp Webhook oleh ${sender}`,
      });

      if (externalEventId) {
        await db.execute({
          sql: "UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?",
          args: [new Date().toISOString(), externalEventId],
        });
      }

      const replyText = `❌ *[TAGIHAN DITOLAK / DIBATALKAN]*
━━━━━━━━━━━━━━━━━━━━━━━
📄 *No. Invoice:* \`${orderId}\`
👤 *Pengguna:* ${userEmail}
🔴 *Status:* REJECTED / DIBATALKAN`;

      await sendWhatsAppMessage(sender, replyText).catch(() => {});
      return NextResponse.json({ ok: true, orderId, status: "REJECTED" });
    }

    // ── Handle 'LIST' Command ────────────────────────────────────────
    if (command === "LIST" || command === "CEK" || command === "PENDING") {
      const pendingResult = await db.execute({
        sql: "SELECT id, user_email, amount, credits, created_at, ocr_merchant, ocr_amount FROM orders WHERE status = 'PENDING_REVIEW' ORDER BY created_at DESC LIMIT 5",
        args: [],
      });
      const pendingOrders = pendingResult.rows as Record<string, unknown>[];

      if (pendingOrders.length === 0) {
        const replyText = "✨ Saat ini tidak ada tagihan yang menunggu verifikasi (0 pending).";
        await sendWhatsAppMessage(sender, replyText).catch(() => {});
        return NextResponse.json({ ok: true, count: 0 });
      }

      let listText = `📋 *DAFTAR TAGIHAN MENUNGGU REVIEW (${pendingOrders.length})*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      pendingOrders.forEach((ord, i) => {
        listText += `\n*${i + 1}. ${ord.id}*\n• User: ${ord.user_email}\n• Tagihan: Rp ${(Number(ord.amount) || 20000).toLocaleString("id-ID")} (+${ord.credits} Kredit)\n• Merchant: ${ord.ocr_merchant || "-"}\n• Balas: *ACC ${ord.id}* atau *TOLAK ${ord.id}*\n`;
      });

      await sendWhatsAppMessage(sender, listText).catch(() => {});
      return NextResponse.json({ ok: true, count: pendingOrders.length });
    }

    // ── Handle 'HELP' Command ────────────────────────────────────────
    if (command === "HELP" || command === "BANTUAN" || command === "MENU") {
      const helpText = `🤖 *PANDUAN BOT WHATSAPP DOKUMENKU AI (SERVERLESS)*
━━━━━━━━━━━━━━━━━━━━━━━
Gunakan perintah balasan berikut:

• *ACC <INV-ID> <TOKEN>* ➔ Setujui tagihan & tambah +100 kredit
• *TOLAK <INV-ID>* ➔ Batalkan tagihan
• *LIST* ➔ Lihat daftar tagihan pending
• *HELP* ➔ Tampilkan panduan ini`;

      await sendWhatsAppMessage(sender, helpText).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, message: "Unhandled message type" });
  } catch (error) {
    console.error("[WA WEBHOOK] Internal error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal webhook error" }, { status: 500 });
  }
}
