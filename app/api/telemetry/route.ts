import { NextRequest, NextResponse } from "next/server";

import { getDatabase, storeGenerationTelemetry } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const generationId = typeof body.generationId === "string" ? body.generationId.trim() : "";
  if (!generationId) {
    return NextResponse.json({ error: "generationId wajib." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    await storeGenerationTelemetry(db, {
      generationId,
      userEmail: user.email,
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
      qualityPath: typeof body.qualityPath === "string" ? body.qualityPath : undefined,
      finalStatus: typeof body.finalStatus === "string" ? body.finalStatus : undefined,
      totalDurationMs: typeof body.totalDurationMs === "number" ? body.totalDurationMs : undefined,
      blueprintMs: typeof body.blueprintMs === "number" ? body.blueprintMs : undefined,
      prdMs: typeof body.prdMs === "number" ? body.prdMs : undefined,
      techStackMs: typeof body.techStackMs === "number" ? body.techStackMs : undefined,
      uiUxMs: typeof body.uiUxMs === "number" ? body.uiUxMs : undefined,
      schemaMs: typeof body.schemaMs === "number" ? body.schemaMs : undefined,
      qualityGateMs: typeof body.qualityGateMs === "number" ? body.qualityGateMs : undefined,
      targetedRepairMs: typeof body.targetedRepairMs === "number" ? body.targetedRepairMs : undefined,
      alignmentMs: typeof body.alignmentMs === "number" ? body.alignmentMs : undefined,
      targetedRepairCount: typeof body.targetedRepairCount === "number" ? body.targetedRepairCount : undefined,
      alignmentUsed: typeof body.alignmentUsed === "boolean" ? body.alignmentUsed : undefined,
      findingsCount: typeof body.findingsCount === "number" ? body.findingsCount : undefined,
      findingsBreakdown: typeof body.findingsBreakdown === "object" && body.findingsBreakdown !== null
        ? body.findingsBreakdown as Record<string, number>
        : undefined,
      modelsUsed: typeof body.modelsUsed === "object" ? body.modelsUsed as Record<string, unknown> : undefined,
      fallbackCount: typeof body.fallbackCount === "number" ? body.fallbackCount : undefined,
      providerCount: typeof body.providerCount === "number" ? body.providerCount : undefined,
      routingVersion: typeof body.routingVersion === "string" ? body.routingVersion : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal menyimpan telemetry." },
      { status: 500 },
    );
  }
}
