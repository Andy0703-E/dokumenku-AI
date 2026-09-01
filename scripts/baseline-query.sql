-- Baseline metrics query for load test
-- Run after each generation to collect timing/quality/provider data

-- 1. Per-generation summary
SELECT
  gt.generation_id,
  gt.total_duration_ms,
  gt.blueprint_ms + gt.prd_ms + gt.tech_stack_ms + gt.ui_ux_ms + gt.schema_ms AS total_generate_ms,
  gt.fast_gate_ms,
  gt.targeted_repair_ms,
  gt.alignment_ms,
  gt.quality_gate_ms,
  gt.quality_path,
  gt.final_status,
  gt.findings_count,
  gt.findings_breakdown,
  gt.models_used,
  gt.fallback_count,
  gt.provider_count,
  gt.credit_result,
  gt.draft_ready_at,
  gt.finalized_at,
  -- Quality overhead = time from draft ready to final
  CASE
    WHEN gt.draft_ready_at IS NOT NULL AND gt.finalized_at IS NOT NULL
    THEN (julianday(gt.finalized_at) - julianday(gt.draft_ready_at)) * 86400000
    ELSE NULL
  END AS quality_overhead_ms
FROM generation_telemetry gt
WHERE gt.created_at >= datetime('now', '-1 hour')
ORDER BY gt.created_at DESC;

-- 2. Provider attempt breakdown per generation
SELECT
  pa.generation_id,
  pa.stage,
  pa.operation_id,
  pa.provider,
  pa.model,
  pa.attempt,
  pa.latency_ms,
  pa.transport_success,
  pa.semantic_status,
  pa.http_status,
  pa.fallback_reason_code,
  pa.fallback_reason_detail
FROM provider_attempts pa
JOIN generation_telemetry gt ON gt.generation_id = pa.generation_id
WHERE gt.created_at >= datetime('now', '-1 hour')
ORDER BY pa.generation_id, pa.stage, pa.attempt;

-- 3. Aggregate metrics (for baseline summary)
SELECT
  COUNT(*) AS total_generations,
  SUM(CASE WHEN final_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN final_status = 'DRAFT_READY' THEN 1 ELSE 0 END) AS draft_ready,
  SUM(CASE WHEN final_status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
  -- Latency percentiles (approximate for SQLite)
  AVG(total_duration_ms) AS avg_total_ms,
  MIN(total_duration_ms) AS min_total_ms,
  MAX(total_duration_ms) AS max_total_ms,
  -- Quality path distribution
  SUM(CASE WHEN quality_path = 'FAST_PASS' THEN 1 ELSE 0 END) AS fast_pass_count,
  SUM(CASE WHEN quality_path = 'TARGETED_REPAIR' THEN 1 ELSE 0 END) AS targeted_repair_count,
  SUM(CASE WHEN quality_path = 'TARGETED_REPAIR_ALIGNMENT' THEN 1 ELSE 0 END) AS alignment_count,
  SUM(CASE WHEN quality_path = 'READY_WITH_WARNINGS' THEN 1 ELSE 0 END) AS warnings_count,
  -- Credit
  SUM(CASE WHEN credit_result = 'CAPTURED' THEN 1 ELSE 0 END) AS credit_captured,
  SUM(CASE WHEN credit_result = 'RELEASED' THEN 1 ELSE 0 END) AS credit_released
FROM generation_telemetry
WHERE created_at >= datetime('now', '-1 hour');

-- 4. Provider health
SELECT
  pa.provider,
  pa.model,
  COUNT(*) AS total_attempts,
  SUM(CASE WHEN pa.transport_success = 1 THEN 1 ELSE 0 END) AS transport_success,
  SUM(CASE WHEN pa.semantic_status = 'SUCCESS' THEN 1 ELSE 0 END) AS semantic_success,
  SUM(CASE WHEN pa.semantic_status = 'FAILED' THEN 1 ELSE 0 END) AS semantic_failed,
  SUM(CASE WHEN pa.semantic_status = 'UNKNOWN' THEN 1 ELSE 0 END) AS semantic_unknown,
  SUM(CASE WHEN pa.http_status = 429 THEN 1 ELSE 0 END) AS count_429,
  SUM(CASE WHEN pa.http_status IN (500, 502, 503) THEN 1 ELSE 0 END) AS count_5xx,
  AVG(pa.latency_ms) AS avg_latency_ms
FROM provider_attempts pa
JOIN generation_telemetry gt ON gt.generation_id = pa.generation_id
WHERE gt.created_at >= datetime('now', '-1 hour')
GROUP BY pa.provider, pa.model
ORDER BY total_attempts DESC;

-- 5. Stale UNKNOWN detection
SELECT
  pa.attempt_id,
  pa.generation_id,
  pa.stage,
  pa.model,
  pa.created_at,
  gt.final_status,
  CAST((julianday('now') - julianday(pa.created_at)) * 86400 AS INTEGER) AS age_seconds
FROM provider_attempts pa
JOIN generation_telemetry gt ON gt.generation_id = pa.generation_id
WHERE pa.semantic_status = 'UNKNOWN'
  AND gt.final_status IN ('COMPLETED', 'DRAFT_READY', 'FAILED')
  AND (julianday('now') - julianday(pa.created_at)) * 86400 > 600
ORDER BY pa.created_at;

-- 6. Invariant checks
-- Double credit capture check
SELECT generation_id, COUNT(*) AS capture_count
FROM generation_telemetry
WHERE credit_result = 'CAPTURED'
  AND created_at >= datetime('now', '-1 hour')
GROUP BY generation_id
HAVING COUNT(*) > 1;

-- Duplicate finalization check
SELECT generation_id, COUNT(*) AS finalize_count
FROM document_generations
WHERE status = 'COMPLETED'
  AND completed_at >= datetime('now', '-1 hour')
GROUP BY generation_id
HAVING COUNT(*) > 1;

-- Duplicate provider attempt check (same generation + stage + attempt)
SELECT generation_id, stage, attempt, COUNT(*) AS dupe_count
FROM provider_attempts
WHERE created_at >= datetime('now', '-1 hour')
GROUP BY generation_id, stage, operation_id, attempt
HAVING COUNT(*) > 1;
