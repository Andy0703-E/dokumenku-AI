"use client";

import { useRef } from "react";
import {
  Clipboard,
  Download,
  FileText,
  Package,
  Layers,
  CheckCircle2,
  FileCode2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { FILES, downloadMarkdown } from "@/lib/stream-parser";
import { downloadAllAsZip } from "@/lib/export";
import { generateVibeCoderPrompt, hasAllDocumentsReady } from "@/lib/vibecoder-prompt";
import type { GeneratedFiles, FileName } from "@/lib/types";

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

type DocumentViewerProps = {
  files: GeneratedFiles;
  activeFile: FileName;
  isGenerating: boolean;
  hasResult: boolean;
  progress: number;
  onActiveFileChange: (file: FileName) => void;
};

export default function DocumentViewer({
  files,
  activeFile,
  isGenerating,
  hasResult,
  progress,
  onActiveFileChange,
}: DocumentViewerProps) {
  const paperRefs = useRef<Partial<Record<FileName, HTMLDivElement | null>>>({});

  async function copyText(content: string, label: string) {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    toast.success(`${label} berhasil disalin ke clipboard`);
  }

  async function handleCopyVibeCoderPrompt() {
    if (!hasAllDocumentsReady(files)) {
      toast.error("Seluruh 4 dokumen harus selesai dibuat sebelum menyalin prompt.");
      return;
    }
    const promptText = generateVibeCoderPrompt(files);
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("Prompt berhasil disalin! Siap ditempel ke Claude Code, Cursor, Windsurf, atau Copilot.");
    } catch {
      toast.error("Gagal menyalin prompt ke clipboard.");
    }
  }

  function handleDownloadZip() {
    const hasContent = FILES.some(({ name }) => files[name].trim().length > 0);
    if (!hasContent) {
      toast.error("Belum ada dokumen untuk diunduh.");
      return;
    }
    downloadAllAsZip(files);
    toast.success("File ZIP 4 dokumen berhasil diunduh.");
  }

  return (
    <section className="studio-output" aria-labelledby="output-heading">
      {/* ── Output Header Bar ──────────────────────────────────── */}
      <div className="output-header-bar">
        <div className="panel-title-row" style={{ marginBottom: 0 }}>
          <span className="step-num-badge amber">02</span>
          <div>
            <span className="eyebrow-pill" style={{ padding: "2px 8px", fontSize: "0.65rem", marginBottom: "4px" }}>
              OUTPUT BLUEPRINT
            </span>
            <h2 id="output-heading" className="panel-title-text">
              Empat Dokumen Proyek
            </h2>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-primary"
            style={{
              minHeight: "36px",
              padding: "0 14px",
              fontSize: "0.78rem",
              background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              fontWeight: 650,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              cursor: (hasResult || hasAllDocumentsReady(files)) ? "pointer" : "not-allowed",
              opacity: (hasResult || hasAllDocumentsReady(files)) ? 1 : 0.5,
              boxShadow: (hasResult || hasAllDocumentsReady(files)) ? "0 2px 8px rgba(13, 148, 136, 0.3)" : "none",
            }}
            onClick={handleCopyVibeCoderPrompt}
            disabled={!hasResult && !hasAllDocumentsReady(files)}
            title="Salin master prompt yang menggabungkan 4 dokumen ini untuk Cursor, Claude Code, Windsurf, Copilot, dll."
          >
            <Copy size={15} /> Salin Prompt
          </button>

          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: "36px", padding: "0 14px", fontSize: "0.78rem" }}
            onClick={handleDownloadZip}
            disabled={!hasResult && !FILES.some(({ name }) => files[name].trim().length > 0)}
            title="Unduh seluruh dokumen dalam 1 file ZIP"
          >
            <Package size={15} /> Unduh Semua (.ZIP)
          </button>

          <div
            className={`output-status-pill ${
              isGenerating ? "streaming" : hasResult ? "ready" : "idle"
            }`}
          >
            {hasResult ? (
              <>
                <CheckCircle2 size={13} /> DOKUMEN LENGKAP
              </>
            ) : isGenerating ? (
              <>
                <span className="status-dot amber" /> SEDANG MENULIS...
              </>
            ) : (
              <>
                <Layers size={13} /> MENUNGGU BRIEF
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Document Tabs System ───────────────────────────────── */}
      <Tabs
        value={activeFile}
        onValueChange={(value) => onActiveFileChange(value as FileName)}
        className="doc-tabs-wrap"
      >
        <TabsList className="doc-tabs-bar">
          {FILES.map((file) => {
            const hasContent = Boolean(files[file.name]?.trim().length > 0);
            return (
              <TabsTrigger key={file.name} value={file.name} className="doc-tab-item">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <strong>{file.short}</strong>
                  {hasContent && (
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "var(--green)",
                      }}
                    />
                  )}
                </div>
                <small>{file.description}</small>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {FILES.map((file) => {
          const content = files[file.name];
          const isCurrentActive = activeFile === file.name;
          const isFileStreaming = isGenerating && isCurrentActive;

          return (
            <TabsContent key={file.name} value={file.name} className="doc-pane">
              {/* Sheet Toolbar */}
              <div className="doc-pane-toolbar">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 750, fontSize: "0.88rem", color: "var(--teal-dark)" }}>
                  <FileText size={16} />
                  <span>{file.name}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: "32px", padding: "0 10px", fontSize: "0.74rem" }}
                    onClick={() => copyText(content, file.name)}
                    disabled={!content}
                  >
                    <Clipboard size={14} /> Salin
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: "32px", padding: "0 10px", fontSize: "0.74rem" }}
                    onClick={() => downloadMarkdown(file.name, content)}
                    disabled={!content}
                  >
                    <Download size={14} /> Unduh .MD
                  </button>
                </div>
              </div>

              {/* Sheet Body */}
              <div
                className="paper-viewer"
                ref={(element) => {
                  paperRefs.current[file.name] = element;
                }}
              >
                {content ? (
                  isFileStreaming ? (
                    <pre className="stream-code">{content}</pre>
                  ) : (
                    <MarkdownContent content={content} />
                  )
                ) : (
                  <div className="empty-doc-view">
                    <div className="empty-doc-icon">
                      <FileCode2 size={28} />
                    </div>
                    <strong style={{ display: "block", fontSize: "1.1rem", fontFamily: "Georgia, serif", color: "var(--ink-primary)", marginBottom: "6px" }}>
                      Dokumen {file.name}
                    </strong>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-muted)", maxWidth: "340px" }}>
                      Dokumen ini akan disusun secara otomatis dan ditampilkan di sini saat brief proyek mulai diproses.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
}
