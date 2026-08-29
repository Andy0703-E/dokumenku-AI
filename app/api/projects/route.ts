import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, getUserProjects } from "@/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const projects = await getUserProjects(db, user.email);
    return NextResponse.json({ data: projects });
  } catch {
    return NextResponse.json({ error: "Gagal memuat daftar proyek." }, { status: 500 });
  }
}
