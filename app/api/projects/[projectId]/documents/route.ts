import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, insertAuditLogEntry } from "@/db";

const TYPE_MAP: Record<string, { documentType: string; fileName: string }> = {
  prd: { documentType: "PRD", fileName: "PRD.md" },
  "tech-stack": { documentType: "TECH_SPEC", fileName: "TECH-STACK.md" },
  "ui-ux": { documentType: "UI_UX", fileName: "UI-UX.md" },
  schema: { documentType: "AI_CONTEXT", fileName: "SCHEMA.md" },
};

export async function PATCH(
  request: NextRequest,
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

  let body: { type?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const { type, content } = body;
  if (!type || !TYPE_MAP[type]) {
    return NextResponse.json(
      { error: "Tipe dokumen tidak valid. Gunakan: prd, tech-stack, ui-ux, schema." },
      { status: 400 },
    );
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Konten tidak boleh kosong." }, { status: 400 });
  }

  const { documentType, fileName } = TYPE_MAP[type];
  const now = new Date().toISOString();

  try {
    const db = await getDatabase();

    // Verify ownership
    const existing = await db.execute({
      sql: `SELECT id FROM project_documents
        WHERE LOWER(user_email) = LOWER(?) AND project_id = ? AND document_type = ?`,
      args: [user.email, projectId, documentType],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    // Upsert with source = 'manual_edit'
    await db.execute({
      sql: `INSERT INTO project_documents (user_email, project_id, project_name, selected_model, document_type, file_name, content, source, status, created_at, updated_at)
        VALUES (?, ?, '', '', ?, ?, ?, 'manual_edit', 'COMPLETED', ?, ?)
        ON CONFLICT(user_email, project_id, document_type) DO UPDATE SET
          file_name = excluded.file_name,
          content = excluded.content,
          source = 'manual_edit',
          updated_at = excluded.updated_at`,
      args: [user.email, projectId, documentType, fileName, content, now, now],
    });

    // Audit trail
    await insertAuditLogEntry(db, {
      orderId: "",
      action: "MANUAL_EDIT",
      actorEmail: user.email,
      notes: `project=${projectId} doc=${documentType} len=${content.length}`,
    });

    return NextResponse.json({ ok: true, savedAt: now });
  } catch {
    return NextResponse.json({ error: "Gagal menyimpan dokumen." }, { status: 500 });
  }
}
