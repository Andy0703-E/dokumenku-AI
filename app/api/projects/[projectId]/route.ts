import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "ID proyek tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const result = await db.execute({
      sql: "DELETE FROM project_documents WHERE user_email = ? AND project_id = ?",
      args: [user.email, projectId],
    });

    return NextResponse.json({
      data: {
        deleted: (result.rowsAffected ?? 0) > 0,
        projectId,
        message: (result.rowsAffected ?? 0) > 0
          ? "Proyek berhasil dihapus."
          : "Proyek tidak ditemukan.",
      },
    });
  } catch {
    return NextResponse.json({ error: "Gagal menghapus proyek." }, { status: 500 });
  }
}
