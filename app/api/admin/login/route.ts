import { NextRequest, NextResponse } from "next/server";
import { getDatabase, verifyAdminInDatabase } from "@/db";
import { setSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email: rawEmail, password } = (await request.json().catch(() => ({}))) as unknown as {
    email?: string;
    password?: string;
  };

  const email = rawEmail?.trim().toLowerCase();
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email dan kata sandi administrator wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const db = await getDatabase();
    const verification = await verifyAdminInDatabase(db, email, password);

    if (!verification.ok || !verification.email) {
      return NextResponse.json(
        { error: verification.error || "Autentikasi administrator gagal." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true, email: verification.email });
    setSession(response, verification.email, "admin");
    return response;
  } catch (error) {
    console.error("[ADMIN LOGIN] Error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada sistem saat memverifikasi login admin." },
      { status: 500 }
    );
  }
}
