import { NextResponse } from "next/server";

/**
 * Payment approvals are intentionally handled only in the authenticated admin
 * dashboard. This retired endpoint prevents an external WhatsApp gateway from
 * approving, rejecting, or changing payment records.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Webhook WhatsApp untuk pembayaran sudah dinonaktifkan. Gunakan dashboard admin." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Webhook WhatsApp untuk pembayaran sudah dinonaktifkan. Gunakan dashboard admin." },
    { status: 410 },
  );
}
