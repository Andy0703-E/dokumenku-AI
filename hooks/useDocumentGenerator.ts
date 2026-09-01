"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EMPTY_FILES } from "@/lib/stream-parser";
import {
  consumeProviderStream,
  getPayloadError,
  getProviderError,
  requestDocumentStream,
} from "@/lib/api-helpers";
import {
  extractTargetedRepairContext,
  getAlignmentSystemPrompt,
  getBlueprintRecoveryPrompt,
  getBlueprintSystemPrompt,
  getDocumentSystemPrompt,
  getFullDocumentQualityRepairSystemPrompt,
  getRevisionSystemPrompt,
  getTargetedRepairSystemPrompt,
  mergeTargetedRepairSections,
} from "@/lib/prompts";
import {
  analyzeRevisionImpact,
  type RevisionPreview,
  type RevisionScope,
} from "@/lib/revision-impact";
import {
  createFallbackBlueprint,
  applyDeterministicFastFixes,
  documentsNeedingQualityFix,
  parseBlueprintContract,
  validateBlueprintConsistency,
  validateBlueprintContract,
  validateDocumentCompleteness,
  looksTruncated,
  getContinuationPrompt,
  type BlueprintContract,
  type QualityGateReport,
} from "@/lib/blueprint-quality";
import {
  extractSemanticAttemptId,
  finalizeSemanticAttempt,
  SemanticValidationError,
} from "@/lib/semantic-lifecycle";
import type { FileName, GeneratedFiles } from "@/lib/types";
import type { GenerationStage, ModelsUsedMap, ModelUsedRecord } from "@/lib/model-router";

const DOCUMENT_STEPS: FileName[] = [
  "PRD.md",
  "TECH-STACK.md",
  "UI-UX.md",
  "SCHEMA.md",
];
const MAX_PARALLEL_DOCUMENTS = 4;
const BLUEPRINT_STREAM_TIMEOUT_MS = 120_000;
const DOCUMENT_STREAM_TIMEOUT_MS = 180_000;

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

