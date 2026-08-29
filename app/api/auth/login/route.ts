import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email: rawEmail, password } = (await request.json()) as unknown as {
    email?: string;
    password?: string;
  };
  const email = rawEmail?.trim().toLowerCase() ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email dan kata sandi wajib diisi." }, { status: 400 });
  }

  // 1. Check if login matches Admin Credentials
  const adminCreds = (await import("@/lib/auth")).getAdminCredentials();
  if (adminCreds && email === adminCreds.email && password.trim() === adminCreds.password.trim()) {
    try {
      const db = await getDatabase();
      const existing = (await db.execute({ sql: "SELECT email FROM users WHERE email = ?", args: [email] })).rows[0];
      const now = new Date().toISOString();
      if (!existing) {
        const { hash, salt } = (await import("@/lib/auth")).hashPassword(adminCreds.password);
        await db.execute({
          sql: "INSERT INTO users (email, password_hash, password_salt, available_credits, created_at, updated_at) VALUES (?, ?, ?, 9999, ?, ?)",
          args: [email, hash, salt, now, now],
        });
      }
    } catch {
      // Ignore if error syncing admin to db
    }

    const response = NextResponse.json({ ok: true, isAdmin: true });
    (await import("@/lib/auth")).setSession(response, email, "admin");
    return response;
  }

  // 2. Regular User Login
  try {
    const db = await getDatabase();
    const accountResult = await db.execute({
      sql: "SELECT email, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?",
      args: [email],
    });
    const account = accountResult.rows[0] as unknown as { email: string; passwordHash: string; passwordSalt: string } | undefined;

    if (!account || !(await import("@/lib/auth")).verifyPassword(password, account.passwordHash, account.passwordSalt)) {
      return NextResponse.json({ error: "Email atau kata sandi salah." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, isAdmin: false });
    (await import("@/lib/auth")).setSession(response, account.email, "user");
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Akun tidak dapat dimasuki." },
      { status: 503 },
    );
  }
}
