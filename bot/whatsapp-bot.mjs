import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHmac, timingSafeEqual } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env.local if present
try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env.local"));
} catch {
  // .env.local optional
}

// Database path
const dbPath = path.resolve(__dirname, "..", "data", "dokumenku.sqlite");
const db = new DatabaseSync(dbPath);

// Normalize phone number (converts 08... or +62... to 62...)
function normalizePhoneNumber(raw) {
  if (!raw) return "6285754494990";
  let cleaned = String(raw).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("08")) {
    cleaned = "628" + cleaned.slice(2);
  } else if (cleaned.startsWith("8")) {
    cleaned = "628" + cleaned.slice(1);
  }
  return cleaned;
}

// Configuration
const ADMIN_PHONE = normalizePhoneNumber(
  process.env.ADMIN_WA_PHONE || process.env.WA_ADMIN_PHONE || "6285754494990"
);
const ADMIN_CHAT_ID = `${ADMIN_PHONE}@c.us`;
const HTTP_PORT = process.env.WA_BOT_PORT ? parseInt(process.env.WA_BOT_PORT, 10) : 5050;
const APPROVAL_TOKEN_SECRET =
  process.env.APPROVAL_TOKEN_SECRET || process.env.APP_SECRET || "dokumenku-approval-token-secret-2026";
const AUDIT_CHAIN_SECRET =
  process.env.AUDIT_CHAIN_SECRET || process.env.APP_SECRET || "dokumenku-audit-chain-secret-2026";

function hashApprovalToken(token) {
  return createHmac("sha256", APPROVAL_TOKEN_SECRET)
    .update(token.toUpperCase().trim())
    .digest("hex");
}

