"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EMPTY_FILES } from "@/lib/stream-parser";
import {
  consumeProviderStream,
  getPayloadError,
  getProviderError,
  requestDocumentStream,
} from "@/lib/api-helpers";
import { getDocumentSystemPrompt, getRevisionSystemPrompt } from "@/lib/prompts";
import type { FileName, GeneratedFiles } from "@/lib/types";

const DOCUMENT_STEPS: FileName[] = [
  "PRD.md",
  "TECH-STACK.md",
  "UI-UX.md",
  "SCHEMA.md",
];

function minimumCharacters(file: FileName): number {
  return file === "PRD.md" ? 3_000 : 2_200;
}

export function useDocumentGenerator(
  projectId: string = "default_project",
  projectName: string = "",
) {
  const [files, setFiles] = useState<GeneratedFiles>(EMPTY_FILES);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeFile, setActiveFile] = useState<FileName>("PRD.md");
  const [reasoningContent, setReasoningContent] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  const hasResult = DOCUMENT_STEPS.every((file) => files[file].trim().length > 0);

  // Load existing documents from DB when opening a project
  useEffect(() => {
    if (!projectId || projectId === "default_project") return;

    let cancelled = false;
    setIsLoadingDocs(true);

    fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const data = json.data;
        if (data?.documents?.length > 0) {
          const loaded = { ...EMPTY_FILES };
          const docTypeToFileName: Record<string, FileName> = {
            PRD: "PRD.md",
            TECH_SPEC: "TECH-STACK.md",
            UI_UX: "UI-UX.md",
            AI_CONTEXT: "SCHEMA.md",
          };
          for (const doc of data.documents) {
            const fileName = docTypeToFileName[doc.documentType];
            if (fileName && doc.content) {
              loaded[fileName] = doc.content;
            }
          }
          setFiles(loaded);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingDocs(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  const updateFileContent = useCallback((fileName: FileName, content: string) => {
    setFiles((prev) => ({ ...prev, [fileName]: content }));
  }, []);

  const reviseDocument = useCallback(
    async (fileToRevise: FileName, revisionComment: string, selectedModel: string) => {
      const existingContent = files[fileToRevise];
      if (!existingContent || !existingContent.trim()) {
        toast.error("Belum ada konten dokumen untuk direvisi.");
        return false;
      }
      const comment = revisionComment.trim();
      if (comment.length < 3) {
        toast.error("Tuliskan instruksi atau komentar revisi terlebih dahulu.");
        return false;
      }
      if (!selectedModel.trim()) {
        toast.error("Pilih model AI terlebih dahulu.");
        return false;
      }

      setIsGenerating(true);
      setReasoningContent("");
      setActiveFile(fileToRevise);
      toast.info(`Sedang merevisi ${fileToRevise} dengan AI...`);

      try {
        const response = await requestDocumentStream(
          `rev-${crypto.randomUUID()}`,
          selectedModel,
          `Komentar / Instruksi Revisi Pengguna:\n\n${comment}`,
          getRevisionSystemPrompt(fileToRevise, existingContent, comment),
          8_000,
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            getProviderError(response.status, "Dokumenku AI", getPayloadError(payload), selectedModel),
          );
        }

        let revisedOutput = "";
        let reasoningText = "";
        await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
          if (reasoning) reasoningText += reasoning;
          if (content) revisedOutput += content;
          setFiles((prev) => ({ ...prev, [fileToRevise]: revisedOutput }));
          setReasoningContent(reasoningText);
        });

        if (revisedOutput.trim().length > 0) {
          setFiles((prev) => ({ ...prev, [fileToRevise]: revisedOutput.trim() }));
          toast.success(`Dokumen ${fileToRevise} berhasil direvisi oleh AI!`);
          return true;
        } else {
          throw new Error("Hasil revisi kosong, silakan coba lagi.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal merevisi dokumen.");
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [files],
  );

  const generateFromPrompt = useCallback(
    async (projectPrompt: string, selectedModel: string) => {
      const brief = projectPrompt.trim();
      if (brief.length < 10) {
        toast.error("Tulis brief proyek yang lebih lengkap terlebih dahulu.");
        return false;
      }
      if (!selectedModel.trim()) {
        toast.error("Pilih model AI terlebih dahulu.");
        return false;
      }

      setIsGenerating(true);
      setReasoningContent("");
      setProgress(5);
      setLastError(null);

      let generationId: string | null = null;
      let completed = false;

      try {
        const startResponse = await fetch("/api/generations/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedModel, prompt: brief, projectId, projectName }),
        });
        const startPayload = (await startResponse.json()) as unknown as { data?: { generationId?: string }; generationId?: string; error?: string };
        const resolvedGenerationId = startPayload.data?.generationId ?? startPayload.generationId;
        if (!startResponse.ok || !resolvedGenerationId) {
          const errorMsg = startPayload.error || (startPayload as Record<string, unknown>).message || "Pembuatan dokumen tidak dapat dimulai.";
          throw new Error(typeof errorMsg === "string" ? errorMsg : "Pembuatan dokumen tidak dapat dimulai.");
        }
        generationId = resolvedGenerationId;

        let currentFiles: GeneratedFiles = { ...EMPTY_FILES };
        setFiles(currentFiles);
        setActiveFile("PRD.md");

        for (let i = 0; i < DOCUMENT_STEPS.length; i++) {
          const step = DOCUMENT_STEPS[i];
          const requiredLength = minimumCharacters(step);
          setActiveFile(step);
          setProgress(10 + i * 22);

          let output = "";
          for (let attempt = 0; attempt < 2; attempt++) {
            const retryInstruction = attempt
              ? `\n\nPENTING: Respons sebelumnya belum cukup lengkap. Tulis ulang ${step} secara konkret, terstruktur, dan minimal ${requiredLength} karakter. Jangan berhenti sebelum seluruh bagian penting selesai.`
              : "";

            const response = await requestDocumentStream(
              generationId,
              selectedModel,
              `Brief proyek pengguna:\n\n${brief}`,
              `${getDocumentSystemPrompt(step)}${retryInstruction}`,
              8_000,
            );

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(
                getProviderError(response.status, "Dokumenku AI", getPayloadError(payload), selectedModel),
              );
            }

            let attemptOutput = "";
            let reasoningText = "";
            await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
              if (reasoning) reasoningText += reasoning;
              if (content) attemptOutput += content;
              setFiles((prev) => ({ ...prev, [step]: attemptOutput }));
              setReasoningContent(reasoningText);
            });

            output = attemptOutput;
            if (output.trim().length >= requiredLength || attempt === 1) break;
          }

          const completedOutput = output.trim();
          if (completedOutput.length < requiredLength) {
            throw new Error(`Dokumenku AI belum dapat menghasilkan ${step} yang cukup lengkap. Coba lagi.`);
          }

          currentFiles = { ...currentFiles, [step]: completedOutput };
          setFiles(currentFiles);

          const docType = step.replace(".md", "") as "PRD" | "TECH-STACK" | "UI-UX" | "SCHEMA";
          const docTypeMap: Record<string, string> = { "PRD": "PRD", "TECH-STACK": "TECH_SPEC", "UI-UX": "UI_UX", "SCHEMA": "AI_CONTEXT" };
          await fetch("/api/generations/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              generationId,
              completed: true,
              documentType: docTypeMap[docType] || "PRD",
              fileName: step,
              content: completedOutput,
              projectId,
              projectName,
              selectedModel,
            }),
          }).catch(() => {});
        }

        completed = true;
        setProgress(100);

        await fetch("/api/generations/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationId, completed: true, documentType: "ALL_DONE", fileName: "ALL_DONE", content: "completed" }),
        }).catch(() => {});

        toast.success("Empat dokumen proyek berhasil dibuat lengkap!");
        return true;
      } catch (error) {
        setProgress(0);
        const msg = error instanceof Error ? error.message : "Terjadi kesalahan saat pembuatan dokumen.";
        setLastError(msg);
        toast.error(msg);
        return false;
      } finally {
        setIsGenerating(false);
        if (generationId && !completed) {
          await fetch("/api/generations/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generationId, completed: false, failureReason: "generation_failed" }),
          }).catch(() => {});
        }
      }
    },
    [],
  );

  const resetAll = useCallback(() => {
    setFiles({ ...EMPTY_FILES });
    setIsGenerating(false);
    setProgress(0);
    setActiveFile("PRD.md");
    setReasoningContent("");
  }, []);

  return {
    files,
    isGenerating,
    isLoadingDocs,
    progress,
    activeFile,
    hasResult,
    reasoningContent,
    lastError,
    setActiveFile,
    updateFileContent,
    reviseDocument,
    generateFromPrompt,
    resetAll,
  };
}
