import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Lightweight session check for public pages and the support widget.
// It verifies the signed cookie only and deliberately does not query account history.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      email: user.email,
      role: user.role,
    },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
