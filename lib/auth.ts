import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const SESSION_COOKIE = "dokumenku_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionRole = "user" | "admin";

type SessionPayload = {
  email: string;
  role: SessionRole;
  expiresAt: number;
};

function sessionSecret(): string {
  const configured = process.env.APP_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "dokumenku-local-development-session-secret";
  throw new Error("APP_SESSION_SECRET belum dikonfigurasi.");
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeSession(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature || !safeEqual(sign(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.email || !["user", "admin"].includes(payload.role) || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const session = await getCurrentSession();
  return session && ["user", "admin"].includes(session.role) ? session : null;
}

export async function getCurrentAdmin(): Promise<SessionPayload | null> {
  const session = await getCurrentSession();
  return session?.role === "admin" ? session : null;
}

export function setSession(response: NextResponse, email: string, role: SessionRole) {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    role,
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
  };
  const encodedPayload = encodePayload(payload);
  response.cookies.set(SESSION_COOKIE, `${encodedPayload}.${sign(encodedPayload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64).toString("base64url");
  return safeEqual(candidate, hash);
}

export function getAdminCredentials(): { email: string; password: string } | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  return email && password ? { email, password } : null;
}
