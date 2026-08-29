import type { ProviderStreamEvent } from "./types";

export function getProviderError(
  status: number,
  providerName: string,
  message?: string,
  modelId?: string,
): string {
  const normalizedMessage = message?.toLowerCase() ?? "";
  const modelLabel = modelId ? ` '${modelId}'` : "";

  if (status === 401 || normalizedMessage.includes("invalid api key")) {
    return "Layanan belum dikonfigurasi oleh admin atau API key tidak valid.";
  }
  if (
    status === 402 ||
    normalizedMessage.includes("insufficient_quota") ||
    normalizedMessage.includes("balance") ||
    normalizedMessage.includes("saldo")
  ) {
    return `Saldo atau kuota layanan AI tidak mencukupi di server upstream. Silakan hubungi admin.`;
  }
  if (
    status === 404 ||
    normalizedMessage.includes("model_not_found") ||
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("not found")
  ) {
    return `Model AI${modelLabel} tidak ditemukan atau sedang dinonaktifkan di server upstream. Silakan pilih model lain dari daftar.`;
  }
  if (status === 403 || normalizedMessage.includes("permission_denied") || normalizedMessage.includes("access_denied")) {
    return `Model AI${modelLabel} tidak dapat diakses atau dibatasi oleh provider upstream. Silakan coba model alternatif.`;
  }
  if (
    status === 429 ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("quota exceeded")
  ) {
    return `Model AI${modelLabel} sedang mencapai batas frekuensi (rate limit) di server AI. Silakan ganti ke model lain atau tunggu sebentar.`;
  }
  if (
    status >= 500 ||
    normalizedMessage.includes("server error") ||
    normalizedMessage.includes("overloaded") ||
    normalizedMessage.includes("bad gateway") ||
    normalizedMessage.includes("service unavailable")
  ) {
    return `Model AI${modelLabel} sedang mengalami gangguan atau kelebihan beban di server upstream. Silakan pilih model alternatif (kredit Anda aman).`;
  }
  return message || `Model AI${modelLabel} tidak dapat memproses permintaan saat ini. Silakan coba model lain.`;
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
  };
}

export async function consumeProviderStream(
  response: Response,
  _providerKind: string,
  providerName: string,
  onUpdate: (update: { content: string; reasoning: string }) => void,
): Promise<void> {
  if (!response.body) throw new Error(`${providerName} tidak mengembalikan aliran respons.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeData = (rawData: string) => {
    const data = rawData.trim();
    if (!data || data === "[DONE]") return;
    try {
      onUpdate(getStreamDelta(JSON.parse(data) as ProviderStreamEvent, providerName));
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
}

export async function requestDocumentStream(
  generationId: string,
  selectedModel: string,
  userContent: string,
  systemPrompt: string,
  maxOutputTokens: number,
): Promise<Response> {
  return fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generationId, selectedModel, userContent, systemPrompt, maxOutputTokens }),
  });
}
