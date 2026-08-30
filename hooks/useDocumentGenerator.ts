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
import { getBlueprintRecoveryPrompt, getBlueprintSystemPrompt, getDocumentSystemPrompt, getRevisionSystemPrompt } from "@/lib/prompts";
import {
  analyzeRevisionImpact,
  type RevisionPreview,
  type RevisionScope,
} from "@/lib/revision-impact";
import {
  createFallbackBlueprint,
  documentsNeedingQualityFix,
  parseBlueprintContract,
  validateBlueprintContract,
  validateDocumentCompleteness,
  looksTruncated,
  getContinuationPrompt,
  type BlueprintContract,
  type QualityGateReport,
} from "@/lib/blueprint-quality";
import type { FileName, GeneratedFiles } from "@/lib/types";
import type { GenerationStage, ModelsUsedMap, ModelUsedRecord } from "@/lib/model-router";

const DOCUMENT_STEPS: FileName[] = [
  "PRD.md",
  "TECH-STACK.md",
  "UI-UX.md",
  "SCHEMA.md",
];

/** Map document file names to routing stages */
const FILE_TO_STAGE: Record<FileName, GenerationStage> = {
  "PRD.md": "prd",
  "TECH-STACK.md": "tech-stack",
  "UI-UX.md": "ui-ux",
  "SCHEMA.md": "schema",
};

function minimumCharacters(file: FileName): number {
  return file === "PRD.md" ? 3_000 : 2_200;
}

