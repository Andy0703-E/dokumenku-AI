/** Server-owned telemetry fields for a terminal, usable draft. */
export function terminalDraftTelemetry(now: string) {
  return {
    creditResult: "CAPTURED",
    draftReadyAt: now,
    finalizedAt: now,
    finalStatus: "DRAFT_READY",
  } as const;
}
