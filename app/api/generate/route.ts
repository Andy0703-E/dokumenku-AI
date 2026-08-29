import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isFlagshipModel } from "@/lib/models-config";

const PROVIDER_BASE_URL = "https://bandelbanget.xyz/v1";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { generationId, selectedModel, userContent, systemPrompt, maxOutputTokens = 24000 } = body;
  const apiKey = process.env.BANDELBANGET_API_KEY;

  if (!apiKey || !selectedModel || !userContent || !systemPrompt) {
    return NextResponse.json(
      { error: "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu." },
      { status: 503 },
    );
  }

  if (!generationId) {
    return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid." }, { status: 401 });
  }

  const modelId = String(selectedModel).trim();
  const isFlagship = isFlagshipModel(modelId);
  const user = await getCurrentUser();
  const isRevision = typeof generationId === "string" && generationId.startsWith("rev-");

  if (!isRevision && user) {
    try {
      const db = await getDatabase();
      const generationResult = await db.execute({
        sql: "SELECT id, status FROM document_generations WHERE id = ? AND user_email = ? AND status IN ('RESERVED', 'GENERATING', 'FINALIZE_FAILED')",
        args: [generationId, user.email],
      });
      const generation = generationResult.rows[0] as unknown as { id: string; status: string } | undefined;
      if (!generation) {
        return NextResponse.json({ error: "Sesi pembuatan dokumen tidak valid atau bukan milik akun Anda." }, { status: 403 });
      }

      if (generation.status !== "GENERATING") {
        await db.execute({ sql: "UPDATE document_generations SET status = 'GENERATING' WHERE id = ?", args: [generationId] });
      }

      if (isFlagship && user.role !== "admin") {
        const purchasedResult = await db.execute({
          sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
          args: [user.email],
        });
        if (!purchasedResult.rows[0]) {
          return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
        }
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Pembuatan dokumen tidak dapat diverifikasi." }, { status: 503 });
    }
  } else if (isRevision && user && isFlagship && user.role !== "admin") {
    try {
      const db = await getDatabase();
      const purchasedResult = await db.execute({
        sql: "SELECT 1 FROM credit_transactions WHERE user_email = ? AND amount > 3 AND reason != 'Kredit awal akun baru' LIMIT 1",
        args: [user.email],
      });
      if (!purchasedResult.rows[0]) {
        return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun yang telah membeli paket Pro." }, { status: 403 });
      }
    } catch {
      // ignore
    }
  } else if (!user && isFlagship) {
    return NextResponse.json({ error: "Model Flagship hanya tersedia untuk akun Pro Studio." }, { status: 403 });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${PROVIDER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        temperature: 0.25,
        max_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Tidak dapat terhubung ke bandelbanget.xyz. Coba beberapa saat lagi." }, { status: 502 });
  }

  if (!upstreamResponse.ok) {
    const errorPayload = await upstreamResponse.text();
    try {
      return NextResponse.json(JSON.parse(errorPayload), { status: upstreamResponse.status });
    } catch {
      return NextResponse.json({ error: errorPayload || `Provider merespons HTTP ${upstreamResponse.status}.` }, { status: upstreamResponse.status });
    }
  }

  const upstreamContentType = upstreamResponse.headers.get("content-type") ?? "";
  if (!upstreamContentType.includes("text/event-stream")) {
    const result = await upstreamResponse.json();
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new NextResponse(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  }

  return new NextResponse(upstreamResponse.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
