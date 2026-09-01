import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, getProjectDocuments } from "@/db";
import { parseBlueprintContract, validateBlueprintConsistency } from "@/lib/blueprint-quality";
import type { FileName, GeneratedFiles } from "@/lib/types";

const DOCUMENT_TYPE_TO_FILE_NAME: Record<string, FileName> = {
  PRD: "PRD.md",
  TECH_SPEC: "TECH-STACK.md",
  UI_UX: "UI-UX.md",
  AI_CONTEXT: "SCHEMA.md",
};

export async function GET(
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
    const data = await getProjectDocuments(db, user.email, projectId);
    // The contract is returned only for this signed-in user's project and is
    // used as private context for AI revisions. It is never rendered in the UI.
    const blueprintResult = await db.execute({
      sql: `SELECT content FROM project_blueprints
        WHERE LOWER(user_email) = LOWER(?) AND project_id = ? LIMIT 1`,
      args: [user.email, projectId],
    });
    const blueprint = blueprintResult.rows[0]?.content;
    let qualityReport = data.qualityReport;
    let qualityStatus = data.qualityStatus;
    if (typeof blueprint === "string" && data.documents.length === 4) {
      try {
        const files = {} as GeneratedFiles;
        for (const document of data.documents) {
          const fileName = DOCUMENT_TYPE_TO_FILE_NAME[document.documentType];
          if (fileName) files[fileName] = document.content;
        }
        const report = validateBlueprintConsistency(parseBlueprintContract(blueprint), files);
        // Recompute on read so previously saved, stale reports do not keep
        // showing notes already resolved by an updated deterministic checker.
        qualityReport = JSON.stringify(report);
        qualityStatus = report.passed ? "PASSED" : "FAILED";
      } catch {
        // Keep the stored report available when a legacy blueprint cannot be parsed.
      }
    }
    return NextResponse.json({
      data: {
        ...data,
        qualityReport,
        qualityStatus,
        blueprint: typeof blueprint === "string" ? blueprint : null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Gagal memuat dokumen proyek." }, { status: 500 });
  }
}

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
    await db.execute({
      sql: "DELETE FROM project_blueprints WHERE user_email = ? AND project_id = ?",
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
