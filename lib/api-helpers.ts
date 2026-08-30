import type { ProviderStreamEvent } from "./types";

export function getProviderError(
  status: number,
  providerName: string,
  message?: string,
  modelId?: string,
): string {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("maintenance") ||
    normalizedMessage.includes("pemeliharaan")
  ) {
    return "Provider AI sedang dalam maintenance. Pembuatan dokumen sementara tidak tersedia; silakan coba kembali beberapa saat lagi. Kredit Anda tetap aman.";
  }
  if (status === 401 || normalizedMessage.includes("invalid api key")) {
    return "Layanan belum dikonfigurasi oleh admin atau API key tidak valid.";
  }
  if (
    status === 402 ||
    normalizedMessage.includes("insufficient_quota") ||
    normalizedMessage.includes("balance") ||
    normalizedMessage.includes("saldo")
  ) {
    return "Saldo atau kuota layanan AI tidak mencukupi di server upstream. Silakan hubungi admin. Kredit Anda tetap aman.";
  }
  if (
    status === 404 ||
    normalizedMessage.includes("model_not_found") ||
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("not found")
  ) {
    return "Model AI yang tersedia sedang tidak dapat digunakan. Silakan coba kembali beberapa saat lagi. Kredit Anda tetap aman.";
  }
  if (status === 403 || normalizedMessage.includes("permission_denied") || normalizedMessage.includes("access_denied")) {
    return "Model AI tidak dapat diakses di server upstream. Silakan coba kembali beberapa saat lagi. Kredit Anda tetap aman.";
  }
  if (
    status === 429 ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("quota exceeded")
  ) {
    return "Server AI sedang mencapai batas frekuensi (rate limit). Silakan tunggu beberapa saat lalu coba lagi. Kredit Anda tetap aman.";
  }
  if (
    status >= 500 ||
    normalizedMessage.includes("server error") ||
    normalizedMessage.includes("overloaded") ||
    normalizedMessage.includes("bad gateway") ||
    normalizedMessage.includes("service unavailable")
  ) {
    return "Server upstream sedang mengalami gangguan atau kelebihan beban. Silakan coba kembali beberapa saat lagi. Kredit Anda tetap aman.";
  }
  return message || "Server AI tidak dapat memproses permintaan saat ini. Silakan coba kembali. Kredit Anda tetap aman.";
}

export function getPayloadError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return typeof record.message === "string" ? record.message : undefined;
}

function getTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(getTextContent).join("");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return getTextContent(record.text) || getTextContent(record.content) || getTextContent(record.value);
}

function getStreamDelta(event: ProviderStreamEvent, providerName: string) {
  if (event.error) {
    throw new Error(getProviderError(event.error.code ?? 500, providerName, event.error.message));
  }
  const choice = event.choices?.[0];
  return {
    content:
      getTextContent(choice?.delta?.content) ||
      getTextContent(choice?.delta?.text) ||
      getTextContent(choice?.message?.content) ||
      getTextContent(choice?.text) ||
      getTextContent(event.output_text) ||
      getTextContent(event.response) ||
      getTextContent(event.content),
    reasoning: getTextContent(choice?.delta?.reasoning_content),
    finishReason: choice?.finish_reason ?? null,
  };
}

export type StreamConsumeResult = {
  finishReason: string | null;
};

export async function consumeProviderStream(
  response: Response,
  _providerKind: string,
  providerName: string,
  onUpdate: (update: { content: string; reasoning: string }) => void,
): Promise<StreamConsumeResult> {
  if (!response.body) throw new Error(`${providerName} tidak mengembalikan aliran respons.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastFinishReason: string | null = null;

  const consumeData = (rawData: string) => {
    const data = rawData.trim();
    if (!data || data === "[DONE]") return;
    try {
      const delta = getStreamDelta(JSON.parse(data) as ProviderStreamEvent, providerName);
      if (delta.finishReason) lastFinishReason = delta.finishReason;
      onUpdate(delta);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`${providerName} mengirim format stream yang tidak valid.`);
      }
      throw error;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach((line) => {
      if (line.startsWith("data:")) consumeData(line.slice(5));
    });
  }

  buffer += decoder.decode();
  if (buffer.trim().startsWith("data:")) consumeData(buffer.trim().slice(5));

  return { finishReason: lastFinishReason };
}

export async function requestDocumentStream(
  generationId: string,
  selectedModel: string,
  userContent: string,
  systemPrompt: string,
  maxOutputTokens: number,
  stage?: string,
): Promise<Response> {
  return fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generationId, selectedModel, userContent, systemPrompt, maxOutputTokens, stage }),
  });
}
