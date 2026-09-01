import type { FileName } from "./types";

export type RevisionScope = "document" | "related";

export type RevisionImpact = {
  affectedFiles: FileName[];
  reasons: string[];
};

export type RevisionPreview = {
  revisionRequestId: string;
  instruction: string;
  scope: RevisionScope;
  impact: RevisionImpact;
  before: Partial<Record<FileName, string>>;
  after: Partial<Record<FileName, string>>;
};

export type DiffLine = {
  kind: "added" | "removed" | "unchanged";
  value: string;
};

const ALL_FILES: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];

function addRelated(target: FileName, files: Set<FileName>, candidates: FileName[]) {
  for (const file of candidates) {
    if (file !== target) files.add(file);
  }
}

/**
 * Gives the user a conservative, explainable impact estimate before any
 * document is revised. It deliberately has no side effects and is shared by
 * the modal and the revision workflow.
 */
export function analyzeRevisionImpact(target: FileName, instruction: string): RevisionImpact {
  const text = instruction.toLocaleLowerCase("id-ID");
  const affected = new Set<FileName>();
  const reasons: string[] = [];

  if (/\b(?:role|peran|permission|izin|super\s*admin|admin)\b/i.test(text)) {
    addRelated(target, affected, ALL_FILES);
    reasons.push("role atau permission memengaruhi requirement, arsitektur, pengalaman pengguna, dan akses data");
  }
  if (/\b(?:status|lifecycle|siklus|approval|persetujuan|verifikasi|flag)\b/i.test(text)) {
    addRelated(target, affected, ["PRD.md", "UI-UX.md", "SCHEMA.md"]);
    reasons.push("status atau flag perlu konsisten pada alur produk, UI, dan penyimpanan data");
  }
  if (/\b(?:fitur|feature|mvp|acceptance|kriteria penerimaan|user story)\b/i.test(text)) {
    addRelated(target, affected, ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"]);
    reasons.push("perubahan fitur dapat memengaruhi scope, implementasi, UI, dan data");
  }
  if (/\b(?:api|endpoint|integrasi|webhook|payment|pembayaran|deployment|security|keamanan|auth|oauth|jwt)\b/i.test(text)) {
    addRelated(target, affected, ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"]);
    reasons.push("perubahan teknis atau integrasi dapat memengaruhi kebutuhan produk, UI, dan schema");
  }
  if (/\b(?:entitas|entity|tabel|table|relasi|foreign key)\b/i.test(text)) {
    addRelated(target, affected, ["PRD.md", "UI-UX.md"]);
    reasons.push("struktur data baru dapat memengaruhi requirement dan alur pengguna");
  }
  if (/\b(?:halaman|page|wireframe|responsive|responsif|user flow|alur pengguna|design system)\b/i.test(text)) {
    addRelated(target, affected, ["PRD.md", "TECH-STACK.md"]);
    reasons.push("perubahan pengalaman pengguna dapat memengaruhi requirement dan kebutuhan implementasi");
  }

  return {
    affectedFiles: ALL_FILES.filter((file) => affected.has(file)),
    reasons,
  };
}

/** A compact line diff suitable for a revision confirmation modal. */
export function createLineDiff(before: string, after: string, context = 2): DiffLine[] {
  const previous = before.split("\n");
  const next = after.split("\n");
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;

  let previousEnd = previous.length - 1;
  let nextEnd = next.length - 1;
  while (previousEnd >= start && nextEnd >= start && previous[previousEnd] === next[nextEnd]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  if (start === previous.length && start === next.length) return [{ kind: "unchanged", value: "Tidak ada perubahan." }];

  const leadingContext = previous.slice(Math.max(0, start - context), start);
  const removed = previous.slice(start, previousEnd + 1);
  const added = next.slice(start, nextEnd + 1);
  const trailingContext = next.slice(nextEnd + 1, Math.min(next.length, nextEnd + 1 + context));

  return [
    ...leadingContext.map((value) => ({ kind: "unchanged" as const, value })),
    ...removed.map((value) => ({ kind: "removed" as const, value })),
    ...added.map((value) => ({ kind: "added" as const, value })),
    ...trailingContext.map((value) => ({ kind: "unchanged" as const, value })),
  ];
}
