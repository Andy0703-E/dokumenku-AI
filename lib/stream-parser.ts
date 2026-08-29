import type { FileName, GeneratedFiles } from "./types";

export const EMPTY_FILES: GeneratedFiles = {
  "PRD.md": "",
  "TECH-STACK.md": "",
  "UI-UX.md": "",
  "SCHEMA.md": "",
};

export const FILES: Array<{ name: FileName; short: string; description: string }> = [
  { name: "PRD.md", short: "PRD", description: "Produk & kebutuhan" },
  { name: "TECH-STACK.md", short: "Stack", description: "Teknologi & arsitektur" },
  { name: "UI-UX.md", short: "UI/UX", description: "Antarmuka & alur" },
  { name: "SCHEMA.md", short: "Schema", description: "Data & relasi" },
];

export function downloadMarkdown(filename: FileName, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
