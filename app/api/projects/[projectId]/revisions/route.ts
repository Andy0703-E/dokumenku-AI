import { NextRequest, NextResponse } from "next/server";

/**
 * Revisi AI has been retired. Keep an explicit response so older browser tabs
 * cannot silently use it as an uncharged text-generation route.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Revisi AI sudah tidak tersedia. Gunakan Edit Manual untuk memperbarui dokumen." },
    { status: 410 },
  );
}