export type RevisionStreamState = {
  files: FileName[];
  completedFiles: FileName[];
  contentByFile: Partial<Record<FileName, string>>;
};

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
  const [revisionBlueprint, setRevisionBlueprint] = useState<BlueprintContract | null>(null);
  const [modelsUsed, setModelsUsed] = useState<ModelsUsedMap>({});
  const [revisionStream, setRevisionStream] = useState<RevisionStreamState | null>(null);
  const [qualityPath, setQualityPath] = useState<"FAST_PASS" | "TARGETED_REPAIR" | "TARGETED_REPAIR_ALIGNMENT" | "READY_WITH_WARNINGS" | null>(null);

  // Telemetry timing tracker
  const timingRef = useRef({
    startMs: 0,
    blueprintMs: 0,
    prdMs: 0,
    techStackMs: 0,
    uiUxMs: 0,
    schemaMs: 0,
    fastGateMs: 0,
    qualityGateMs: 0,
    targetedRepairMs: 0,
    alignmentMs: 0,
    fallbackCount: 0,
    findingsCount: 0,
    targetedRepairCount: 0,
    alignmentUsed: false,
  });

  // A completed draft must remain usable even when Quality Gate suggests a
  // repair. This lets users download their work and continue revising instead
  // of losing four generated documents after a long wait.
  const hasResult = !isGenerating && DOCUMENT_STEPS.every((file) => files[file].trim().length > 0);

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
        try {
          setRevisionBlueprint(
            typeof data?.blueprint === "string" ? parseBlueprintContract(data.blueprint) : null,
          );
        } catch {
          setRevisionBlueprint(null);
        }
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
          const savedReport = typeof data.qualityReport === "string"
            ? (() => {
                try {
                  return JSON.parse(data.qualityReport) as QualityGateReport;
                } catch {
                  return null;
                }
              })()
            : null;
          setQualityReport(savedReport);
          setQualityState(
            data.qualityStatus === "PASSED"
              ? "passed"
              : data.qualityStatus === "FAILED"
                ? "failed"
                : "idle",
          );
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
      provider: response.headers.get("X-AI-Provider") || "gateway",
      model: modelUsed,
      attempts: fallbackIndex + 1,
      fallbackUsed: fallbackIndex > 0,
      finalStatus: fallbackIndex > 0 ? "fallback" : "success",
      attemptId: extractSemanticAttemptId(response.headers),
    };
  }

  function reportSemanticOutcome(
    attemptId: string,
    status: "SUCCESS" | "FAILED",
    failureCode?: string,
  ): Promise<void> {
    if (!attemptId) return Promise.resolve();
    return fetch("/api/telemetry/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        semanticStatus: status,
        failureCode: failureCode || undefined,
      }),
    }).then((response) => {
      if (!response.ok) throw new Error(`Telemetry semantic merespons HTTP ${response.status}.`);
    }).catch((e) => {
      console.error("[TELEMETRY_SEMANTIC_WRITE_FAILED]", { attemptId, status, failureCode, error: e instanceof Error ? e.message : e });
    });
  }

  const prepareRevision = useCallback(
    async (
      fileToRevise: FileName,
      revisionComment: string,
      scope: RevisionScope,
      reviewContext = "",
      targetFiles: FileName[] = [],
    ): Promise<RevisionPreview | null> => {
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

      const inferredImpact = analyzeRevisionImpact(fileToRevise, comment);
      const explicitFiles = scope === "related"
        ? new Set(targetFiles.filter((file) => DOCUMENT_STEPS.includes(file)))
        : new Set<FileName>();
      explicitFiles.add(fileToRevise);
      const filesToRevise = scope === "related"
        ? explicitFiles.size > 1
          ? DOCUMENT_STEPS.filter((file) => explicitFiles.has(file))
          : DOCUMENT_STEPS.filter((file) => file === fileToRevise || inferredImpact.affectedFiles.includes(file))
        : [fileToRevise];
      const impact = targetFiles.length
        ? {
            affectedFiles: filesToRevise.filter((file) => file !== fileToRevise),
            reasons: ["catatan dokumen diproses bersama agar tetap selaras"],
          }
        : inferredImpact;

      setIsGenerating(true);
      setReasoningContent("");
      setActiveFile(fileToRevise);
      setRevisionStream({ files: filesToRevise, completedFiles: [], contentByFile: {} });
      toast.info(`Sedang menyiapkan revisi ${filesToRevise.length > 1 ? `${filesToRevise.length} dokumen` : fileToRevise} dengan AI...`);

      const stage: GenerationStage = "revision";

      try {
        const before: Partial<Record<FileName, string>> = {};
        const after: Partial<Record<FileName, string>> = {};
        const reviseFile = async (file: FileName) => {
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
            getRevisionSystemPrompt(file, currentContent, comment, {
              scope,
              relatedFiles,
              reviewContext,
              blueprint: revisionBlueprint,
            }),
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
            if (content) {
              revisedOutput += content;
              setRevisionStream((previous) => previous
                ? {
                    ...previous,
                    contentByFile: { ...previous.contentByFile, [file]: revisedOutput },
                  }
                : previous);
            }
            setReasoningContent(reasoningText);
          });
          if (!revisedOutput.trim()) throw new Error(`Hasil revisi ${file} kosong, silakan coba lagi.`);
          const completeness = validateDocumentCompleteness(file, revisedOutput.trim());
          if (!completeness.valid) {
            // Never let a shortened stream overwrite a complete document.
            // Keep the previous version in the preview and continue repairing
            // the other requested documents where possible.
            toast.warning(`Hasil revisi ${file} belum lengkap; versi sebelumnya dipertahankan.`);
            return { file, before: currentContent, after: currentContent };
          }

          setRevisionStream((previous) => previous
            ? {
                ...previous,
                completedFiles: previous.completedFiles.includes(file)
                  ? previous.completedFiles
                  : [...previous.completedFiles, file],
              }
            : previous);

          return { file, before: currentContent, after: revisedOutput.trim() };
        };

        const results: Array<{ file: FileName; before: string; after: string } | undefined> = Array(filesToRevise.length);
        let nextIndex = 0;
        const workers = Array.from(
          { length: Math.min(MAX_PARALLEL_DOCUMENTS, filesToRevise.length) },
          async () => {
            while (nextIndex < filesToRevise.length) {
              const index = nextIndex;
              nextIndex += 1;
              results[index] = await reviseFile(filesToRevise[index]);
            }
          },
        );
        await Promise.all(workers);
        for (const result of results) {
          if (!result) continue;
          before[result.file] = result.before;
          after[result.file] = result.after;
        }

        // A bulk repair can leave one narrow contract conflict even after the
        // main rewrite. Make one compact, section-only repair pass before the
        // user sees the preview, rather than asking them to repeat revisions.
        if (scope === "related" && reviewContext && revisionBlueprint) {
          let repairedFiles = { ...files, ...after } as GeneratedFiles;
          const firstReport = validateBlueprintConsistency(revisionBlueprint, repairedFiles);
          const openChecks = firstReport.checks.filter(
            (check) => check.status === "failed" || check.status === "repair",
          );
          const repairFiles = DOCUMENT_STEPS.filter((file) =>
            filesToRevise.includes(file) && openChecks.some((check) =>
              documentsNeedingQualityFix({ ...firstReport, checks: [check] }).includes(file),
            ),
          );

          if (repairFiles.length) {
            toast.info("Menyelaraskan bagian dokumen yang masih terkait...");
            let repairIndex = 0;
            const repairWorkers = Array.from(
              { length: Math.min(MAX_PARALLEL_DOCUMENTS, repairFiles.length) },
              async () => {
                while (repairIndex < repairFiles.length) {
                  const index = repairIndex;
                  repairIndex += 1;
                  const file = repairFiles[index];
                  const findings = openChecks
                    .filter((check) => documentsNeedingQualityFix({ ...firstReport, checks: [check] }).includes(file))
                    .map((check) => check.detail);
                  if (!findings.length) continue;

                  try {
                    const context = extractTargetedRepairContext(file, repairedFiles[file], findings);
                    const response = await requestDocumentStream(
                      `rev-fix-${crypto.randomUUID()}`,
                      AUTO_MODEL_ID,
                      `Perbaiki hanya bagian ${context.sectionTitles.join(", ") || "terkait"} pada ${file}.`,
                      getTargetedRepairSystemPrompt(file, revisionBlueprint, context, findings, repairedFiles),
                      4_500,
                      stage,
                      15_000,
                    );
                    if (!response.ok) continue;

                    const repairRecord = extractModelUsedFromResponse(response);
                    if (repairRecord) setModelsUsed((prev) => ({ ...prev, revision: repairRecord }));

                    let replacement = "";
                    await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content }) => {
                      if (!content) return;
                      replacement += content;
                      const streamed = mergeTargetedRepairSections(repairedFiles[file], replacement.trim());
                      setRevisionStream((previous) => previous
                        ? {
                            ...previous,
                            contentByFile: { ...previous.contentByFile, [file]: streamed },
                          }
                        : previous);
                    }, { timeoutMs: 15_000 });

                    if (!replacement.trim()) continue;
                    const merged = mergeTargetedRepairSections(repairedFiles[file], replacement.trim());
                    if (!validateDocumentCompleteness(file, merged).valid) continue;
                    repairedFiles = { ...repairedFiles, [file]: merged };
                    after[file] = merged;
                  } catch {
                    // The reviewed draft remains available when an optional
                    // narrow repair times out or its provider is unavailable.
                    continue;
                  }
                }
              },
            );
            await Promise.all(repairWorkers);
          }
        }

        return {
          revisionRequestId: `revreq_${crypto.randomUUID()}`,
          instruction: comment,
          scope,
          impact,
          before,
          after,
        };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal merevisi dokumen.");
        return null;
      } finally {
        setRevisionStream(null);
        setIsGenerating(false);
      }
    },
    [files, revisionBlueprint],
  );

  const applyRevisionPreview = useCallback(
    async (preview: RevisionPreview): Promise<{ ok: true } | { ok: false; error: string }> => {
      const revisions = Object.entries(preview.after)
        .filter(([fileName, content]) =>
          typeof content === "string"
          && Boolean(content.trim())
          && content !== preview.before[fileName as FileName],
        )
        .map(([fileName, content]) => ({ fileName, content: content as string }));
      if (!revisions.length) {
        return { ok: false, error: "Tidak ada perubahan revisi untuk diterapkan." };
      }

      setIsGenerating(true);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revisionRequestId: preview.revisionRequestId,
            instruction: preview.instruction,
            scope: preview.scope,
            revisions,
          }),
        });
        const payload = await response.json().catch(() => null) as {
          data?: { saved?: number; report?: QualityGateReport };
          error?: string;
        } | null;
        if (!response.ok) {
          return {
            ok: false,
            error: response.status === 401
              ? "Sesi Anda sudah berakhir. Silakan masuk kembali, lalu coba terapkan revisi."
              : typeof payload?.error === "string"
                ? payload.error
              : "Perubahan belum dapat diterapkan. Sesuaikan instruksi revisi atau pilih sinkronkan dokumen terkait, lalu coba lagi.",
          };
        }

        setFiles((previous) => ({ ...previous, ...preview.after }));
        const report = payload?.data?.report;
          if (report) {
            setQualityReport(report);
            setQualityState(report.passed ? "passed" : "failed");
          }
        toast.success(
          report?.passed === false
            ? "Perubahan tersimpan. Dokumen siap dengan beberapa catatan."
            : `${payload?.data?.saved || revisions.length} dokumen revisi telah disimpan.`,
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Revisi tidak dapat diterapkan." };
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
      setQualityPath(null);
      timingRef.current = {
        startMs: Date.now(),
        blueprintMs: 0,
        prdMs: 0,
        techStackMs: 0,
        uiUxMs: 0,
        schemaMs: 0,
        fastGateMs: 0,
        qualityGateMs: 0,
        targetedRepairMs: 0,
        alignmentMs: 0,
        fallbackCount: 0,
        findingsCount: 0,
        targetedRepairCount: 0,
        alignmentUsed: false,
      };

      let generationId: string | null = null;
      let completed = false;
      let draftMayBeAvailable = false;
      const generationModelsUsed: ModelsUsedMap = {};
      const startRequestId = `start_${crypto.randomUUID()}`;

      try {
        const startResponse = await fetch("/api/generations/start", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": startRequestId },
          body: JSON.stringify({
            selectedModel: AUTO_MODEL_ID,
            prompt: brief,
            projectId,
            projectName,
            idempotencyKey: startRequestId,
          }),
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
        const blueprintStartMs = Date.now();

        // Blueprint is a single prerequisite request. Keep the progress alive
        // while the provider is analysing it, without implying that a document
        // has already been generated.
        const blueprintProgressTimer = window.setInterval(() => {
          setProgress((current) => Math.min(9, current + 1));
        }, 1_800);

        try {
          for (let attempt = 0; attempt < 3; attempt++) {
            const response = await requestDocumentStream(
              generationId,
              AUTO_MODEL_ID,
              `Brief proyek pengguna:\n\n${brief}`,
              attempt === 0 ? getBlueprintSystemPrompt() : getBlueprintRecoveryPrompt(),
              24_000,
              blueprintStage,
            );
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(
                getProviderError(response.status, "Dokumenku AI", getPayloadError(payload)),
              );
            }

            // Each recovery request is its own provider attempt and must be
            // finalized independently; do not retain only the first attempt.
            const bpRecord = extractModelUsedFromResponse(response);
            const blueprintAttemptId = extractSemanticAttemptId(response.headers);
            if (bpRecord) {
              generationModelsUsed.blueprint = bpRecord;
              setModelsUsed((prev) => ({ ...prev, blueprint: bpRecord }));
            }
            let attemptOutput = "";
            let reasoningText = "";
            let streamFinishReason: string | null = null;
            try {
              const candidate = await finalizeSemanticAttempt(
                blueprintAttemptId,
                async () => {
                  const streamResult = await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
                    if (reasoning) reasoningText += reasoning;
                    if (content) attemptOutput += content;
                    setReasoningContent(reasoningText);
                  }, { timeoutMs: BLUEPRINT_STREAM_TIMEOUT_MS });
                  streamFinishReason = streamResult?.finishReason ?? null;
                  blueprintOutput = attemptOutput.trim();
                  if (!blueprintOutput && reasoningText.trim()) {
                    try {
                      // Attempt to extract blueprint from reasoning if content was empty
                      const testParsed = parseBlueprintContract(reasoningText);
                      blueprintOutput = JSON.stringify(testParsed);
                    } catch {
                      // fallback to empty blueprintOutput
                    }
                  }
                  const parsed = parseBlueprintContract(blueprintOutput);
                  const contractFailures = validateBlueprintContract(parsed);
                  if (contractFailures.length) {
                    throw new SemanticValidationError(contractFailures.join(" "), "SEMANTIC_VALIDATION_FAILED");
                  }
                  return parsed;
                },
                reportSemanticOutcome,
                () => ({ output: blueprintOutput || attemptOutput, finishReason: streamFinishReason }),
              );
              blueprint = candidate;
              break;
            } catch {
              // One compact JSON recovery is enough; after that a safe local contract is used.
            }
          }
        } finally {
          window.clearInterval(blueprintProgressTimer);
          timingRef.current.blueprintMs = Date.now() - blueprintStartMs;
        }
        if (!blueprint) {
          blueprint = createFallbackBlueprint(brief);
          blueprintOutput = JSON.stringify(blueprint);
        }
        setRevisionBlueprint(blueprint);
        setProgress(10);
        const activeGenerationId = generationId as string;

        // ── Ordered Document Generation ──────────────────────────────────
        // Each document receives only the earlier documents prescribed by the
        // read-only context contract. This preserves output isolation while
        // making technical, UI, and schema decisions traceable to the PRD.
        const documentFailures: Error[] = [];
        let completedDocumentCount = 0;

        const generateDocument = async (step: FileName): Promise<string> => {
          const requiredLength = minimumCharacters(step);
          const stepStage: GenerationStage = FILE_TO_STAGE[step];

          let output = "";
          let documentValidated = false;
          let retryInstruction = "";
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const response = await requestDocumentStream(
              activeGenerationId,
              AUTO_MODEL_ID,
              `Brief proyek pengguna:\n\n${brief}`,
              `${getDocumentSystemPrompt(step, blueprint, currentFiles)}${retryInstruction}`,
              24_000,
              stepStage,
            );
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(getProviderError(response.status, "Dokumenku AI", getPayloadError(payload)));
            }

            // A retry has a different X-Attempt-Id. Retaining only attempt
            // zero was the source of schema attempts left as UNKNOWN.
            const docRecord = extractModelUsedFromResponse(response);
            const documentAttemptId = extractSemanticAttemptId(response.headers);
            if (docRecord) {
              generationModelsUsed[stepStage] = docRecord;
              setModelsUsed((previous) => ({ ...previous, [stepStage]: docRecord }));
            }

            let attemptOutput = "";
            let reasoningText = "";
            let finishReason: string | null = null;
            try {
              output = await finalizeSemanticAttempt(
                documentAttemptId,
                async () => {
                  const streamResult = await consumeProviderStream(response, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
                    if (reasoning) reasoningText += reasoning;
                    if (content) attemptOutput += content;
                    setFiles((previous) => ({ ...previous, [step]: attemptOutput }));
                    setReasoningContent(reasoningText);
                  }, { timeoutMs: DOCUMENT_STREAM_TIMEOUT_MS });
                  finishReason = streamResult.finishReason;
                  const candidate = attemptOutput.trim();
                  const check = validateDocumentCompleteness(step, candidate);
                  const truncated = looksTruncated(candidate);
                  if (finishReason === "length" || finishReason === "content_filter" || truncated || !check.valid) {
                    console.warn(`[DOC_VALIDATOR_FAIL] step=${step} attempt=${attempt} finishReason=${finishReason} truncated=${truncated} check=${JSON.stringify(check)} candidateLength=${candidate.length}`);
                    throw new SemanticValidationError(
                      check.detail || (finishReason === "content_filter" ? "Pembuatan dokumen terhenti oleh filter konten provider AI." : "Respons dokumen belum lengkap."),
                      finishReason === "length" || finishReason === "content_filter" || truncated || check.code === "DOCUMENT_TRUNCATED" || check.code === "REQUIRED_SECTION_MISSING" || check.code === "DOCUMENT_TOO_SHORT"
                        ? "OUTPUT_TRUNCATED"
                        : "SEMANTIC_VALIDATION_FAILED",
                    );
                  }
                  return candidate;
                },
                reportSemanticOutcome,
                () => ({ output: attemptOutput, finishReason }),
              );
              documentValidated = true;
              break;
            } catch {
              output = attemptOutput.trim();
              if (attempt < 2) {
                const attemptCheck = validateDocumentCompleteness(step, output);
                retryInstruction = `\n\nPENTING: Respons sebelumnya belum lolos pemeriksaan kelengkapan: ${attemptCheck.detail || "respons terpotong"} Tulis ulang SELURUH ${step} secara konkret, terstruktur, dan minimal ${requiredLength} karakter. Jangan berhenti sebelum semua heading wajib dan isinya selesai. Jika suatu bagian tidak memiliki data khusus, tetap tulis heading tersebut dan jelaskan asumsi yang aman.`;
                continue;
              }
            }
          }

          const completeness = validateDocumentCompleteness(step, output);
          if (!documentValidated && !completeness.valid && output.trim().length > 500) {
            const continuationResponse = await requestDocumentStream(
              activeGenerationId,
              AUTO_MODEL_ID,
              `Brief proyek:\n\n${brief}\n\n---\nDokumen ${step} terpotong. Lanjutkan dari bagian terakhir.\n\nKonteks ${step} yang sudah ada:\n\n${output.slice(-1500)}`,
              `${getDocumentSystemPrompt(step, blueprint, currentFiles)}\n\nTugas: Lanjutkan dokumen ${step} dari bagian yang terpotong. JANGAN ulangi bagian yang sudah ada. Tulis sisa bagian yang belum lengkap sampai dokumen benar-benar selesai. Akhiri dengan penutup yang natural.`,
              24_000,
              stepStage,
            );
            if (continuationResponse.ok) {
              const continuationRecord = extractModelUsedFromResponse(continuationResponse);
              const continuationAttemptId = extractSemanticAttemptId(continuationResponse.headers);
              if (continuationRecord) {
                generationModelsUsed[stepStage] = continuationRecord;
                setModelsUsed((previous) => ({ ...previous, [stepStage]: continuationRecord }));
              }
              let continuationOutput = "";
              let continuationFinishReason: string | null = null;
              try {
                output = await finalizeSemanticAttempt(
                  continuationAttemptId,
                  async () => {
                    const streamResult = await consumeProviderStream(continuationResponse, "openai-compatible", "Dokumenku AI", ({ content }) => {
                      if (content) continuationOutput += content;
                    }, { timeoutMs: DOCUMENT_STREAM_TIMEOUT_MS });
                    continuationFinishReason = streamResult?.finishReason ?? null;
                    if (!continuationOutput.trim()) {
                      throw new SemanticValidationError("Lanjutan dokumen kosong.", "EMPTY_OUTPUT");
                    }
                    const candidate = `${output.trim()}\n\n${continuationOutput.trim()}`;
                    const check = validateDocumentCompleteness(step, candidate);
                    if (!check.valid) {
                      throw new SemanticValidationError(
                        check.detail || "Lanjutan dokumen belum lengkap.",
                        check.code === "DOCUMENT_TRUNCATED" ? "OUTPUT_TRUNCATED" : "SEMANTIC_VALIDATION_FAILED",
                      );
                    }
                    return candidate;
                  },
                  reportSemanticOutcome,
                  () => ({ output: continuationOutput, finishReason: continuationFinishReason }),
                );
                documentValidated = true;
                setFiles((previous) => ({ ...previous, [step]: output }));
              } catch {
                // The continuation attempt has already been finalized as
                // FAILED; the final document validation below keeps the draft
                // from being accepted.
              }
            }
          }

          const completedOutput = output.trim();
          if (!documentValidated) {
            const debugCheck = validateDocumentCompleteness(step, completedOutput);
            const debugTruncated = looksTruncated(completedOutput);
            console.error(`[CRITICAL_GATE_DEBUG] step=${step} length=${completedOutput.length} validated=${documentValidated} truncated=${debugTruncated} completeness=${JSON.stringify(debugCheck)}`);
            throw new Error(`Dokumen ${step} belum menyelesaikan pemeriksaan semantik. Length: ${completedOutput.length}, Truncated: ${debugTruncated}, Valid: ${debugCheck.valid}. Silakan coba lagi.`);
          }
          if (completedOutput.length < requiredLength) {
            throw new Error(`Dokumenku AI belum dapat menghasilkan ${step} yang cukup lengkap. Coba lagi.`);
          }
          const finalCheck = validateDocumentCompleteness(step, completedOutput);
          if (!finalCheck.valid) {
            throw new Error(`Dokumen ${step} belum lulus validasi: ${finalCheck.detail} Kredit Anda tetap aman. Silakan coba lagi.`);
          }
          return completedOutput;
        };

        for (const step of DOCUMENT_STEPS) {
          const docStartMs = Date.now();
          try {
            const completedOutput = await generateDocument(step);
            const docMs = Date.now() - docStartMs;
            currentFiles = { ...currentFiles, [step]: completedOutput };
            completedDocumentCount += 1;
            setFiles(currentFiles);
            setProgress(10 + Math.round((completedDocumentCount / DOCUMENT_STEPS.length) * 84));
            // Record per-document timing
            if (step === "PRD.md") timingRef.current.prdMs = docMs;
            else if (step === "TECH-STACK.md") timingRef.current.techStackMs = docMs;
            else if (step === "UI-UX.md") timingRef.current.uiUxMs = docMs;
            else if (step === "SCHEMA.md") timingRef.current.schemaMs = docMs;
          } catch (error) {
            documentFailures.push(error instanceof Error ? error : new Error(String(error)));
            break;
          }
        }
        if (documentFailures.length > 0) {
          throw documentFailures[0];
        }

        // ── Fast Gate ───────────────────────────────────────────────────
        // Safe normalisations happen locally before the final server-owned
        // validation. This path never invokes another AI model.
        const deterministicFixes = applyDeterministicFastFixes(blueprint, currentFiles);
        if (deterministicFixes.changes.length) {
          currentFiles = deterministicFixes.files;
          setFiles(currentFiles);
        }
        setQualityState("validating");
        setProgress(96);
        const currentModelsUsed = generationModelsUsed;
        const qualityGateStartMs = Date.now();
        const runQualityGate = async (finalizeAsDraft = false) => {
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
              finalizeAsDraft,
            }),
          });
          const payload = await response.json().catch(() => null) as {
            data?: { report?: QualityGateReport; draftReady?: boolean; credits?: number };
            error?: string;
            message?: string;
          } | null;
          return { response, payload };
        };

        let qualityAttempt = await runQualityGate();
        let qualityResponse = qualityAttempt.response;
        let qualityPayload = qualityAttempt.payload;

        draftMayBeAvailable = !qualityResponse.ok && Boolean(qualityPayload?.data?.report);
        timingRef.current.fastGateMs = Date.now() - qualityGateStartMs;
        timingRef.current.qualityGateMs = timingRef.current.fastGateMs;

        // If quality gate passed immediately, no repair needed
        if (qualityResponse.ok) {
          setQualityPath("FAST_PASS");
        }

        // PHASE 1: Targeted repair for specific section issues
        const targetedRepairStartMs = Date.now();
        if (!qualityResponse.ok && qualityPayload?.data?.report) {
          const initialReport = qualityPayload.data.report;
          const filesToRepair = documentsNeedingQualityFix(initialReport);

          if (filesToRepair.length > 0) {
            for (let index = 0; index < filesToRepair.length; index++) {
              const step = filesToRepair[index];
              const repairStage: GenerationStage = "targeted-repair";
              const findings = initialReport.checks
                .filter((check) => check.status === "repair" || check.status === "failed")
                .filter((check) => documentsNeedingQualityFix({ ...initialReport, checks: [check] }).includes(step))
                .map((check) => check.detail);
              if (!findings.length) continue;

              setProgress(97 + Math.floor((index / filesToRepair.length) * 1));
              const repairContext = extractTargetedRepairContext(step, currentFiles[step], findings);
              let repairResponse: Response;
              try {
                repairResponse = await requestDocumentStream(
                  generationId,
                  AUTO_MODEL_ID,
                  `Dokumen: ${step}. Perbaiki hanya section yang diberikan.`,
                  getTargetedRepairSystemPrompt(step, blueprint, repairContext, findings, currentFiles),
                  16_000,
                  repairStage,
                  30_000,
                );
              } catch {
                continue;
              }
              if (!repairResponse.ok) continue;

              const repairRecord = extractModelUsedFromResponse(repairResponse);
              const repairAttemptId = extractSemanticAttemptId(repairResponse.headers);
              if (repairRecord) {
                generationModelsUsed[repairStage] = repairRecord;
                setModelsUsed((prev) => ({ ...prev, [repairStage]: repairRecord }));
              }

              let repairedOutput = "";
              let reasoningText = "";
              let repairFinishReason: string | null = null;
              try {
                const repairedContent = await finalizeSemanticAttempt(
                  repairAttemptId,
                  async () => {
                    const streamResult = await consumeProviderStream(repairResponse, "openai-compatible", "Dokumenku AI", ({ content, reasoning }) => {
                      if (reasoning) reasoningText += reasoning;
                      if (content) repairedOutput += content;
                      setReasoningContent(reasoningText);
                    }, { timeoutMs: 30_000 });
                    repairFinishReason = streamResult?.finishReason ?? null;
                    if (!repairedOutput.trim()) {
                      throw new SemanticValidationError("Respons perbaikan kosong.", "EMPTY_OUTPUT");
                    }
                    const merged = mergeTargetedRepairSections(currentFiles[step], repairedOutput.trim());
                    if (merged === currentFiles[step]) {
                      throw new SemanticValidationError("Patch perbaikan tidak dapat diterapkan.", "SEMANTIC_VALIDATION_FAILED");
                    }
                    const check = validateDocumentCompleteness(step, merged);
                    if (!check.valid) {
                      throw new SemanticValidationError(
                        check.detail || "Patch perbaikan belum memenuhi kontrak dokumen.",
                        check.code === "DOCUMENT_TRUNCATED" ? "OUTPUT_TRUNCATED" : "SEMANTIC_VALIDATION_FAILED",
                      );
                    }
                    return merged;
                  },
                  reportSemanticOutcome,
                  () => ({ output: repairedOutput, finishReason: repairFinishReason }),
                );
                currentFiles = { ...currentFiles, [step]: repairedContent };
                setFiles(currentFiles);
              } catch {
                // finalizeSemanticAttempt has already marked this HTTP 200
                // response FAILED, including empty or unappliable patches.
                // Some providers only produce reliable full-document output.
                // Make one bounded fallback pass rather than leaving a
                // contract violation for manual editing.
                const fullRepairStage: GenerationStage = "quality-repair";
                try {
                  const fullRepairResponse = await requestDocumentStream(
                    generationId,
                    AUTO_MODEL_ID,
                    `Dokumen: ${step}. Tulis ulang dokumen lengkap sesuai kontrak proyek.`,
                    getFullDocumentQualityRepairSystemPrompt(step, blueprint, currentFiles[step], findings, currentFiles),
                    24_000,
                    fullRepairStage,
                    120_000,
                  );
                  if (!fullRepairResponse.ok) continue;

                  const fullRepairRecord = extractModelUsedFromResponse(fullRepairResponse);
                  if (fullRepairRecord) {
                    generationModelsUsed[fullRepairStage] = fullRepairRecord;
                    setModelsUsed((prev) => ({ ...prev, [fullRepairStage]: fullRepairRecord }));
                  }

                  const fullRepairAttemptId = extractSemanticAttemptId(fullRepairResponse.headers);
                  let fullRepairOutput = "";
                  let fullRepairFinishReason: string | null = null;
                  const fullyRepaired = await finalizeSemanticAttempt(
                    fullRepairAttemptId,
                    async () => {
                      const streamResult = await consumeProviderStream(fullRepairResponse, "openai-compatible", "Dokumenku AI", ({ content }) => {
                        if (content) fullRepairOutput += content;
                      }, { timeoutMs: 120_000 });
                      fullRepairFinishReason = streamResult?.finishReason ?? null;
                      if (!fullRepairOutput.trim()) {
                        throw new SemanticValidationError("Respons penulisan ulang kosong.", "EMPTY_OUTPUT");
                      }
                      const check = validateDocumentCompleteness(step, fullRepairOutput.trim());
                      if (!check.valid) {
                        throw new SemanticValidationError(
                          check.detail || "Penulisan ulang belum memenuhi kontrak dokumen.",
                          check.code === "DOCUMENT_TRUNCATED" ? "OUTPUT_TRUNCATED" : "SEMANTIC_VALIDATION_FAILED",
                        );
                      }
                      return fullRepairOutput.trim();
                    },
                    reportSemanticOutcome,
                    () => ({ output: fullRepairOutput, finishReason: fullRepairFinishReason }),
                  );
                  currentFiles = { ...currentFiles, [step]: fullyRepaired };
                  setFiles(currentFiles);
                } catch {
                  // Both repair paths are terminally reported. Keep the
                  // recoverable draft when no validated replacement exists.
                  continue;
                }
              }
            }

            // Re-validate after repair
            qualityAttempt = await runQualityGate();
            qualityResponse = qualityAttempt.response;
            qualityPayload = qualityAttempt.payload;
          }
        }

        // Set qualityPath based on whether repair was needed
        if (!qualityResponse.ok && qualityPath !== "FAST_PASS") {
          timingRef.current.targetedRepairMs = Date.now() - targetedRepairStartMs;
          timingRef.current.targetedRepairCount = 1;
          setQualityPath("TARGETED_REPAIR");
        }

        // PHASE 2: Single alignment pass (only for cross-document terminology/contract issues)
        const alignmentStartMs = Date.now();
        const postRepairReport = qualityPayload?.data?.report;
        if (!qualityResponse.ok && postRepairReport) {
          const crossDocIssues = postRepairReport.checks
            .filter((c) => c.status === "failed" || c.status === "repair")
            .filter((c) => ["cross-document-terminology", "contract-enforcement"].includes(c.id));
          if (crossDocIssues.length) {
            toast.info("Menyelaraskan istilah lintas dokumen...");
            try {
              const alignmentFindings = crossDocIssues.map((c) => c.detail);
              const alignmentPrompt = getAlignmentSystemPrompt(currentFiles, blueprint, alignmentFindings);
              const alignmentResponse = await requestDocumentStream(
                generationId,
                AUTO_MODEL_ID,
                "Selaraskan istilah lintas keempat dokumen.",
                alignmentPrompt,
                24_000,
                "alignment" as GenerationStage,
                45_000,
              );
              if (alignmentResponse.ok) {
                const alignmentAttemptId = extractSemanticAttemptId(alignmentResponse.headers);
                let alignmentOutput = "";
                let alignmentFinishReason: string | null = null;
                try {
                  const alignedFiles = await finalizeSemanticAttempt(
                    alignmentAttemptId,
                    async () => {
                      const streamResult = await consumeProviderStream(alignmentResponse, "openai-compatible", "Dokumenku AI", ({ content }) => {
                        if (content) alignmentOutput += content;
                      }, { timeoutMs: 45_000 });
                      alignmentFinishReason = streamResult?.finishReason ?? null;

                      const jsonMatch = alignmentOutput.match(/\{[\s\S]*\}/);
                      if (!jsonMatch) {
                        throw new SemanticValidationError("Respons alignment tidak berisi JSON.", "INVALID_STRUCTURED_OUTPUT");
                      }

                    const aligned = JSON.parse(jsonMatch[0]) as Partial<GeneratedFiles>;
                    const fileNames: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];
                    let anyAligned = false;
                    let candidateFiles = currentFiles;
                    for (const fname of fileNames) {
                      if (typeof aligned[fname] === "string" && aligned[fname].trim().length > 200) {
                        const check = validateDocumentCompleteness(fname, aligned[fname]);
                        if (check.valid) {
                          candidateFiles = { ...candidateFiles, [fname]: aligned[fname] };
                          anyAligned = true;
                        }
                      }
                    }
                    if (!anyAligned) {
                      throw new SemanticValidationError("Respons alignment tidak dapat diterapkan.", "SEMANTIC_VALIDATION_FAILED");
                    }
                    return candidateFiles;
                  },
                  reportSemanticOutcome,
                  () => ({ output: alignmentOutput, finishReason: alignmentFinishReason }),
                );
                currentFiles = alignedFiles;
                setFiles(currentFiles);
                qualityAttempt = await runQualityGate();
                qualityResponse = qualityAttempt.response;
                qualityPayload = qualityAttempt.payload;
                } catch {
                  // finalizeSemanticAttempt has already reported the terminal
                  // semantic outcome for every HTTP-successful alignment call.
                }
              }
            } catch {
              // Alignment failed
            }
          }
        }

        // Update qualityPath after alignment attempt
        if (!qualityResponse.ok && qualityPath === "TARGETED_REPAIR") {
          timingRef.current.alignmentMs = Date.now() - alignmentStartMs;
          timingRef.current.alignmentUsed = true;
          setQualityPath("TARGETED_REPAIR_ALIGNMENT");
        }

        // PHASE 3: Finalize (PASS or READY_WITH_WARNINGS)

        // If still failing after all repair rounds, finalize as draft
        if (!qualityResponse.ok && !qualityPayload?.data?.report?.passed) {
          qualityAttempt = await runQualityGate(true);
          qualityResponse = qualityAttempt.response;
          qualityPayload = qualityAttempt.payload;
        }

        const report = qualityPayload?.data?.report;
        if (!qualityResponse.ok) {
          if (qualityPayload?.data?.draftReady && report) {
            completed = true;
            setQualityReport(report);
            setQualityState("failed");
            setProgress(100);
            const noteCount = report.checks.filter((c) => c.status === "failed" || c.status === "repair").length;
            toast.warning(
              noteCount > 0
                ? `Dokumen siap dengan ${noteCount} catatan dan tetap dapat diunduh atau direvisi.`
                : "Dokumen siap dengan beberapa catatan dan tetap dapat diunduh atau direvisi."
            );
            setQualityPath("READY_WITH_WARNINGS");
            // Send telemetry (fire-and-forget)
            const t = timingRef.current;
            fetch("/api/telemetry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                generationId,
                projectId,
                qualityPath: "READY_WITH_WARNINGS",
                finalStatus: "READY_WITH_WARNINGS",
                totalDurationMs: Date.now() - t.startMs,
                blueprintMs: t.blueprintMs,
                prdMs: t.prdMs,
                techStackMs: t.techStackMs,
                uiUxMs: t.uiUxMs,
                schemaMs: t.schemaMs,
                fastGateMs: t.fastGateMs,
                qualityGateMs: t.qualityGateMs,
                targetedRepairMs: t.targetedRepairMs,
                alignmentMs: t.alignmentMs,
                targetedRepairCount: t.targetedRepairCount,
                alignmentUsed: t.alignmentUsed,
                findingsCount: report ? report.checks.filter((c) => c.status === "failed" || c.status === "repair").length : 0,
                findingsBreakdown: report ? (() => {
                  const breakdown: Record<string, number> = {};
                  report.checks.filter((c) => c.status === "failed" || c.status === "repair").forEach((c) => {
                    breakdown[c.id] = (breakdown[c.id] || 0) + 1;
                  });
                  return breakdown;
                })() : {},
                modelsUsed: generationModelsUsed,
                fallbackCount: t.fallbackCount,
                providerCount: Object.keys(generationModelsUsed).length,
                routingVersion: "v1",
              }),
            }).catch(() => {});
            return true;
          }
          throw new Error("Dokumen belum dapat diselesaikan. Draf yang tersedia tetap aman.");
        }

        if (!report?.passed) {
          throw new Error("Dokumen belum dapat diselesaikan. Draf yang tersedia tetap aman.");
        }

        completed = true;
        setQualityReport(report);
        setQualityState("passed");
        setProgress(100);
        toast.success("Dokumen siap digunakan.");
        // Send telemetry (fire-and-forget)
        const t = timingRef.current;
        fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationId,
            projectId,
            qualityPath: qualityPath || "FAST_PASS",
            finalStatus: "COMPLETED",
            totalDurationMs: Date.now() - t.startMs,
            blueprintMs: t.blueprintMs,
            prdMs: t.prdMs,
            techStackMs: t.techStackMs,
            uiUxMs: t.uiUxMs,
            schemaMs: t.schemaMs,
            fastGateMs: t.fastGateMs,
            qualityGateMs: t.qualityGateMs,
            targetedRepairMs: t.targetedRepairMs,
            alignmentMs: t.alignmentMs,
            targetedRepairCount: t.targetedRepairCount,
            alignmentUsed: t.alignmentUsed,
            findingsCount: 0,
            modelsUsed: generationModelsUsed,
            fallbackCount: t.fallbackCount,
            providerCount: Object.keys(generationModelsUsed).length,
            routingVersion: "v1",
          }),
        }).catch(() => {});
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
            body: JSON.stringify({
              generationId,
              completed: false,
              failureReason: "generation_failed",
              preserveDraft: draftMayBeAvailable,
            }),
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
    setQualityPath(null);
    setRevisionBlueprint(null);
    setRevisionStream(null);
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
    qualityPath,
    revisionStream,
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
