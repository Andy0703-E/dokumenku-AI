export type SemanticStatus = "SUCCESS" | "FAILED";

export type SemanticFailureCode =
  | "EMPTY_OUTPUT"
  | "OUTPUT_TRUNCATED"
  | "INVALID_STRUCTURED_OUTPUT"
  | "SEMANTIC_VALIDATION_FAILED";

export type SemanticOutcomeReporter = (
  attemptId: string,
  status: SemanticStatus,
  failureCode?: SemanticFailureCode,
) => Promise<void>;

export type SemanticAttemptContext = {
  output?: string;
  finishReason?: string | null;
};

/**
 * The lifecycle ID is independent of optional display metadata such as the
 * routed model. A valid HTTP 200 can still be reported when that metadata is
 * omitted by an intermediary.
 */
export function extractSemanticAttemptId(headers: Pick<Headers, "get">): string | undefined {
  return headers.get("X-Attempt-Id") || undefined;
}

export class SemanticValidationError extends Error {
  readonly failureCode: SemanticFailureCode;

  constructor(
    message: string,
    failureCode: SemanticFailureCode,
  ) {
    super(message);
    this.name = "SemanticValidationError";
    this.failureCode = failureCode;
  }
}

/**
 * Produces the telemetry failure code from the output that reached semantic
 * validation. This keeps all client lifecycle paths consistent.
 */
export function classifySemanticFailure(
  error: unknown,
  { output = "", finishReason }: SemanticAttemptContext = {},
): SemanticFailureCode {
  if (error instanceof SemanticValidationError) return error.failureCode;

  const normalizedOutput = output.trim();
  if (!normalizedOutput) return "EMPTY_OUTPUT";

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    finishReason === "length"
    || finishReason === "content_filter"
    || /(?:terpotong|belum lengkap|truncated|timed out|timeout|melewati batas|content_filter|filter)/i.test(message)
    || (normalizedOutput.match(/```/g) || []).length % 2 !== 0
  ) {
    return "OUTPUT_TRUNCATED";
  }

  if (
    error instanceof SyntaxError
    || /(?:json|structured output|format stream|unexpected token|unterminated)/i.test(message)
  ) {
    return "INVALID_STRUCTURED_OUTPUT";
  }

  return "SEMANTIC_VALIDATION_FAILED";
}

/**
 * Closes an HTTP-successful provider attempt exactly once after its semantic
 * validator accepts or rejects the generated output. A missing attempt id is
 * allowed for legacy/no-telemetry responses and does not affect validation.
 */
export async function finalizeSemanticAttempt<T>(
  attemptId: string | undefined,
  validator: () => T | Promise<T>,
  report: SemanticOutcomeReporter,
  context: SemanticAttemptContext | (() => SemanticAttemptContext) = {},
): Promise<T> {
  const getContext = typeof context === "function" ? context : () => context;
  try {
    const result = await validator();
    if (attemptId) await report(attemptId, "SUCCESS");
    return result;
  } catch (error) {
    const ctx = getContext();
    console.warn(`[SEMANTIC_FINALIZE_FAILED] attemptId=${attemptId} error=${error instanceof Error ? error.message : String(error)} output_length=${ctx.output?.length ?? "unknown"} finishReason=${ctx.finishReason ?? "unknown"}`);
    if (attemptId) {
      await report(attemptId, "FAILED", classifySemanticFailure(error, getContext()));
    }
    throw error;
  }
}
