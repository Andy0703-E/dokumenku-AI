import { NextRequest, NextResponse } from "next/server";

import {
  executeAtomicDocumentFinalization,
  getDatabase,
  reconcileTerminalProviderAttempts,
  saveProjectDocumentDrafts,
  saveProjectBlueprint,
  settleGenerationCredits,
  updateProjectBlueprintQuality,
  updateGenerationTelemetry,
} from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  parseBlueprintContract,
  qualityGateMessage,
  validateBlueprintConsistency,
  validateDocumentCompleteness,
  findDocumentOutputIsolationIssues,
} from "@/lib/blueprint-quality";
import { isAutoModel } from "@/lib/models-config";
import { ROUTING_VERSION, type ModelsUsedMap } from "@/lib/model-router";
import { terminalDraftTelemetry } from "@/lib/generation-telemetry";
import { ERROR_CODES, apiError, apiSuccess, generateRequestId } from "@/lib/errors";
import type { FileName, GeneratedFiles } from "@/lib/types";

const DOCUMENTS: Array<{ fileName: FileName; documentType: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT" }> = [
  { fileName: "PRD.md", documentType: "PRD" },
  { fileName: "TECH-STACK.md", documentType: "TECH_SPEC" },
  { fileName: "UI-UX.md", documentType: "UI_UX" },
  { fileName: "SCHEMA.md", documentType: "AI_CONTEXT" },
];

