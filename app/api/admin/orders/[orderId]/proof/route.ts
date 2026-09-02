import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "Akses terbatas untuk administrator." }, { status: 403 });
  }

  const { orderId } = await params;
  if (!orderId || orderId.length > 100) {
    return NextResponse.json({ error: "ID pesanan tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: "SELECT proof_image AS proofImage, proof_mime AS proofMime FROM orders WHERE id = ? LIMIT 1",
      args: [orderId],
    });
    const order = result.rows[0] as unknown as { proofImage?: string | null; proofMime?: string | null } | undefined;
    if (!order?.proofImage) {
      return NextResponse.json({ error: "Bukti pembayaran tidak ditemukan." }, { status: 404 });
    }

    const match = order.proofImage.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      return NextResponse.json({ error: "Bukti pembayaran tidak dapat dibaca." }, { status: 422 });
    }

    const image = Buffer.from(match[2], "base64");
    return new NextResponse(image, {
      headers: {
        "Content-Type": order.proofMime || match[1].toLowerCase(),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Bukti pembayaran tidak dapat dimuat." }, { status: 503 });
  }
}
