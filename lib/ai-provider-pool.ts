export type AiProviderId = "invibuilder";

export type AiProvider = {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  apiKey: string;
};

function normaliseBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Builds the server-only provider pool. Keys are deliberately read only from
 * environment variables and are never returned to a route response.
 */
export function getConfiguredAiProviders(): AiProvider[] {
  const providers: AiProvider[] = [];

  const invibuilderKey = process.env.INVIBUILDER_API_KEY?.trim();
  if (invibuilderKey) {
    providers.push({
      id: "invibuilder",
      name: "InviBuilder AI Gateway",
      baseUrl: normaliseBaseUrl(process.env.INVIBUILDER_BASE_URL || "https://api.invibuilder.com/api/v1"),
      apiKey: invibuilderKey,
    });
  }

  return providers;
}

export function shouldFailOverProvider(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404 || status === 429 || status >= 500;
}