function asGeneratedFiles(value: unknown): GeneratedFiles | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const files = {} as GeneratedFiles;
  for (const { fileName } of DOCUMENTS) {
    const content = record[fileName];
    if (typeof content !== "string" || content.length > 120_000) return null;
    files[fileName] = content;
  }
  return files;
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentUser();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_UNAUTHORIZED, undefined, 401, requestId);
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const generationId = typeof body.generationId === "string" ? body.generationId.trim() : "";
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const projectName = typeof body.projectName === "string" ? body.projectName.trim().slice(0, 160) : "";
  const selectedModel = typeof body.selectedModel === "string" ? body.selectedModel.trim().slice(0, 160) : "";
  const blueprintRaw = typeof body.blueprint === "string" ? body.blueprint : "";
  const files = asGeneratedFiles(body.files);
  const modelsUsed = (body.modelsUsed || null) as ModelsUsedMap | null;
  const finalizeAsDraft = body.finalizeAsDraft === true;

  if (!generationId || !projectId || !selectedModel || !blueprintRaw || !files) {
    return apiError(ERROR_CODES.VALIDATION_FAILED, "Data Quality Gate V2.1 belum lengkap atau tidak valid.", 400, requestId);
  }

  try {
    const db = await getDatabase();
    const generationResult = await db.execute({
      sql: `SELECT id, status, project_id, model FROM document_generations
        WHERE id = ? AND LOWER(user_email) = LOWER(?)`,
      args: [generationId, user.email],
    });
    const generation = generationResult.rows[0] as unknown as {
      id: string;
      status: string;
      project_id: string;
      model: string;
    } | undefined;
    if (!generation) {
      return apiError(ERROR_CODES.RESOURCE_FORBIDDEN, "Sesi pembuatan dokumen tidak ditemukan atau bukan milik akun Anda.", 403, requestId);
    }

    if (generation.status === "COMPLETED") {
      return apiSuccess({ status: "COMPLETED", generationId, message: "Quality Gate V2.1 sudah pernah diselesaikan." }, 200, requestId);
    }
    if (!["GENERATING", "FINALIZE_FAILED"].includes(generation.status)) {
      return apiError(ERROR_CODES.GENERATION_INVALID_STATE, undefined, 409, requestId);
    }
    if (generation.project_id !== projectId) {
      return apiError(
        ERROR_CODES.VALIDATION_FAILED,
        "Proyek tidak sesuai dengan sesi pembuatan dokumen.",
        400,
        requestId,
      );
    }
    // Model check: skip if either stored or request model is "auto" (auto-routing resolves per-stage)
    if (!isAutoModel(generation.model) && !isAutoModel(selectedModel) && generation.model !== selectedModel) {
      return apiError(
        ERROR_CODES.VALIDATION_FAILED,
        "Model tidak sesuai dengan sesi pembuatan dokumen.",
        400,
        requestId,
      );
    }

    let blueprint;
    try {
      blueprint = parseBlueprintContract(blueprintRaw);
    } catch (error) {
      return apiError(
        ERROR_CODES.AI_OUTPUT_INVALID,
        error instanceof Error ? error.message : "Blueprint kanonis tidak valid.",
        422,
        requestId,
      );
    }

    const report = validateBlueprintConsistency(blueprint, files);

    // ── Critical Gate Only ──────────────────────────────────────────────
    // Run the full quality report for internal logging/telemetry, but only
    // block finalization on truly critical issues. Non-critical findings
    // (terminology drift, minor contract mismatches, wording differences)
    // are logged internally and never shown to or block the user.
    const criticalFailures: string[] = [];

    // Check 1: Missing or too-short documents (per-document thresholds)
    const DOCUMENT_NAMES: FileName[] = ["PRD.md", "TECH-STACK.md", "UI-UX.md", "SCHEMA.md"];
    for (const doc of DOCUMENT_NAMES) {
      if (!files[doc] || files[doc].trim().length < 600) {
        criticalFailures.push(`Dokumen ${doc} kosong atau terlalu pendek.`);
      }
    }

    // Check 2: Document truncation or structural break
    for (const doc of DOCUMENT_NAMES) {
      const content = files[doc]?.trim() ?? "";
      if (content.length < 600) continue;
      const completeness = validateDocumentCompleteness(doc, content);
      if (!completeness.valid) {
        criticalFailures.push(completeness.detail);
      }
    }

    // Check 3: File-boundary isolation. This is intentionally independent of
    // the broader quality report: no ZIP-ready generation may contain the H1
    // title of another document, even when all other content is complete.
    for (const issue of findDocumentOutputIsolationIssues(files)) {
      if (!criticalFailures.includes(issue.detail)) criticalFailures.push(issue.detail);
    }

    // Determine if we should block or pass
    const hasCriticalIssues = criticalFailures.length > 0;
    report.passed = !hasCriticalIssues;

    // Collect non-critical findings for telemetry (internal only, never shown to user)
    const nonCriticalWarnings = report.checks.filter(
      (c) => c.status === "failed" || c.status === "repair" || c.status === "warning",
    ).map((c) => ({ id: c.id, label: c.label, detail: c.detail }));

    // Clear user-facing failures/repairs — warnings become internal-only
    if (!hasCriticalIssues) {
      report.failures = [];
      report.repairs = [];
      report.checks.forEach((c) => {
        if (c.status === "failed" || c.status === "repair" || c.status === "warning") {
          c.status = "passed";
        }
      });
    } else {
      // For critical failures, replace failures with just the critical ones
      report.failures = criticalFailures;
      report.repairs = [];
    }

    const serializedBlueprint = JSON.stringify(blueprint);
    const reportWithMetadata = {
      ...report,
      // Internal telemetry: non-critical findings count & breakdown
      internalWarningCount: nonCriticalWarnings.length,
      internalWarningBreakdown: nonCriticalWarnings,
      ...(modelsUsed ? { modelsUsed, routingVersion: ROUTING_VERSION } : {}),
    };
    const serializedReport = JSON.stringify(reportWithMetadata);
    await saveProjectBlueprint(db, {
      userEmail: user.email,
      projectId,
      generationId,
      content: serializedBlueprint,
      qualityReport: serializedReport,
      qualityStatus: report.passed ? "PENDING" : "FAILED",
    });

    if (!report.passed) {
      // Keep all four generated documents as recoverable drafts. The user can
      // download them immediately or repair them with AI instead of losing the
      // entire result after the final validation step.
      await saveProjectDocumentDrafts(db, {
        userEmail: user.email,
        projectId,
        projectName,
        selectedModel,
        documents: DOCUMENTS.map((document) => ({
          documentType: document.documentType,
          fileName: document.fileName,
          content: files[document.fileName].trim(),
        })),
      });
        if (finalizeAsDraft) {
        const settleResult = await settleGenerationCredits(db, { generationId, userEmail: user.email });
        if (!settleResult.ok) {
          return apiError(
            ERROR_CODES.CREDIT_RESERVATION_INVALID_STATE,
            "Draf dokumen sudah aman, tetapi kredit belum dapat diselesaikan. Silakan coba lagi; kredit tetap aman.",
            409,
            requestId,
          );
        }
        const now = new Date().toISOString();
        await db.execute({
          sql: `UPDATE document_generations
            SET status = 'DRAFT_READY', completed_at = ?
            WHERE id = ? AND LOWER(user_email) = LOWER(?)`,
          args: [now, generationId, user.email],
        });
        await reconcileTerminalProviderAttempts(db, generationId);
        // Server-authoritative telemetry update (MUST be awaited — row may not exist yet)
        await updateGenerationTelemetry(db, generationId, {
          ...terminalDraftTelemetry(now),
          qualityPath: "READY_WITH_WARNINGS",
        }, user.email).catch((e) => {
          console.error(`[TELEMETRY_WRITE_FAILED] gen=${generationId} fn=quality-gate-finalizeAsDraft error=${e instanceof Error ? e.message : String(e)}`);
        });
        return NextResponse.json({
          ok: false,
          code: ERROR_CODES.AI_OUTPUT_INVALID,
          message: qualityGateMessage(report),
          error: qualityGateMessage(report),
          data: {
            report,
            draftReady: true,
            credits: settleResult.availableCredits ?? 0,
            reservedCredits: settleResult.reservedCredits ?? 0,
          },
          requestId,
        }, { status: 422 });
      }
      return NextResponse.json({
        ok: false,
        code: ERROR_CODES.AI_OUTPUT_INVALID,
        message: qualityGateMessage(report),
        error: qualityGateMessage(report),
        data: { report, draftReady: false },
        requestId,
      }, { status: 422 });
    }

    for (const document of DOCUMENTS) {
      const result = await executeAtomicDocumentFinalization(db, {
        userEmail: user.email,
        projectId,
        projectName,
        selectedModel,
        documentType: document.documentType,
        fileName: document.fileName,
        content: files[document.fileName].trim(),
        generationId,
      });
      if (!result.ok) {
        await db.execute({
          sql: "UPDATE document_generations SET status = 'FINALIZE_FAILED' WHERE id = ? AND LOWER(user_email) = LOWER(?)",
          args: [generationId, user.email],
        });
        return apiError(
          ERROR_CODES.DATABASE_TRANSACTION_FAILED,
          "Dokumen belum dapat difinalisasi. Kredit tetap berada dalam reservasi aman.",
          500,
          requestId,
        );
      }
    }

    const settleResult = await settleGenerationCredits(db, { generationId, userEmail: user.email });
    if (!settleResult.ok) {
      await db.execute({
        sql: "UPDATE document_generations SET status = 'FINALIZE_FAILED' WHERE id = ? AND LOWER(user_email) = LOWER(?)",
        args: [generationId, user.email],
      });
      return apiError(
        ERROR_CODES.CREDIT_RESERVATION_INVALID_STATE,
        "Dokumen lolos pemeriksaan, tetapi kredit belum dapat diselesaikan. Silakan coba lagi; kredit tetap aman.",
        409,
        requestId,
      );
    }

    const now = new Date().toISOString();
    await db.execute({
      sql: "UPDATE document_generations SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND LOWER(user_email) = LOWER(?)",
      args: [now, generationId, user.email],
    });
    await reconcileTerminalProviderAttempts(db, generationId);
    await updateProjectBlueprintQuality(db, {
      userEmail: user.email,
      generationId,
      qualityReport: serializedReport,
      qualityStatus: "PASSED",
    });
    // Server-authoritative telemetry update (MUST be awaited — row may not exist yet)
    await updateGenerationTelemetry(db, generationId, {
      creditResult: "CAPTURED",
      finalizedAt: now,
      finalStatus: "COMPLETED",
    }, user.email).catch((e) => {
      console.error(`[TELEMETRY_WRITE_FAILED] gen=${generationId} fn=quality-gate-completed error=${e instanceof Error ? e.message : String(e)}`);
    });

    return apiSuccess({
      status: "COMPLETED",
      generationId,
      report: reportWithMetadata,
      credits: settleResult.availableCredits ?? 0,
      reservedCredits: settleResult.reservedCredits ?? 0,
      message: qualityGateMessage(report),
    }, 200, requestId);
  } catch (error) {
    return apiError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      error instanceof Error ? error.message : "Quality Gate V2.1 tidak dapat dijalankan.",
      500,
      requestId,
    );
  }
}
