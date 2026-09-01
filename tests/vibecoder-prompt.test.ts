import test from "node:test";
import assert from "node:assert/strict";

import type { GeneratedFiles } from "../lib/types";

async function promptModule() {
  return import(new URL("../lib/vibecoder-prompt.ts", import.meta.url).href);
}

test("hasAllDocumentsReady correctly detects completion of all 4 documents", async () => {
  const { hasAllDocumentsReady } = await promptModule();
  const emptyFiles: GeneratedFiles = {
    "PRD.md": "",
    "TECH-STACK.md": "",
    "UI-UX.md": "",
    "SCHEMA.md": "",
  };
  assert.equal(hasAllDocumentsReady(emptyFiles), false);

  const partialFiles: GeneratedFiles = {
    "PRD.md": "# PRD\nContent",
    "TECH-STACK.md": "# Tech Stack\nContent",
    "UI-UX.md": "# UI/UX\nContent",
    "SCHEMA.md": "",
  };
  assert.equal(hasAllDocumentsReady(partialFiles), false);

  const completeFiles: GeneratedFiles = {
    "PRD.md": "# PRD\nProduct requirements for E-Commerce",
    "TECH-STACK.md": "# Tech Stack\nNext.js, Tailwind, PostgreSQL",
    "UI-UX.md": "# UI-UX\nColors, typography, wireframes",
    "SCHEMA.md": "# Schema\nUsers, Orders, Products tables",
  };
  assert.equal(hasAllDocumentsReady(completeFiles), true);
});

test("generateVibeCoderPrompt produces a complete master prompt containing all 4 documents and roadmap", async () => {
  const { generateVibeCoderPrompt } = await promptModule();
  const completeFiles: GeneratedFiles = {
    "PRD.md": "# PRD Proyek Toko\nFitur: Checkout, Keranjang",
    "TECH-STACK.md": "# Tech Stack Proyek Toko\nStack: Next.js 15, Prisma",
    "UI-UX.md": "# UI/UX Proyek Toko\nDesign System: #0D9488",
    "SCHEMA.md": "# Database Schema\nTable: Users, Orders",
  };

  const prompt = generateVibeCoderPrompt(completeFiles, "Toko Online Mantap");

  // Verify Project Name in Title
  assert.ok(prompt.includes("TOKO ONLINE MANTAP"));

  // Verify Role & Execution Plan
  assert.ok(prompt.includes("Senior Principal Software Architect & Lead Full-Stack Developer"));
  assert.ok(prompt.includes("FASE 1: Project Scaffolding & Setup Lingkungan"));
  assert.ok(prompt.includes("FASE 2: Database Layer & ORM Modeling"));
  assert.ok(prompt.includes("FASE 3: Backend API, Authentication & Business Rules"));
  assert.ok(prompt.includes("FASE 4: Frontend Layout, Design System & UI Components"));
  assert.ok(prompt.includes("FASE 5: Integrasi Full-Stack & State Management"));
  assert.ok(prompt.includes("FASE 6: Validasi & Edge-Case Testing"));

  // Verify all 4 documents are embedded intact
  assert.ok(prompt.includes("DOKUMEN 1 / 4: PRD.md"));
  assert.ok(prompt.includes("# PRD Proyek Toko\nFitur: Checkout, Keranjang"));

  assert.ok(prompt.includes("DOKUMEN 2 / 4: TECH-STACK.md"));
  assert.ok(prompt.includes("# Tech Stack Proyek Toko\nStack: Next.js 15, Prisma"));

  assert.ok(prompt.includes("DOKUMEN 3 / 4: UI-UX.md"));
  assert.ok(prompt.includes("# UI/UX Proyek Toko\nDesign System: #0D9488"));

  assert.ok(prompt.includes("DOKUMEN 4 / 4: SCHEMA.md"));
  assert.ok(prompt.includes("# Database Schema\nTable: Users, Orders"));
});
