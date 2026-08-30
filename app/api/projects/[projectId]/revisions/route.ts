import { NextRequest, NextResponse } from "next/server";

import { getDatabase, saveProjectDocumentRevision } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBlueprintContract, validateBlueprintConsistency } from "@/lib/blueprint-quality";
import type { FileName, GeneratedFiles } from "@/lib/types";

const DOCUMENTS: Array<{ fileName: FileName; documentType: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT" }> = [
  { fileName: "PRD.md", documentType: "PRD" },
  { fileName: "TECH-STACK.md", documentType: "TECH_SPEC" },
  { fileName: "UI-UX.md", documentType: "UI_UX" },
  { fileName: "SCHEMA.md", documentType: "AI_CONTEXT" },
];

type RevisionInput = {
  fileName: FileName;
  content: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });

  const { projectId } = await params;
  if (!projectId || projectId.length > 160) {
    return NextResponse.json({ error: "ID proyek tidak valid." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const scope = body?.scope === "related" ? "related" : body?.scope === "document" ? "document" : null;
  const revisions = Array.isArray(body?.revisions) ? body.revisions : [];
  if (instruction.length < 3 || instruction.length > 10_000 || !scope || !revisions.length || revisions.length > DOCUMENTS.length) {
    return NextResponse.json({ error: "Data revisi tidak lengkap atau tidak valid." }, { status: 400 });
  }

  const requested = new Map<FileName, RevisionInput>();
  for (const value of revisions) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json({ error: "Format perubahan dokumen tidak valid." }, { status: 400 });
    }
    const record = value as Record<string, unknown>;
    const fileName = record.fileName;
    const content = record.content;
    if (!DOCUMENTS.some((document) => document.fileName === fileName) || typeof content !== "string" || !content.trim() || content.length > 120_000) {
      return NextResponse.json({ error: "Isi perubahan dokumen tidak valid." }, { status: 400 });
    }
    if (requested.has(fileName as FileName)) {
      return NextResponse.json({ error: "Dokumen revisi tidak boleh duplikat." }, { status: 400 });
    }
    requested.set(fileName as FileName, { fileName: fileName as FileName, content: content.trim() });
  }
  if (scope === "document" && requested.size !== 1) {
    return NextResponse.json({ error: "Cakupan satu dokumen hanya dapat menyimpan satu dokumen revisi." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const currentResult = await db.execute({
      sql: `SELECT document_type, file_name, content FROM project_documents
        WHERE LOWER(user_email) = LOWER(?) AND project_id = ?`,
      args: [user.email, projectId],
    });
    const files = {} as GeneratedFiles;
    for (const document of DOCUMENTS) {
      const current = currentResult.rows.find((row) => row.document_type === document.documentType);
      if (!current || typeof current.content !== "string") {
        return NextResponse.json({ error: "Dokumen proyek belum lengkap; revisi belum dapat disimpan." }, { status: 409 });
      }
      files[document.fileName] = current.content as string;
    }
    for (const [fileName, revision] of requested) files[fileName] = revision.content;

    const blueprintResult = await db.execute({
      sql: `SELECT content FROM project_blueprints
        WHERE LOWER(user_email) = LOWER(?) AND project_id = ? LIMIT 1`,
      args: [user.email, projectId],
    });
    const blueprintRaw = blueprintResult.rows[0]?.content;
    if (typeof blueprintRaw !== "string") {
      return NextResponse.json({ error: "Blueprint proyek tidak tersedia untuk memeriksa revisi." }, { status: 409 });
    }

    const report = validateBlueprintConsistency(parseBlueprintContract(blueprintRaw), files);
    if (!report.passed) {
      return NextResponse.json({
        error: "Revisi belum lolos Quality Gate lintas dokumen. Tinjau perubahan atau pilih sinkronkan dokumen terkait.",
        data: { report },
      }, { status: 422 });
    }

    const documentsToSave = DOCUMENTS
      .filter((document) => requested.has(document.fileName))
      .map((document) => ({
        documentType: document.documentType,
        fileName: document.fileName,
        content: files[document.fileName],
      }));
    const result = await saveProjectDocumentRevision(db, {
      userEmail: user.email,
      projectId,
      instruction,
      scope,
      documents: documentsToSave,
    });

    return NextResponse.json({ data: { saved: result.saved, report } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Revisi tidak dapat disimpan.",
    }, { status: 500 });
  }
}