/** The always-auto model identifier used by the frontend */
export const AUTO_MODEL_ID = "auto";

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
  const [qualityState, setQualityState] = useState<"idle" | "building" | "validating" | "passed" | "failed">("idle");
  const [qualityReport, setQualityReport] = useState<QualityGateReport | null>(null);
  const [modelsUsed, setModelsUsed] = useState<ModelsUsedMap>({});

  const hasResult = qualityState === "passed" && DOCUMENT_STEPS.every((file) => files[file].trim().length > 0);

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
          setQualityState("passed");
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

  /**
   * Extract model-used metadata from a response header.
   */
  function extractModelUsedFromResponse(response: Response): ModelUsedRecord | null {
    const modelUsed = response.headers.get("X-Model-Used");
    if (!modelUsed) return null;
    const fallbackIndex = parseInt(response.headers.get("X-Model-Fallback-Index") || "0", 10);
    return {
      provider: "openrouter",
      model: modelUsed,
      attempts: fallbackIndex + 1,
      fallbackUsed: fallbackIndex > 0,
      finalStatus: fallbackIndex > 0 ? "fallback" : "success",
    };
  }

  const prepareRevision = useCallback(
    async (fileToRevise: FileName, revisionComment: string, scope: RevisionScope): Promise<RevisionPreview | null> => {
      const existingContent = files[fileToRevise];
      if (!existingContent || !existingContent.trim()) {
        toast.error("Belum ada konten dokumen untuk direvisi.");
        return null;
      }
      const comment = revisionComment.trim();
      if (comment.length < 3) {
        toast.error("Tuliskan instruksi atau komentar revisi terlebih dahulu.");
        return null;
      }

      const impact = analyzeRevisionImpact(fileToRevise, comment);
      const filesToRevise = scope === "related"
        ? DOCUMENT_STEPS.filter((file) => file === fileToRevise || impact.affectedFiles.includes(file))
        : [fileToRevise];

      setIsGenerating(true);
      setReasoningContent("");
      setActiveFile(fileToRevise);
      toast.info(`Sedang menyiapkan revisi ${filesToRevise.length > 1 ? `${filesToRevise.length} dokumen` : fileToRevise} dengan AI...`);

      const stage: GenerationStage = "revision";

      try {
        const before: Partial<Record<FileName, string>> = {};
        const after: Partial<Record<FileName, string>> = {};
        for (const file of filesToRevise) {
          const currentContent = files[file];
          const relatedFiles = scope === "related"
            ? Object.fromEntries(
                DOCUMENT_STEPS
                  .filter((relatedFile) => relatedFile !== file)
                  .map((relatedFile) => [relatedFile, files[relatedFile]]),
              )
            : undefined;
          const response = await requestDocumentStream(
            `rev-${crypto.randomUUID()}`,
            AUTO_MODEL_ID,
            `Komentar / Instruksi Revisi Pengguna:\n\n${comment}\n\nDokumen yang sedang direvisi: ${file}.`,
            getRevisionSystemPrompt(file, currentContent, comment, { scope, relatedFiles }),
            12_000,
            stage,
          );

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(
              getProviderError(response.status, "Dokumenku AI", getPayloadError(payload)),
            );
          }

          const revisionRecord = extractModelUsedFromResponse(response);
          if (revisionRecord) setModelsUsed((prev) => ({ ...prev, revision: revisionRecord }));

          let revisedOutput = "";
          let reasoningText = "";
          await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
            if (reasoning) reasoningText += reasoning;
            if (content) revisedOutput += content;
            setReasoningContent(reasoningText);
          });
          if (!revisedOutput.trim()) throw new Error(`Hasil revisi ${file} kosong, silakan coba lagi.`);

          before[file] = currentContent;
          after[file] = revisedOutput.trim();
        }

        return { instruction: comment, scope, impact, before, after };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal merevisi dokumen.");
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [files],
  );

  const applyRevisionPreview = useCallback(
    async (preview: RevisionPreview) => {
      const revisions = Object.entries(preview.after)
        .filter(([, content]) => typeof content === "string" && Boolean(content.trim()))
        .map(([fileName, content]) => ({ fileName, content: content as string }));
      if (!revisions.length) {
        toast.error("Tidak ada perubahan revisi untuk diterapkan.");
        return false;
      }

      setIsGenerating(true);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: preview.instruction,
            scope: preview.scope,
            revisions,
          }),
        });
        const payload = await response.json().catch(() => null) as {
          data?: { saved?: number; report?: QualityGateReport };
          error?: string;
        } | null;
        if (!response.ok) throw new Error(payload?.error || "Revisi belum dapat diterapkan.");

        setFiles((previous) => ({ ...previous, ...preview.after }));
        const report = payload?.data?.report;
        if (report) {
          setQualityReport(report);
          setQualityState(report.passed ? "passed" : "failed");
          if (report.warnings.length) toast.warning(`Revisi diterapkan dengan ${report.warnings.length} peringatan konsistensi.`);
        }
        toast.success(`${payload?.data?.saved || revisions.length} dokumen revisi telah disimpan.`);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Revisi tidak dapat diterapkan.");
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId],
  );

  const generateFromPrompt = useCallback(
    async (projectPrompt: string) => {
      const brief = projectPrompt.trim();
      if (brief.length < 10) {
        toast.error("Tulis brief proyek yang lebih lengkap terlebih dahulu.");
        return false;
      }

      setIsGenerating(true);
      setReasoningContent("");
      setProgress(5);
      setLastError(null);
      setQualityState("building");
      setQualityReport(null);
      setModelsUsed({});

      let generationId: string | null = null;
      let completed = false;

      try {
        const startResponse = await fetch("/api/generations/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedModel: AUTO_MODEL_ID, prompt: brief, projectId, projectName }),
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

        // ── Blueprint Generation ────────────────────────────────────────
        let blueprintOutput = "";
        let blueprint: BlueprintContract | null = null;
        const blueprintStage: GenerationStage = "blueprint";

        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await requestDocumentStream(
            generationId,
            AUTO_MODEL_ID,
            `Brief proyek pengguna:\n\n${brief}`,
            attempt === 0 ? getBlueprintSystemPrompt() : getBlueprintRecoveryPrompt(),
            attempt === 0 ? 6_000 : 3_000,
            blueprintStage,
          );
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(
              getProviderError(response.status, "Dokumenku AI", getPayloadError(payload)),
            );
          }

          // Track which model was used for blueprint
          if (attempt === 0) {
            const bpRecord = extractModelUsedFromResponse(response);
            if (bpRecord) {
              setModelsUsed((prev) => ({ ...prev, blueprint: bpRecord }));
            }
          }

          let attemptOutput = "";
          let reasoningText = "";
          await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
            if (reasoning) reasoningText += reasoning;
            if (content) attemptOutput += content;
            setReasoningContent(reasoningText);
          });
          blueprintOutput = attemptOutput.trim();
          try {
            const candidate = parseBlueprintContract(blueprintOutput);
            const contractFailures = validateBlueprintContract(candidate);
            if (contractFailures.length) throw new Error(contractFailures.join(" "));
            blueprint = candidate;
            break;
          } catch {
            // One compact JSON recovery is enough; after that a safe local contract is used.
          }
        }
        if (!blueprint) {
          blueprint = createFallbackBlueprint(brief);
          blueprintOutput = JSON.stringify(blueprint);
        }
        setProgress(10);

        // ── Document Generation Loop ────────────────────────────────────
        for (let i = 0; i < DOCUMENT_STEPS.length; i++) {
          const step = DOCUMENT_STEPS[i];
          const requiredLength = minimumCharacters(step);
          const stepStage: GenerationStage = FILE_TO_STAGE[step];
          setActiveFile(step);
          setProgress(10 + i * 22);

          let output = "";
          let finishReason: string | null = null;

          // Phase 1: Initial generation
          for (let attempt = 0; attempt < 2; attempt++) {
            const retryInstruction = attempt
              ? `\n\nPENTING: Respons sebelumnya belum cukup lengkap. Tulis ulang ${step} secara konkret, terstruktur, dan minimal ${requiredLength} karakter. Jangan berhenti sebelum seluruh bagian penting selesai.`
              : "";

            const response = await requestDocumentStream(
              generationId,
              AUTO_MODEL_ID,
              `Brief proyek pengguna:\n\n${brief}`,
              `${getDocumentSystemPrompt(step, blueprint)}${retryInstruction}`,
              16_000,
              stepStage,
            );

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(
                getProviderError(response.status, "Dokumenku AI", getPayloadError(payload)),
              );
            }

            if (attempt === 0) {
              const docRecord = extractModelUsedFromResponse(response);
              if (docRecord) {
                setModelsUsed((prev) => ({ ...prev, [stepStage]: docRecord }));
              }
            }

            let attemptOutput = "";
            let reasoningText = "";
            const streamResult = await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
              if (reasoning) reasoningText += reasoning;
              if (content) attemptOutput += content;
              setFiles((prev) => ({ ...prev, [step]: attemptOutput }));
              setReasoningContent(reasoningText);
            });

            finishReason = streamResult.finishReason;
            output = attemptOutput;

            // Check if output is truncated via finish_reason or content analysis
            const isTruncated = finishReason === "length" || looksTruncated(output);
            if (!isTruncated || attempt === 1) break;
          }

          // Phase 2: Auto-continue if truncated (cheaper than full regenerate)
          const completeness = validateDocumentCompleteness(step, output);
          if (!completeness.valid && completeness.code === "DOCUMENT_TRUNCATED" && output.trim().length > 500) {
            console.log(`[AutoContinue] ${step} detected truncated (${output.trim().length} chars). Attempting continuation...`);
            // Send continuation prompt with full context
            const continuationResponse = await requestDocumentStream(
              generationId,
              AUTO_MODEL_ID,
              `Brief proyek:\n\n${brief}\n\n---\nDokumen ${step} terpotong. Lanjutkan dari bagian terakhir.\n\nKonteks ${step} yang sudah ada:\n\n${output.slice(-1500)}`,
              `${getDocumentSystemPrompt(step, blueprint)}\n\nTugas: Lanjutkan dokumen ${step} dari bagian yang terpotong. JANGAN ulangi bagian yang sudah ada. Tulis sisa bagian yang belum lengkap sampai dokumen benar-benar selesai. Akhiri dengan penutup yang natural.`,
              16_000,
              stepStage,
            );

            if (continuationResponse.ok) {
              let continuationOutput = "";
              const streamResult = await consumeProviderStream(continuationResponse, "openai-compatible", "Dokumenku AI", ({ content }) => {
                if (content) continuationOutput += content;
              });
              console.log(`[AutoContinue] ${step} continuation: ${continuationOutput.trim().length} chars, finishReason=${streamResult.finishReason}`);

              if (continuationOutput.trim().length > 100) {
                // Merge: keep original, append continuation
                output = output.trim() + "\n\n" + continuationOutput.trim();
                console.log(`[AutoContinue] ${step} merged: ${output.trim().length} chars total`);
                setFiles((prev) => ({ ...prev, [step]: output }));
              } else {
                console.warn(`[AutoContinue] ${step} continuation too short (${continuationOutput.trim().length} chars), skipping merge`);
              }
            } else {
              console.error(`[AutoContinue] ${step} continuation request failed: ${continuationResponse.status}`);
            }
          }

          const completedOutput = output.trim();
          if (completedOutput.length < requiredLength) {
            throw new Error(`Dokumenku AI belum dapat menghasilkan ${step} yang cukup lengkap. Coba lagi.`);
          }

          // Final completeness check
          const finalCheck = validateDocumentCompleteness(step, completedOutput);
          if (!finalCheck.valid) {
            const tailPreview = completedOutput.slice(-200);
            console.error(`[QualityCheck] ${step} FAILED:`, finalCheck.detail, `| Tail: "${tailPreview}"`);
            throw new Error(`Dokumen ${step} belum lulus validasi: ${finalCheck.detail} Kredit Anda tetap aman. Silakan coba lagi.`);
          }

          currentFiles = { ...currentFiles, [step]: completedOutput };
          setFiles(currentFiles);
        }

        // ── Quality Gate V2.1 ───────────────────────────────────────────
        setQualityState("validating");
        setProgress(96);
        const currentModelsUsed = modelsUsed;
        const runQualityGate = async () => {
          const response = await fetch("/api/generations/quality-gate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              generationId,
              projectId,
              projectName,
              selectedModel: AUTO_MODEL_ID,
              blueprint: blueprintOutput,
              files: currentFiles,
              modelsUsed: currentModelsUsed,
            }),
          });
          const payload = await response.json().catch(() => null) as {
            data?: { report?: QualityGateReport };
            error?: string;
            message?: string;
          } | null;
          return { response, payload };
        };

        let qualityAttempt = await runQualityGate();
        let qualityResponse = qualityAttempt.response;
        let qualityPayload = qualityAttempt.payload as {
          data?: { report?: QualityGateReport };
          error?: string;
          message?: string;
        } | null;

        // One controlled repair pass keeps the blueprint contract fixed while
        // rewriting only documents with deterministic or semantic repair findings.
        const initialReport = qualityPayload?.data?.report;
        const repairReasons = initialReport ? [...initialReport.failures, ...initialReport.repairs] : [];
        if (!qualityResponse.ok && initialReport && repairReasons.length) {
          const filesToRepair = documentsNeedingQualityFix(initialReport);
          if (filesToRepair.length) {
            for (let index = 0; index < filesToRepair.length; index += 1) {
              const step = filesToRepair[index];
              const repairStage: GenerationStage = FILE_TO_STAGE[step];
              setActiveFile(step);
              setProgress(97 + Math.floor((index / filesToRepair.length) * 2));
              const repairResponse = await requestDocumentStream(
                generationId,
                AUTO_MODEL_ID,
                `Brief proyek pengguna:\n\n${brief}`,
                `${getDocumentSystemPrompt(step, blueprint)}\n\nAUTO-FIX QUALITY GATE V2.1: Dokumen sebelumnya memerlukan perbaikan berikut: ${repairReasons.join(" | ")}. Tulis ulang HANYA ${step} secara lengkap. Pertahankan fakta produk dari blueprint, hilangkan istilah pipeline internal, penuhi heading dan format yang wajib, dan jangan menambahkan fakta baru.`,
                16_000,
                repairStage,
              );
              if (!repairResponse.ok) {
                const payload = await repairResponse.json().catch(() => null);
                throw new Error(getProviderError(repairResponse.status, "Dokumenku AI", getPayloadError(payload)));
              }

              // Track repair model usage
              const repairRecord = extractModelUsedFromResponse(repairResponse);
              if (repairRecord) {
                setModelsUsed((prev) => ({ ...prev, [repairStage]: repairRecord }));
              }

              let repairedOutput = "";
              let reasoningText = "";
              await consumeProviderStream(repairResponse, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
                if (reasoning) reasoningText += reasoning;
                if (content) repairedOutput += content;
                setFiles((previous) => ({ ...previous, [step]: repairedOutput }));
                setReasoningContent(reasoningText);
              });

              // If repair output is also truncated, try continuation
              const repairCheck = validateDocumentCompleteness(step, repairedOutput);
              if (!repairCheck.valid && repairCheck.code === "DOCUMENT_TRUNCATED" && repairedOutput.trim().length > 500) {
                const contResp = await requestDocumentStream(
                  generationId,
                  AUTO_MODEL_ID,
                  `Brief proyek:\n\n${brief}\n\n---\nDokumen ${step} terpotong. Lanjutkan dari bagian terakhir.\n\nKonteks ${step} yang sudah ada:\n\n${repairedOutput.slice(-1500)}`,
                  `${getDocumentSystemPrompt(step, blueprint)}\n\nTugas: Lanjutkan dokumen ${step} dari bagian yang terpotong. JANGAN ulangi bagian yang sudah ada. Tulis sisa bagian yang belum lengkap sampai dokumen benar-benar selesai.`,
                  16_000,
                  repairStage,
                );
                if (contResp.ok) {
                  let contOutput = "";
                  await consumeProviderStream(contResp, "openai-compatible", "Dokumenku AI", ({ content }) => {
                    if (content) contOutput += content;
                  });
                  if (contOutput.trim().length > 100) {
                    repairedOutput = repairedOutput.trim() + "\n\n" + contOutput.trim();
                    setFiles((previous) => ({ ...previous, [step]: repairedOutput }));
                  }
                }
              }

              if (repairedOutput.trim().length < minimumCharacters(step)) {
                throw new Error(`Auto-fix Quality Gate belum dapat menyelesaikan ${step}. Kredit Anda tetap aman.`);
              }
              currentFiles = { ...currentFiles, [step]: repairedOutput.trim() };
              setFiles(currentFiles);
            }
            qualityAttempt = await runQualityGate();
            qualityResponse = qualityAttempt.response;
            qualityPayload = qualityAttempt.payload;
          }
        }

        if (!qualityResponse.ok) {
          throw new Error(
            qualityPayload?.error || qualityPayload?.message || "Blueprint Quality Gate V2.1 belum lulus. Kredit Anda tetap aman.",
          );
        }

        const report = qualityPayload?.data?.report;
        if (!report?.passed) {
          throw new Error("Blueprint Quality Gate V2.1 belum lulus. Kredit Anda tetap aman.");
        }

        completed = true;
        setQualityReport(report);
        setQualityState("passed");
        setProgress(100);
        toast.success(`Quality Gate V2.1 lulus: ${report.checks.filter((check) => check.status === "passed").length} pemeriksaan selesai.`);
        return true;
      } catch (error) {
        setProgress(0);
        const msg = error instanceof Error ? error.message : "Terjadi kesalahan saat pembuatan dokumen.";
        setLastError(msg);
        setQualityState("failed");
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
    setQualityState("idle");
    setQualityReport(null);
    setModelsUsed({});
  }, []);

  return {
    files,
    isGenerating,
    isLoadingDocs,
    progress,
    activeFile,
    hasResult,
    qualityState,
    qualityReport,
    reasoningContent,
    lastError,
    modelsUsed,
    setActiveFile,
    updateFileContent,
    prepareRevision,
    applyRevisionPreview,
    generateFromPrompt,
    resetAll,
  };
}
