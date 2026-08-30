import assert from "node:assert/strict";
import test from "node:test";

async function revisionImpactModule() {
  return import(new URL("../lib/revision-impact.ts", import.meta.url).href);
}

test("role revisions identify all related documents", async () => {
  const { analyzeRevisionImpact } = await revisionImpactModule();
  const impact = analyzeRevisionImpact("SCHEMA.md", "Tambahkan role Super Admin dengan permission khusus.");

  assert.deepEqual(impact.affectedFiles, ["PRD.md", "TECH-STACK.md", "UI-UX.md"]);
  assert.match(impact.reasons.join(" "), /role atau permission/i);
});

test("schema-only index revision stays scoped until the user opts into sync", async () => {
  const { analyzeRevisionImpact } = await revisionImpactModule();
  const impact = analyzeRevisionImpact("SCHEMA.md", "Tambahkan index untuk query riwayat pengajuan.");

  assert.deepEqual(impact.affectedFiles, []);
});

test("line diff exposes inserted and removed content", async () => {
  const { createLineDiff } = await revisionImpactModule();
  const diff = createLineDiff("id\nstatus\ncreated_at", "id\nneeds_verification\ncreated_at");

  assert.deepEqual(diff.map((line: { kind: string; value: string }) => [line.kind, line.value]), [
    ["unchanged", "id"],
    ["removed", "status"],
    ["added", "needs_verification"],
    ["unchanged", "created_at"],
  ]);
});
