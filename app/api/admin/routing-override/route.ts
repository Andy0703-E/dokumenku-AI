import { NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getDatabase, upsertModelOverride, deleteModelOverride, loadModelOverrides } from "@/db";
import { setAdminRoutingOverride, getAdminRoutingOverrides, type GenerationStage } from "@/lib/model-router";
import { apiError, apiSuccess, generateRequestId } from "@/lib/errors";

const VALID_STAGES: GenerationStage[] = [
  "blueprint", "prd", "tech-stack", "ui-ux", "schema",
  "targeted-repair", "alignment",
];

// POST: Set routing override (persisted to DB)
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const admin = await getCurrentAdmin();
  if (!admin) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  const body = await request.json().catch(() => ({}));
  const { stage, modelId } = body as { stage?: string; modelId?: string };

  if (!stage || !VALID_STAGES.includes(stage as GenerationStage)) {
    return apiError("VALIDATION_FAILED", `stage must be one of: ${VALID_STAGES.join(", ")}`, 400, requestId);
  }
  if (!modelId || typeof modelId !== "string") {
    return apiError("VALIDATION_FAILED", "modelId required.", 400, requestId);
  }

  // Set in-memory override
  setAdminRoutingOverride(stage as GenerationStage, modelId);

  // Persist to DB
  try {
    const db = await getDatabase();
    await upsertModelOverride(db, {
      overrideType: "routing",
      targetKey: stage,
      value: modelId,
      note: `Admin override for stage ${stage}`,
      createdBy: admin.email,
    });
  } catch {
    // In-memory override still works
  }

  return apiSuccess({ ok: true, stage, modelId }, 200, requestId);
}

// DELETE: Remove routing override
export async function DELETE(request: NextRequest) {
  const requestId = generateRequestId();
  const admin = await getCurrentAdmin();
  if (!admin) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  const { stage } = (await request.json().catch(() => ({}))) as { stage?: string };
  if (!stage || !VALID_STAGES.includes(stage as GenerationStage)) {
    return apiError("VALIDATION_FAILED", "Valid stage required.", 400, requestId);
  }

  setAdminRoutingOverride(stage as GenerationStage, "auto");

  try {
    const db = await getDatabase();
    await deleteModelOverride(db, "routing", stage);
  } catch {
    // continue
  }

  return apiSuccess({ ok: true, stage, modelId: "auto" }, 200, requestId);
}

// GET: List routing overrides
export async function GET() {
  const requestId = generateRequestId();
  if (!(await getCurrentAdmin())) {
    return apiError("AUTH_FORBIDDEN", "Admin only.", 403, requestId);
  }

  return apiSuccess(getAdminRoutingOverrides(), 200, requestId);
}
