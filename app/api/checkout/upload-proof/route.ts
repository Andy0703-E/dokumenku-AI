import { NextResponse } from "next/server";

/**
 * Payment receipts are no longer uploaded to this website. Customers send the
 * image themselves to the administrator's WhatsApp, then the administrator
 * reviews the payment before granting any credits.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unggah bukti ke website sudah dinonaktifkan. Kirim foto bukti pembayaran langsung melalui WhatsApp admin.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
