import JSZip from "jszip";
import type { GeneratedFiles, FileName } from "./types";

export async function downloadAllAsZip(files: GeneratedFiles) {
  const zip = new JSZip();

  for (const name of Object.keys(files) as FileName[]) {
    if (files[name]) zip.file(name, files[name]);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "dokumenku-ai-documents.zip";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