function safeCompare(a, b) {
  try {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

function buildCanonicalAuditPayload(params) {
  return JSON.stringify({
    version: 1,
    sequence: Number(params.sequence ?? 1),
    key_version: Number(params.keyVersion ?? 1),
    order_id: String(params.orderId),
    action: String(params.action),
    actor: String(params.actorEmail),
    provider: String(params.provider ?? "QRIS"),
    transaction_id: String(params.transactionId ?? "N/A"),
    amount: Number(params.amount ?? 0),
    credits: Number(params.creditsGranted ?? 0),
    status_before: String(params.statusBefore ?? "N/A"),
    status_after: String(params.statusAfter ?? "N/A"),
    notes: String(params.notes ?? ""),
    previous_hash: String(params.previousHash),
    created_at: String(params.createdAt),
  });
}

function insertAuditLogEntry(database, params) {
  const now = params.createdAt || new Date().toISOString();
  const amount = params.amount || 0;
  const creditsGranted = params.creditsGranted || 0;
  const provider = params.provider || "QRIS";
  const transactionId = params.transactionId || "N/A";
  const statusBefore = params.statusBefore || "N/A";
  const statusAfter = params.statusAfter || "N/A";
  const notes = params.notes || "";
  const keyVersion = 1;

  const lastEntry = database
    .prepare("SELECT sequence, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    .get();

  const sequence = (lastEntry?.sequence || 0) + 1;
  const previousHash = lastEntry?.entry_hash || "GENESIS_BLOCK_DOKUMENKU_AI_2026";

  const canonicalPayload = buildCanonicalAuditPayload({
    sequence,
    keyVersion,
    orderId: params.orderId,
    action: params.action,
    actorEmail: params.actorEmail,
    provider,
    transactionId,
    amount,
    creditsGranted,
    statusBefore,
    statusAfter,
    notes,
    previousHash,
    createdAt: now,
  });

  const entryHash = createHmac("sha256", AUDIT_CHAIN_SECRET)
    .update(canonicalPayload)
    .digest("hex");

  database.prepare(`
    INSERT INTO audit_logs (
      sequence, key_version,
      order_id, action, actor_email, provider, transaction_id, 
      amount, credits_granted, status_before, status_after, notes, 
      previous_hash, entry_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sequence,
    keyVersion,
    params.orderId,
    params.action,
    params.actorEmail,
    provider,
    transactionId,
    amount,
    creditsGranted,
    statusBefore,
    statusAfter,
    notes,
    previousHash,
    entryHash,
    now,
  );

  return entryHash;
}

console.log("==================================================");
console.log("🤖 Memulai Bot WhatsApp Dokumenku AI...");
console.log(`📱 Nomor Admin Tujuan: ${ADMIN_PHONE}`);
console.log("==================================================");

// Initialize WhatsApp Web Client with Persistent Session
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.resolve(__dirname, "..", ".wwebjs_auth"),
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

let isClientReady = false;
let isAuthenticated = false;
let latestQrDataUrl = null;
let latestQrString = null;

client.on("qr", async (qr) => {
  latestQrString = qr;
  try {
    latestQrDataUrl = await QRCode.toDataURL(qr, {
      margin: 2,
      scale: 8,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    console.error("Gagal membuat QR data URL:", err);
  }

  console.log("\n📲 SCAN QR CODE BERIKUT DENGAN WHATSAPP ANDA:\n");
  qrcode.generate(qr, { small: true });
  console.log("\n💡 Buka Dashboard Admin (http://localhost:3000/admin) untuk scan QR code secara visual langsung di browser.\n");
});

client.on("ready", () => {
  isClientReady = true;
  isAuthenticated = true;
  latestQrDataUrl = null;
  latestQrString = null;
  console.log("==================================================");
  console.log("✅ BOT WHATSAPP DOKUMENKU AI AKTIF & SIAP MENERIMA PERINTAH!");
  console.log(`📱 Terhubung dengan Admin: ${ADMIN_PHONE}`);
  console.log("==================================================");
});

client.on("authenticated", () => {
  isAuthenticated = true;
  latestQrDataUrl = null;
  latestQrString = null;
  console.log("🔐 Sesi WhatsApp berhasil diautentikasi.");
});

client.on("auth_failure", (msg) => {
  isAuthenticated = false;
  console.error("❌ Autentikasi WhatsApp gagal:", msg);
});

client.on("disconnected", (reason) => {
  isClientReady = false;
  isAuthenticated = false;
  latestQrDataUrl = null;
  latestQrString = null;
  console.warn("⚠️ WhatsApp terputus:", reason);
});

// Helper: Extract Invoice ID from Text
function extractInvoiceId(text) {
  if (!text) return null;
  const match = text.match(/INV-[A-Z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

// Helper: Approve Order and Credit User (Strict Atomic Transaction)
function approveInvoice(identifier) {
  const now = new Date().toISOString();
  const tokenHash = hashApprovalToken(identifier);

  try {
    db.exec("BEGIN IMMEDIATE");

    const order = db
      .prepare(
        "SELECT * FROM orders WHERE UPPER(id) = UPPER(?) OR (approval_token_hash IS NOT NULL AND approval_token_hash = ?)",
      )
      .get(identifier, tokenHash);

    if (!order) {
      db.exec("ROLLBACK");
      insertAuditLogEntry(db, {
        orderId: identifier,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail: `whatsapp:${ADMIN_PHONE}`,
        provider: "QRIS",
        transactionId: "N/A",
        amount: 0,
        creditsGranted: 0,
        statusBefore: "NOT_FOUND",
        statusAfter: "NOT_FOUND",
        notes: "Tagihan dengan ID/Token tidak ditemukan via WA.",
        createdAt: now,
      });
      return { ok: false, error: `Tagihan/Token '${identifier}' tidak ditemukan di database.` };
    }

    // Check token expiry & attempts if matched by token
    const isTokenMatch = order.approval_token_hash && safeCompare(order.approval_token_hash, tokenHash);
    if (isTokenMatch) {
      if (order.approval_token_expires_at && new Date(order.approval_token_expires_at).getTime() < Date.now()) {
        db.exec("ROLLBACK");
        insertAuditLogEntry(db, {
          orderId: order.id,
          action: "PAYMENT_APPROVAL_DENIED",
          actorEmail: `whatsapp:${ADMIN_PHONE}`,
          provider: order.payment_method || "QRIS",
          transactionId: order.ocr_transaction_id || "N/A",
          amount: order.amount,
          creditsGranted: 0,
          statusBefore: order.status,
          statusAfter: order.status,
          notes: "TOKEN_EXPIRED via WA: Token approval telah kedaluwarsa (berlaku 10 menit).",
          createdAt: now,
        });
        return { ok: false, error: "TOKEN_EXPIRED: Token approval telah kedaluwarsa (10 menit)." };
      }

      if ((order.approval_token_attempts || 0) >= 5) {
        db.exec("ROLLBACK");
        db.prepare("UPDATE orders SET approval_token_hash = NULL WHERE id = ?").run(order.id);
        insertAuditLogEntry(db, {
          orderId: order.id,
          action: "PAYMENT_APPROVAL_DENIED",
          actorEmail: `whatsapp:${ADMIN_PHONE}`,
          provider: order.payment_method || "QRIS",
          transactionId: order.ocr_transaction_id || "N/A",
          amount: order.amount,
          creditsGranted: 0,
          statusBefore: order.status,
          statusAfter: order.status,
          notes: "TOKEN_LOCKED via WA: Token terkunci karena melebihi batas percobaan (5x).",
          createdAt: now,
        });
        return { ok: false, error: "TOKEN_LOCKED: Token terkunci karena melebihi batas percobaan (5x)." };
      }
    }

    if (order.status !== "PENDING_REVIEW") {
      db.exec("ROLLBACK");
      insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail: `whatsapp:${ADMIN_PHONE}`,
        provider: order.payment_method || "QRIS",
        transactionId: order.ocr_transaction_id || "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: order.status,
        notes: `INVALID_PAYMENT_STATE via WA: Percobaan approval ditolak karena status saat ini '${order.status}' (bukan PENDING_REVIEW).`,
        createdAt: now,
      });

      if (order.status === "PAID" || order.status === "paid") {
        return { ok: false, error: `Tagihan '${order.id}' sudah berstatus LUNAS (PAID) sebelumnya (ALREADY_PROCESSED).` };
      }
      return { ok: false, error: `Tagihan '${order.id}' tidak dapat disetujui karena berstatus '${order.status}'. Hanya tagihan PENDING_REVIEW yang dapat disetujui.` };
    }

    const provider = order.payment_method || "QRIS";
    const externalTrxId = order.ocr_transaction_id || `WA-ACC-${order.id}-${Date.now()}`;

    // 1. Guard against duplicate external transaction IDs
    if (externalTrxId && !externalTrxId.startsWith("WA-ACC-")) {
      const existingTrx = db
        .prepare("SELECT order_id FROM verified_transactions WHERE provider = ? AND transaction_id = ?")
        .get(provider, externalTrxId);

      if (existingTrx && existingTrx.order_id !== order.id) {
        db.exec("ROLLBACK");
        insertAuditLogEntry(db, {
          orderId: order.id,
          action: "PAYMENT_APPROVAL_DENIED",
          actorEmail: `whatsapp:${ADMIN_PHONE}`,
          provider,
          transactionId: externalTrxId,
          amount: order.amount,
          creditsGranted: 0,
          statusBefore: order.status,
          statusAfter: order.status,
          notes: `DUPLICATE_TRANSACTION via WA: ID Transaksi ${externalTrxId} sudah pernah digunakan pada invoice ${existingTrx.order_id}.`,
          createdAt: now,
        });
        return {
          ok: false,
          error: `ID Transaksi ${externalTrxId} sudah pernah digunakan pada invoice ${existingTrx.order_id}.`,
        };
      }
    }

    // 2. Lock & Update order status to PAID (STRICT: WHERE status = 'PENDING_REVIEW')
    const updateOrderRes = db
      .prepare(`
        UPDATE orders 
        SET status = 'PAID', 
            ai_status = 'approved_by_admin',
            ai_analysis = 'Disetujui langsung oleh Admin via WhatsApp (ACC)',
            approval_token = NULL,
            approval_token_hash = NULL,
            paid_at = ?
        WHERE id = ? AND status = 'PENDING_REVIEW'
      `)
      .run(now, order.id);

    if (updateOrderRes.changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, error: "Konflik transaksi: Tagihan telah diubah oleh proses lain." };
    }

    // 3. Record verified transaction unique record
    try {
      db.prepare(`
        INSERT INTO verified_transactions (provider, transaction_id, order_id, amount, user_email, verified_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(provider, externalTrxId, order.id, order.amount, order.user_email, `whatsapp:${ADMIN_PHONE}`, now);
    } catch {
      db.exec("ROLLBACK");
      return {
        ok: false,
        error: `ID Transaksi ${externalTrxId} terdeteksi duplikat pada level database constraint (verified_transactions).`,
      };
    }

    // 4. Add credits to user
    const creditBonus = order.credits || 100;
    const updateRes = db
      .prepare("UPDATE users SET credits = credits + ?, updated_at = ? WHERE email = ?")
      .run(creditBonus, now, order.user_email);

    if (updateRes.changes !== 1) {
      db.prepare(
        "INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES (?, 'oauth', 'oauth', ?, ?, ?)",
      ).run(order.user_email, creditBonus, now, now);
    }

    // 5. Insert credit ledger entry (UNIQUE(order_id, type))
    try {
      db.prepare(`
        INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, ?, ?, ?, 'PAYMENT_PURCHASE', ?)
      `).run(
        order.user_email,
        creditBonus,
        `Pembelian ${order.plan_name} (${order.id}) • ACC via WhatsApp Admin`,
        order.id,
        now,
      );
    } catch {
      db.exec("ROLLBACK");
      return {
        ok: false,
        error: `Invoice ${order.id} sudah pernah memberikan kredit sebelumnya (double-grant prevented).`,
      };
    }

    // 6. Insert tamper-evident HMAC-SHA256 audit log
    insertAuditLogEntry(db, {
      orderId: order.id,
      action: "PAYMENT_APPROVED",
      actorEmail: `whatsapp:${ADMIN_PHONE}`,
      provider,
      transactionId: externalTrxId,
      amount: order.amount,
      creditsGranted: creditBonus,
      statusBefore: "PENDING_REVIEW",
      statusAfter: "PAID",
      notes: `Approval via WhatsApp chat 'ACC' dari Admin (${ADMIN_PHONE})`,
      createdAt: now,
    });

    db.exec("COMMIT");

    return { ok: true, order, creditBonus };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    return { ok: false, error: err.message || "Gagal memproses approval di database." };
  }
}

// Helper: Cancel Order
function cancelInvoice(identifier) {
  const now = new Date().toISOString();
  const order = db
    .prepare(
      "SELECT * FROM orders WHERE UPPER(id) = UPPER(?) OR (approval_token IS NOT NULL AND UPPER(approval_token) = UPPER(?))",
    )
    .get(identifier, identifier);

  if (!order) {
    return { ok: false, error: `Invoice/Token '${identifier}' tidak ditemukan di database.` };
  }

  if (order.status === "PAID" || order.status === "paid") {
    return { ok: false, error: `Invoice '${order.id}' tidak dapat dibatalkan karena sudah LUNAS.` };
  }

  db.prepare(`
    UPDATE orders 
    SET status = 'REJECTED', 
        ai_status = 'rejected_by_admin',
        approval_token = NULL,
        ai_analysis = 'Ditolak/Dibatalkan oleh Admin via WhatsApp'
    WHERE id = ?
  `).run(order.id);

  // Insert immutable audit log
  db.prepare(`
    INSERT INTO audit_logs (
      order_id, action, actor_email, provider, transaction_id, 
      amount, credits_granted, status_before, status_after, notes, created_at
    ) VALUES (?, 'PAYMENT_REJECTED', ?, ?, 'N/A', ?, 0, ?, 'REJECTED', ?, ?)
  `).run(
    order.id,
    `whatsapp:${ADMIN_PHONE}`,
    order.payment_method || "QRIS",
    order.amount,
    order.status,
    `Penolakan via WhatsApp chat 'TOLAK' dari Admin (${ADMIN_PHONE})`,
    now,
  );

  return { ok: true, order };
}

// Handle Incoming WhatsApp Messages
client.on("message_create", async (msg) => {
  // Strict Sender Whitelist Check: Only accept commands from Admin phone number
  const isFromAdmin =
    msg.from.includes(ADMIN_PHONE) ||
    msg.to.includes(ADMIN_PHONE) ||
    (msg.author && msg.author.includes(ADMIN_PHONE));

  if (!isFromAdmin) return;

  const body = (msg.body || "").trim();
  const lower = body.toLowerCase();

  // ── Handle 'ACC' Command ───────────────────────────────────────
  if (lower === "acc" || lower.startsWith("acc ") || lower.startsWith("acc\n")) {
    let targetIdentifier = extractInvoiceId(body);

    // If not invoice pattern, check if a 6-char token was provided: "ACC 7K3P9A"
    if (!targetIdentifier) {
      const parts = body.split(/\s+/);
      if (parts.length >= 2 && parts[1].length >= 4) {
        targetIdentifier = parts[1].toUpperCase();
      }
    }

    // If still empty, check quoted/reply message for Invoice ID or Token
    if (!targetIdentifier && msg.hasQuotedMsg) {
      const quoted = await msg.getQuotedMessage().catch(() => null);
      if (quoted && quoted.body) {
        targetIdentifier = extractInvoiceId(quoted.body);
        if (!targetIdentifier) {
          const tokenMatch = quoted.body.match(/Token Approval:\s*([A-Za-z0-9]+)/i);
          if (tokenMatch) targetIdentifier = tokenMatch[1].toUpperCase();
        }
      }
    }

    if (!targetIdentifier) {
      await msg.reply("⚠️ Harap cantumkan No. Invoice atau Token Approval untuk mencegah salah sasaran.\n\nContoh:\n• *ACC INV-XXXXX*\n• *ACC 7K3P9A*\n• Atau *Reply langsung* pesan notifikasi bukti transfer.");
      return;
    }

    const result = approveInvoice(targetIdentifier);
    if (result.ok) {
      const replyText = `✅ *[PEMBAYARAN DISETUJUI / ACC]*
━━━━━━━━━━━━━━━━━━━━━━━
📄 *No. Invoice:* ${result.order.id}
👤 *Pengguna:* ${result.order.user_email}
💰 *Nominal:* Rp ${result.order.amount.toLocaleString("id-ID")}
💎 *Kredit Ditambahkan:* +${result.creditBonus} Kredit Pro Studio
🟢 *Status:* LUNAS (PAID)

Saldo kredit pengguna telah aktif seketika di website Dokumenku AI!`;
      await msg.reply(replyText);
      console.log(`✅ [WA BOT] Invoice ${result.order.id} approved via WhatsApp.`);
    } else {
      await msg.reply(`⚠️ Gagal ACC: ${result.error}`);
    }
    return;
  }

  // ── Handle 'TOLAK' / 'BATAL' Command ────────────────────────────
  if (lower === "tolak" || lower.startsWith("tolak ") || lower === "batal" || lower.startsWith("batal ")) {
    let targetInv = extractInvoiceId(body);

    if (!targetInv && msg.hasQuotedMsg) {
      const quoted = await msg.getQuotedMessage().catch(() => null);
      if (quoted && quoted.body) {
        targetInv = extractInvoiceId(quoted.body);
      }
    }

    if (!targetInv) {
      const latestPending = db
        .prepare("SELECT id FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
        .get();
      if (latestPending) {
        targetInv = latestPending.id;
      }
    }

    if (!targetInv) {
      await msg.reply("⚠️ Tidak ada tagihan pending yang ditemukan untuk ditolak.");
      return;
    }

    const result = cancelInvoice(targetInv);
    if (result.ok) {
      await msg.reply(`❌ *[TAGIHAN DITOLAK / DIBATALKAN]*\n━━━━━━━━━━━━━━━━━━━━━━━\nNo. Invoice: *${result.order.id}*\nPengguna: *${result.order.user_email}*\nStatus: *DIBATALKAN*`);
      console.log(`❌ [WA BOT] Invoice ${result.order.id} cancelled via WhatsApp.`);
    } else {
      await msg.reply(`⚠️ Gagal membatalkan: ${result.error}`);
    }
    return;
  }

  // ── Handle 'LIST' Command ───────────────────────────────────────
  if (lower === "list" || lower === "pending" || lower === "cek") {
    const pendingOrders = db
      .prepare("SELECT id, user_email, amount, credits, created_at, ocr_merchant, ocr_amount FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10")
      .all();

    if (pendingOrders.length === 0) {
      await msg.reply("✨ Saat ini tidak ada tagihan yang menunggu verifikasi (0 pending).");
      return;
    }

    let listText = `📋 *DAFTAR TAGIHAN MENUNGGU VERIFIKASI (${pendingOrders.length})*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
    pendingOrders.forEach((ord, i) => {
      listText += `\n*${i + 1}. ${ord.id}*\n• User: ${ord.user_email}\n• Tagihan: Rp ${ord.amount.toLocaleString("id-ID")} (+${ord.credits} Kredit)\n• OCR Terbaca: ${ord.ocr_merchant || "-"} (${ord.ocr_amount || "-"})\n• Balas: *ACC ${ord.id}* atau *TOLAK ${ord.id}*\n`;
    });

    await msg.reply(listText);
    return;
  }

  // ── Handle 'HELP' / 'BANTUAN' Command ───────────────────────────
  if (lower === "help" || lower === "bantuan" || lower === "menu") {
    const helpText = `🤖 *PANDUAN BOT WHATSAPP DOKUMENKU AI*
━━━━━━━━━━━━━━━━━━━━━━━
Gunakan perintah berikut:

• *ACC* ➔ Setujui invoice pending terakhir & tambah +100 kredit
• *ACC <INV-ID>* ➔ Setujui invoice tertentu (contoh: \`ACC INV-12345\`)
• *TOLAK* ➔ Batalkan invoice pending terakhir
• *TOLAK <INV-ID>* ➔ Batalkan invoice tertentu
• *LIST* ➔ Lihat daftar tagihan yang sedang pending
• *HELP* ➔ Tampilkan menu panduan ini

_Anda juga bisa langsung me-reply pesan notifikasi struk dengan mengetik *ACC*._`;
    await msg.reply(helpText);
  }
});

async function sendToAdmin(content, options) {
  let targetChatId = ADMIN_CHAT_ID;
  try {
    return await client.sendMessage(targetChatId, content, options);
  } catch (err) {
    if (client.info?.wid?._serialized && client.info.wid._serialized !== targetChatId) {
      console.log(`[WA BOT] Fallback kirim ke wid akun: ${client.info.wid._serialized}`);
      return await client.sendMessage(client.info.wid._serialized, content, options);
    }
    throw err;
  }
}

// ── HTTP Dispatcher Server (Receives New Proof Uploads from Next.js API) ─
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && req.url === "/notify-payment") {
    let bodyData = "";
    req.on("data", (chunk) => {
      bodyData += chunk;
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(bodyData || "{}");
        const { orderId, userEmail, amount, approvalToken, proofImage, ocrData } = payload;

        if (!orderId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing orderId" }));
          return;
        }

        if (!isClientReady) {
          console.warn(`[WA BOT] WhatsApp belum ready saat mengirim notifikasi invoice ${orderId}`);
          res.writeHead(503);
          res.end(JSON.stringify({ ok: false, error: "WhatsApp Web Bot belum ready. Silakan scan QR code di terminal." }));
          return;
        }

        const ocr = ocrData || {};
        const caption = `🔔 *BUKTI PEMBAYARAN QRIS BARU MASUK!*
━━━━━━━━━━━━━━━━━━━━━━━
📄 *No. Invoice:* \`${orderId}\`
👤 *Pengguna:* ${userEmail}
💰 *Nominal Tagihan:* Rp ${(amount || 49000).toLocaleString("id-ID")}
💎 *Paket:* Pro Studio (+100 Kredit)
🔑 *Token Approval:* *${approvalToken || "N/A"}*

📋 *HASIL DETEKSI OCR DOKUMENKU AI:*
• *Merchant:* ${ocr.merchant_name || "-"}
• *NMID:* ${ocr.nmid || "-"}
• *Nominal Struk:* ${ocr.amount || "-"}
• *ID Transaksi:* ${ocr.transaction_id || "-"}
• *Tanggal:* ${ocr.transaction_date || "-"}
• *Provider:* ${ocr.payment_provider || "QRIS"}
• *Status Struk:* ${ocr.displayed_payment_status || "Berhasil"}

━━━━━━━━━━━━━━━━━━━━━━━
👉 *CARA APPROVE / TAMBAH KREDIT:*
Balas chat ini dengan mengetik:
*ACC ${orderId}* atau *ACC ${approvalToken || "TOKEN"}*

👉 *CARA TOLAK:*
Balas chat ini dengan mengetik:
*TOLAK ${orderId}*`;

        // Send Media if proofImage exists
        if (proofImage && proofImage.startsWith("data:image/")) {
          const base64Data = proofImage.replace(/^data:image\/\w+;base64,/, "");
          const mimeMatch = proofImage.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const media = new MessageMedia(mimeType, base64Data, `struk-${orderId}.jpg`);

          await sendToAdmin(media, { caption });
        } else {
          await sendToAdmin(caption);
        }

        console.log(`📩 [WA BOT] Notifikasi invoice ${orderId} berhasil dikirim ke ${ADMIN_PHONE}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: "Notifikasi WA berhasil dikirim" }));
      } catch (err) {
        console.error("❌ [WA BOT] Gagal mengirim pesan WA:", err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message || "Failed to send WhatsApp message" }));
      }
    });
  } else if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ready: isClientReady,
        authenticated: isAuthenticated,
        adminPhone: ADMIN_PHONE,
        qrCode: latestQrDataUrl,
        qrString: latestQrString,
        timestamp: new Date().toISOString(),
      }),
    );
  } else if (req.method === "POST" && req.url === "/test-ping") {
    try {
      if (!isClientReady) {
        res.writeHead(503);
        res.end(JSON.stringify({ ok: false, error: "Bot belum terhubung ke WhatsApp." }));
        return;
      }
      await sendToAdmin(
        `🔔 *TEST KONEKSI BOT WHATSAPP DOKUMENKU AI*\n━━━━━━━━━━━━━━━━━━━━━━━\nKoneksi WhatsApp Bot ke Dashboard Admin berfungsi normal dan siap menerima approval pembayaran!\n\nWaktu: ${new Date().toLocaleString("id-ID")}`,
      );
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, message: "Pesan tes berhasil dikirim ke WhatsApp Admin." }));
    } catch (err) {
      console.error("❌ [WA BOT] Gagal mengirim test ping:", err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Gagal mengirim pesan tes." }));
    }
  } else if (req.method === "POST" && req.url === "/logout") {
    try {
      if (client) {
        await client.logout().catch(() => null);
      }
      isClientReady = false;
      isAuthenticated = false;
      latestQrDataUrl = null;
      latestQrString = null;
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, message: "Sesi WhatsApp berhasil diputus. Silakan scan QR code baru." }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message || "Gagal memutus sesi WhatsApp." }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(`🌐 Dispatcher HTTP Server aktif di http://127.0.0.1:${HTTP_PORT}`);
});

// Start WhatsApp Client
client.initialize();
