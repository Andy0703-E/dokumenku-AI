import { notifyAdminNewProofUpload, getGatewayToken } from "./whatsapp-gateway";

const WA_DISPATCHER_LOCAL_URL = "http://127.0.0.1:5050/notify-payment";

export interface WaPaymentNotificationPayload {
  orderId: string;
  userEmail: string;
  amount: number;
  approvalToken?: string;
  proofImage?: string;
  ocrData?: {
    merchant_name?: string;
    nmid?: string;
    amount?: string;
    transaction_id?: string;
    transaction_date?: string;
    displayed_payment_status?: string;
    payment_provider?: string;
    notes?: string;
  };
}

/**
 * Dispatches WhatsApp notification to Admin.
 * Automatically prioritizes Cloud Gateway API (Fonnte/Webhook for Vercel),
 * and falls back to local dispatcher if running locally.
 */
export async function notifyAdminViaWhatsApp(
  payload: WaPaymentNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  // 1. If Cloud Gateway Token is configured, use Cloud Gateway (100% Serverless Vercel)
  if (getGatewayToken()) {
    return await notifyAdminNewProofUpload({
      orderId: payload.orderId,
      userEmail: payload.userEmail,
      amount: payload.amount,
      approvalToken: payload.approvalToken || "N/A",
      proofImage: payload.proofImage,
      ocrData: payload.ocrData,
    });
  }

  // 2. Otherwise, attempt local dispatcher (for local offline dev)
  try {
    const res = await fetch(WA_DISPATCHER_LOCAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { ok: false, error: errJson.error || "Gagal mengirim notifikasi ke bot WhatsApp." };
    }

    return { ok: true };
  } catch (err) {
    console.warn("⚠️ [WA Notifier] Gateway token belum disetel & bot lokal offline:", err);
    return { ok: false, error: "WhatsApp Gateway / Bot belum aktif." };
  }
}
