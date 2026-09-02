import { NextRequest, NextResponse } from "next/server";
import { getDatabase, verifyAdminInDatabase } from "@/db";
import { setSession, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email: rawEmail, password } = (await request.json()) as unknown as {
    email?: string;
    password?: string;
  };
  const email = rawEmail?.trim().toLowerCase() ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email dan kata sandi wajib diisi." }, { status: 400 });
  }

  try {
    const db = await getDatabase();

    // Admin access is always verified against the active database record.
    // Environment credentials may bootstrap the first admin, but never bypass
    // deactivation or a password change stored in the database.
    const admin = await verifyAdminInDatabase(db, email, password);
    if (admin.ok && admin.email) {
      const response = NextResponse.json({ ok: true, isAdmin: true });
      setSession(response, admin.email, "admin");
      return response;
    }

    // Regular user login.
    const accountResult = await db.execute({
      sql: "SELECT email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?",
      args: [email],
    });
    const account = accountResult.rows[0] as unknown as { email: string; passwordHash: string; passwordSalt: string } | undefined;

    if (!account || !verifyPassword(password, account.passwordHash, account.passwordSalt)) {
      return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, isAdmin: false });
    setSession(response, account.email, "user");
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Akun tidak dapat dimasuki." },
      { status: 503 },
    );
  }
}
