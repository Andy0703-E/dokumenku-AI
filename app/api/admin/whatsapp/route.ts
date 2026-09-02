import { NextResponse } from "next/server";

/** WhatsApp/Fonnte is retired. Admin work, including payment review, is done in the dashboard. */
export async function GET() {
  return NextResponse.json(
    { error: "Integrasi WhatsApp sudah dinonaktifkan. Gunakan dashboard admin." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Integrasi WhatsApp sudah dinonaktifkan. Gunakan dashboard admin." },
    { status: 410 },
  );
}
