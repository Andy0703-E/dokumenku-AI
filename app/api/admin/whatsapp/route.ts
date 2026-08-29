import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getGatewayToken,
  getAdminPhone,
  sendWhatsAppMessage,
} from "@/lib/whatsapp-gateway";

const WA_BOT_PORT = process.env.WA_BOT_PORT ? parseInt(process.env.WA_BOT_PORT, 10) : 5050;
const BOT_URL = `http://127.0.0.1:${WA_BOT_PORT}`;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Akses terbatas untuk administrator." }, { status: 403 });
  }

  const gatewayToken = getGatewayToken();
  const adminPhone = getAdminPhone();
  const origin = request.headers.get("origin") || request.nextUrl.origin || "";
  const webhookUrl = `${origin}/api/webhooks/whatsapp`;

  // Mode 1: Cloud WhatsApp Gateway (Fonnte / Webhook for Vercel)
  if (gatewayToken) {
    return NextResponse.json({
      online: true,
      ready: true,
      authenticated: true,
      mode: "gateway",
      gatewayTokenConfigured: true,
      adminPhone,
      webhookUrl,
      qrCode: null,
      timestamp: new Date().toISOString(),
    });
  }

  // Mode 2: Local Puppeteer Bot (Fallback for local dev)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${BOT_URL}/status`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      return NextResponse.json({
        online: false,
        ready: false,
        authenticated: false,
        mode: "local_bot",
        gatewayTokenConfigured: false,
        adminPhone,
        webhookUrl,
        message: "Bot lokal belum berjalan. Atur FONNTE_TOKEN untuk cloud atau jalankan 'npm run bot:wa'.",
      });
    }

    const payload = await response.json();
    return NextResponse.json({
      online: true,
      ready: Boolean(payload.ready),
      authenticated: Boolean(payload.authenticated),
      mode: "local_bot",
      gatewayTokenConfigured: false,
      adminPhone: payload.adminPhone || adminPhone,
      webhookUrl,
      qrCode: payload.qrCode || null,
      timestamp: payload.timestamp,
    });
  } catch {
    return NextResponse.json({
      online: false,
      ready: false,
      authenticated: false,
      mode: "local_bot",
      gatewayTokenConfigured: false,
      adminPhone,
      webhookUrl,
      message: "Bot server tidak dapat dihubungi.",
    });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Akses terbatas untuk administrator." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as unknown as unknown as { action?: string };
    const action = body.action || "test-ping";
    const adminPhone = getAdminPhone();

    if (action === "test-ping") {
      // If using Cloud Gateway
      if (getGatewayToken()) {
        const testResult = await sendWhatsAppMessage(
          adminPhone,
          `🔔 *TEST NOTIFIKASI DOKUMENKU AI (GATEWAY)*\n━━━━━━━━━━━━━━━━━━━━━━━\nKoneksi WhatsApp Gateway ke Vercel Serverless berhasil aktif!\nTarget Admin: +${adminPhone}\nWaktu: ${new Date().toLocaleString("id-ID")}`
        );

        if (!testResult.ok) {
          return NextResponse.json(
            { error: testResult.error || "Gagal mengirim notifikasi via WhatsApp Gateway." },
            { status: 503 }
          );
        }

        return NextResponse.json({
          ok: true,
          message: `Pesan tes berhasil dikirim ke WhatsApp Admin (+${adminPhone}) via Gateway.`,
        });
      }

      // If using Local Puppeteer Bot
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${BOT_URL}/test-ping`, {
        method: "POST",
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        const errorData = (await response?.json().catch(() => ({}))) as unknown as unknown as { error?: string };
        return NextResponse.json(
          { error: errorData?.error || "Gagal mengirim notifikasi tes. Pastikan bot WhatsApp aktif." },
          { status: 503 }
        );
      }

      const resData = await response.json();
      return NextResponse.json({ ok: true, message: resData.message || "Pesan tes berhasil dikirim!" });
    }

    if (action === "logout") {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${BOT_URL}/logout`, {
        method: "POST",
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        const errorData = (await response?.json().catch(() => ({}))) as unknown as unknown as { error?: string };
        return NextResponse.json(
          { error: errorData?.error || "Gagal memutus sesi WhatsApp." },
          { status: 500 }
        );
      }

      const resData = await response.json();
      return NextResponse.json({ ok: true, message: resData.message || "Sesi berhasil diputus." });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Terjadi kesalahan pada bot WhatsApp." },
      { status: 500 }
    );
  }
}
