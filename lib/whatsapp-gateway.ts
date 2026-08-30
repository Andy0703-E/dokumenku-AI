/**
 * WhatsApp Gateway Outbound Integration
 * Supports Fonnte or Meta WhatsApp Cloud API for 100% Serverless execution.
 */

export interface WhatsAppNotificationParams {
  orderId: string;
  userEmail: string;
  amount: number;
  approvalToken: string;
  proofImage?: string | null;
  ocrData?: {
    merchant_name?: string;
    amount?: string | number;
    transaction_id?: string;
    transaction_date?: string;
    payment_provider?: string;
    nmid?: string;
    displayed_payment_status?: string;
    notes?: string;
  };
}

export function normalizePhoneNumber(raw?: string | null): string {
  if (!raw) return "6285754494990";
  let cleaned = String(raw).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("08")) {
    cleaned = "628" + cleaned.slice(2);
  } else if (cleaned.startsWith("8")) {
    cleaned = "628" + cleaned.slice(1);
  }
  return cleaned;
}

export function getAdminPhone(): string {
  return normalizePhoneNumber(
    process.env.ADMIN_WA_PHONE || process.env.WA_ADMIN_PHONE || "6285754494990"
  );
}

export function getGatewayToken(): string | null {
  return (
    process.env.FONNTE_TOKEN ||
    process.env.WA_GATEWAY_TOKEN ||
    process.env.WHATSAPP_TOKEN ||
    process.env.WA_API_KEY ||
    null
  );
}

export function getGatewayUrl(): string {
  return (
    process.env.WA_GATEWAY_URL ||
    process.env.FONNTE_API_URL ||
    "https://api.fonnte.com/send"
  );
}

/**
 * Sends a WhatsApp message to the admin via WhatsApp Gateway API.
 */
export async function sendWhatsAppMessage(
  targetPhone: string,
  message: string,
  mediaUrlOrBase64?: string | null
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const token = getGatewayToken();
  const normalizedTarget = normalizePhoneNumber(targetPhone);
  const endpoint = getGatewayUrl();

  if (!token) {
    console.warn(
      `[WA GATEWAY] FONNTE_TOKEN belum dikonfigurasi di environment. Notifikasi ke ${normalizedTarget} di-skip.`
    );
    return {
      ok: false,
      error: "FONNTE_TOKEN belum disetel di .env.local atau Vercel Environment Variables.",
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const payload: Record<string, string> = {
      target: normalizedTarget,
      message,
    };

    // If there is an image URL
    if (mediaUrlOrBase64 && mediaUrlOrBase64.startsWith("http")) {
      payload.url = mediaUrlOrBase64;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status === false) {
      console.error("[WA GATEWAY] Gagal mengirim pesan:", data);
      return {
        ok: false,
        error: data.reason || data.message || `Gateway returned HTTP ${response.status}`,
      };
    }

    console.log(`[WA GATEWAY] Pesan berhasil dikirim ke ${normalizedTarget}`);
    return { ok: true, messageId: data.id || data.message_id || "OK" };
  } catch (error) {
    console.error("[WA GATEWAY] Network error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error ke WhatsApp Gateway",
    };
  }
}

/**
 * Sends formatted receipt notification with approval token to Admin WhatsApp.
 */
export async function notifyAdminNewProofUpload(
  params: WhatsAppNotificationParams
): Promise<{ ok: boolean; error?: string }> {
  const adminPhone = getAdminPhone();
  const ocr = params.ocrData || {};

  const message = `🔔 *BUKTI PEMBAYARAN QRIS BARU MASUK!*
━━━━━━━━━━━━━━━━━━━━━━━
📄 *No. Invoice:* \`${params.orderId}\`
👤 *Pengguna:* ${params.userEmail}
💰 *Nominal Tagihan:* Rp ${(params.amount || 20000).toLocaleString("id-ID")}
💎 *Paket:* Pro Studio (+100 Kredit)
🔑 *Token Approval:* *${params.approvalToken}*

📋 *HASIL DETEKSI DATA OCR:*
• *Merchant:* ${ocr.merchant_name || "-"}
• *NMID:* ${ocr.nmid || "-"}
• *Nominal Struk:* ${ocr.amount || "-"}
• *ID Transaksi:* ${ocr.transaction_id || "-"}
• *Tanggal:* ${ocr.transaction_date || "-"}
• *Provider:* ${ocr.payment_provider || "QRIS"}
• *Status Struk:* ${ocr.displayed_payment_status || "Berhasil"}
• *Keterangan OCR:* ${ocr.notes || "Menunggu pembacaan provider"}

━━━━━━━━━━━━━━━━━━━━━━━
👉 *CARA APPROVE / TAMBAH KREDIT:*
Balas chat ini dengan mengetik:
*ACC ${params.orderId}*

Token dapat digunakan sebagai opsi tambahan bila diperlukan:
*ACC ${params.orderId} ${params.approvalToken}*

👉 *CARA TOLAK:*
Balas chat ini dengan mengetik:
*TOLAK ${params.orderId}*`;

  return await sendWhatsAppMessage(adminPhone, message);
}
