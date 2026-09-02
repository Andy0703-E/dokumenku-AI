import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { hashPassword, setSession } from "@/lib/auth";

function validate(email: string, password: string): string | null {
  if (!email.includes("@") || email.length > 254) return "Masukkan email yang valid.";
  if (password.length < 8) return "Kata sandi minimal 8 karakter.";
  return null;
}

export async function POST(request: NextRequest) {
  const { email: rawEmail, password, deviceFingerprint } = await request.json() as unknown as { email?: string; password?: string; deviceFingerprint?: string };
  const email = rawEmail?.trim().toLowerCase() ?? "";
  const validationError = validate(email, password ?? "");
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const db = await getDatabase();

    if (deviceFingerprint && typeof deviceFingerprint === "string" && deviceFingerprint.length === 64) {
      const existingDevice = await db.execute({
        sql: "SELECT email FROM users WHERE device_fingerprint = ? LIMIT 1",
        args: [deviceFingerprint],
      });
      if (existingDevice.rows[0]) {
        const existingEmail = (existingDevice.rows[0] as unknown as { email: string }).email;
        return NextResponse.json({ error: `Perangkat ini sudah terdaftar dengan akun ${existingEmail}. Silakan masuk instead.` }, { status: 409 });
      }
    }

    const existsResult = await db.execute({ sql: "SELECT email FROM users WHERE email = ?", args: [email] });
    if (existsResult.rows[0]) return NextResponse.json({ error: "Email ini sudah terdaftar. Silakan masuk." }, { status: 409 });

    const { hash, salt } = hashPassword(password ?? "");
    const now = new Date().toISOString();
    // Free credits are opt-in. Leaving them enabled by default makes scripted
    // registrations a direct path to consuming the paid AI provider quota.
    const initialCredits = process.env.ALLOW_INITIAL_CREDITS === "true"
      ? Math.max(0, Math.min(100, Number.parseInt(process.env.INITIAL_CREDITS ?? "0", 10) || 0))
      : 0;
    const fp = deviceFingerprint && typeof deviceFingerprint === "string" && deviceFingerprint.length === 64 ? deviceFingerprint : null;
    await db.execute({
      sql: "INSERT INTO users (email, password_hash, password_salt, available_credits, device_fingerprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [email, hash, salt, initialCredits, fp, now, now],
    });
    if (initialCredits > 0) {
      await db.execute({
        sql: "INSERT INTO credit_transactions (user_email, amount, reason, created_at) VALUES (?, ?, 'Kredit awal akun baru', ?)",
        args: [email, initialCredits, now],
      });
    }

    const response = NextResponse.json({ ok: true }, { status: 201 });
    setSession(response, email, "user");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Akun tidak dapat dibuat." }, { status: 503 });
  }
}
