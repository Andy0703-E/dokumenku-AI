import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

import { getDatabase, getProjectDocuments } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { generateVibeCoderPrompt, hasAllDocumentsReady } from "@/lib/vibecoder-prompt";
import type { GeneratedFiles } from "@/lib/types";

export const runtime = "nodejs";

function zipName(projectName: string): string {
  const clean = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return `${clean || "dokumenku-ai-documents"}.zip`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });

  const { projectId } = await params;
  if (!projectId || projectId.length > 160) {
    return NextResponse.json({ error: "ID proyek tidak valid." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    // Documents are read only from the signed-in owner's server-side records;
    // the browser never supplies ZIP content or another user's project data.
    const project = await getProjectDocuments(db, user.email, projectId);
    if (project.documents.length !== 4 || project.documents.some((document) => !document.content.trim())) {
      return NextResponse.json({ error: "Empat dokumen proyek belum tersedia untuk diunduh." }, { status: 409 });
    }

    const zip = new JSZip();
    const files: GeneratedFiles = {
      "PRD.md": "",
      "TECH-STACK.md": "",
      "UI-UX.md": "",
      "SCHEMA.md": "",
    };
    for (const document of project.documents) {
      zip.file(document.fileName, document.content);
      if (document.fileName in files) {
        files[document.fileName as keyof GeneratedFiles] = document.content;
      }
    }
    if (hasAllDocumentsReady(files)) {
      zip.file("VIBECODER-PROMPT.md", generateVibeCoderPrompt(files, project.projectName));
    }
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const filename = zipName(project.projectName);

    return new NextResponse(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "ZIP dokumen tidak dapat dibuat." }, { status: 500 });
  }
}
