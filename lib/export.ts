import JSZip from "jszip";
import type { GeneratedFiles, FileName } from "./types";
import { generateVibeCoderPrompt, hasAllDocumentsReady } from "./vibecoder-prompt";
import { findDocumentOutputIsolationIssues } from "./blueprint-quality";

function getZipFileName(projectName?: string): string {
  const cleanedName = projectName
    ?.trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .replace(/\.zip$/i, "")
    .slice(0, 120);

  return `${cleanedName || "dokumenku-ai-documents"}.zip`;
}

export async function downloadAllAsZip(files: GeneratedFiles, projectName?: string) {
  const isolationIssues = findDocumentOutputIsolationIssues(files);
  if (isolationIssues.length) {
    throw new Error("ZIP ditahan: setiap dokumen harus memiliki satu judul H1 yang tepat sebelum diekspor.");
  }

  const zip = new JSZip();

  for (const name of Object.keys(files) as FileName[]) {
    if (files[name]) zip.file(name, files[name]);
  }

  if (hasAllDocumentsReady(files)) {
    zip.file("VIBECODER-PROMPT.md", generateVibeCoderPrompt(files, projectName));
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getZipFileName(projectName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
