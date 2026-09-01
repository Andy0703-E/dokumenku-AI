import { NextRequest, NextResponse } from "next/server";

import { getDatabase, updateProviderAttemptSemantic } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { recordModelOutcome, type GenerationStage } from "@/lib/model-router";

const GENERATION_STAGES = new Set<GenerationStage>([
  "blueprint",
  "prd",
  "tech-stack",
  "ui-ux",
  "schema",
  "revision",
  "quality-repair",
  "targeted-repair",
  "alignment",
]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const attemptId = typeof body.attemptId === "string" ? body.attemptId.trim() : "";
  const semanticStatus = body.semanticStatus === "SUCCESS" || body.semanticStatus === "FAILED" ? body.semanticStatus : null;
  const failureCode = typeof body.failureCode === "string" ? body.failureCode.trim() : undefined;

  if (!attemptId || !semanticStatus) {
    return NextResponse.json({ error: "Field wajib: attemptId, semanticStatus." }, { status: 400 });
  }

  try {
    const db = await getDatabase();

    // Verify the attempt belongs to this user's generation
    const attemptRow = await db.execute({
      sql: `SELECT pa.attempt_id, pa.model, pa.stage, pa.latency_ms FROM provider_attempts pa
        JOIN document_generations dg ON dg.id = pa.generation_id
        WHERE pa.attempt_id = ? AND LOWER(dg.user_email) = LOWER(?)`,
      args: [attemptId, user.email],
    });
    const attempt = attemptRow.rows[0] as unknown as {
      attempt_id: string;
      model: string;
      stage: string;
      latency_ms: number | null;
    } | undefined;
    if (!attempt) {
      return NextResponse.json({ error: "Attempt tidak ditemukan." }, { status: 404 });
    }

    const result = await updateProviderAttemptSemantic(db, attemptId, semanticStatus, failureCode);
    // Route by validated output quality, not by transport status. A provider
    // that returns an empty HTTP 200 response must be penalized for repair
    // stages so the next attempt selects a usable model.
    if (result.updated && attempt.model && GENERATION_STAGES.has(attempt.stage as GenerationStage)) {
      recordModelOutcome(
        attempt.model,
        attempt.stage as GenerationStage,
        semanticStatus === "SUCCESS",
        attempt.latency_ms ?? 0,
      );
    }
    return NextResponse.json({ ok: true, updated: result.updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal update semantic status." },
      { status: 500 },
    );
  }
}
