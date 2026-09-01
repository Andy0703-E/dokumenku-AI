export type InvibuilderQuota = {
  limit: number;
  usage: number;
  remaining: number;
  resetAt?: string;
  formattedRemaining?: string;
  planName?: string;
  activeUntil?: string;
  daysUntilExpiry?: number;
  isActive?: boolean;
  rateLimitRpm?: number;
  rateLimitRemaining?: number;
};

export type InvibuilderQuotaResult = {
  ok: boolean;
  quota?: InvibuilderQuota;
  error?: string;
};

/**
 * Fetch the current API key quota from Invibuilder Gateway.
 * Endpoint: GET /api/v1/key/quota
 *
 * Response structure:
 * {
 *   "status": "success",
 *   "data": {
 *     "key": { "name", "prefix", "is_active", ... },
 *     "key_quota": { "max_tokens_limit", "tokens_used", "remaining_key_tokens", ... },
 *     "account_balance": { "active_token_balance", "formatted_balance", "plan_name", ... },
 *     "rate_limits": { "limit_rpm", "remaining_rpm", ... }
 *   }
 * }
 */
export async function fetchInvibuilderQuota(
  baseUrl: string,
  apiKey: string,
): Promise<InvibuilderQuotaResult> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/key/quota`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const raw = await res.json() as Record<string, unknown>;
    const data = (raw.data ?? raw) as Record<string, unknown>;

    // Parse key_quota
    const keyQuota = data.key_quota as Record<string, unknown> | undefined;
    const limit = Number(keyQuota?.max_tokens_limit ?? 0);
    const usage = Number(keyQuota?.tokens_used ?? 0);
    const remaining = Number(keyQuota?.remaining_key_tokens ?? (limit - usage));
    const formattedRemaining = typeof keyQuota?.formatted_remaining === "string" ? keyQuota.formatted_remaining : undefined;

    // Parse account_balance
    const accountBalance = data.account_balance as Record<string, unknown> | undefined;
    const planName = typeof accountBalance?.plan_name === "string" ? accountBalance.plan_name : undefined;
    const activeUntil = typeof accountBalance?.active_until === "string" ? accountBalance.active_until : undefined;
    const daysUntilExpiry = typeof accountBalance?.days_until_expiry === "number" ? accountBalance.days_until_expiry : undefined;
    const isActive = typeof accountBalance?.is_balance_active === "boolean" ? accountBalance.is_balance_active : undefined;

    // Parse rate_limits
    const rateLimits = data.rate_limits as Record<string, unknown> | undefined;
    const rateLimitRpm = typeof rateLimits?.limit_rpm === "number" ? rateLimits.limit_rpm : undefined;
    const rateLimitRemaining = typeof rateLimits?.remaining_rpm === "number" ? rateLimits.remaining_rpm : undefined;

    // Parse key info for reset_at (use active_until as proxy)
    const resetAt = activeUntil;

    return {
      ok: true,
      quota: {
        limit,
        usage,
        remaining,
        resetAt,
        formattedRemaining,
        planName,
        activeUntil,
        daysUntilExpiry,
        isActive,
        rateLimitRpm,
        rateLimitRemaining,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengambil data kuota Invibuilder.",
    };
  }
}

/**
 * Format quota into a human-readable label.
 */
export function formatQuotaLabel(quota: InvibuilderQuota): string {
  if (quota.limit === 0 && quota.usage === 0) return "Unlimited / Unknown";
  const pct = quota.limit > 0 ? Math.round((quota.usage / quota.limit) * 100) : 0;
  if (quota.formattedRemaining) {
    return `${quota.formattedRemaining} tersisa (${pct}% terpakai)`;
  }
  return `${quota.usage.toLocaleString("id-ID")} / ${quota.limit.toLocaleString("id-ID")} (${pct}% terpakai)`;
}

/**
 * Returns a colour hint based on quota usage percentage.
 */
export function quotaStatusColour(quota: InvibuilderQuota): "ok" | "warn" | "danger" {
  if (quota.limit === 0) return "ok";
  const pct = (quota.usage / quota.limit) * 100;
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warn";
  return "ok";
}
