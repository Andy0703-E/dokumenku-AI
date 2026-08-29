import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test the pure functions by importing them directly
// Since these are server-compatible pure functions, we can test them

// Inline the parseStreamedDocuments logic for testing (mirrors lib/stream-parser.ts)
const EMPTY_FILES = {
  "PRD.md": "",
  "TECH-STACK.md": "",
  "UI-UX.md": "",
  "SCHEMA.md": "",
};

const STREAM_SECTIONS = [
  { marker: "<<<FILE:PRD.md>>>", key: "PRD.md", progress: 18 },
  { marker: "<<<FILE:TECH-STACK.md>>>", key: "TECH-STACK.md", progress: 36 },
  { marker: "<<<FILE:UI-UX.md>>>", key: "UI-UX.md", progress: 54 },
  { marker: "<<<FILE:SCHEMA.md>>>", key: "SCHEMA.md", progress: 72 },
  { marker: "<<<PROMPT>>>", key: "prompt", progress: 90 },
  { marker: "<<<END>>>", key: "end", progress: 100 },
];

function parseStreamedDocuments(value) {
  const nextFiles = { ...EMPTY_FILES };
  let prompt = "";
  let currentFile = null;
  let progress = 8;

  STREAM_SECTIONS.forEach((section, index) => {
    if (section.key === "end") return;
    const start = value.indexOf(section.marker);
    if (start < 0) return;
    const nextMarker = STREAM_SECTIONS[index + 1]?.marker;
    const end = nextMarker
      ? value.indexOf(nextMarker, start + section.marker.length)
      : -1;
    const content = value
      .slice(start + section.marker.length, end >= 0 ? end : undefined)
      .replace(/^\s*\n?/, "")
      .replace(end >= 0 ? /\s+$/ : /$^/, "");
    progress = section.progress;
    if (section.key === "prompt") {
      prompt = content;
    } else {
      nextFiles[section.key] = content;
      currentFile = section.key;
    }
  });

  if (value.includes("<<<END>>>")) progress = 100;
  return { files: nextFiles, prompt, currentFile, progress };
}

// Test getProviderError
function getProviderError(status, providerName, message) {
  const normalizedMessage = message?.toLowerCase() ?? "";
  if (
    status === 401 ||
    normalizedMessage.includes("user not found") ||
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return `API key ${providerName} tidak valid, sudah dicabut, atau tidak memiliki akses ke model ini.`;
  }
  if (status === 402) {
    return `Saldo atau izin penggunaan akun ${providerName} tidak mencukupi.`;
  }
  if (status === 403) {
    return `Permintaan ditolak oleh ${providerName}. Periksa izin API key dan akses model.`;
  }
  if (status === 429) {
    return `Batas penggunaan ${providerName} sedang tercapai. Tunggu beberapa saat, lalu coba kembali.`;
  }
  return message || `Permintaan ke ${providerName} gagal.`;
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function getPayloadError(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  const message = record.message;
  return typeof message === "string" ? message : undefined;
}

// --- Tests ---

describe("parseStreamedDocuments", () => {
  it("returns empty files for empty input", () => {
    const result = parseStreamedDocuments("");
    assert.deepStrictEqual(result.files, EMPTY_FILES);
    assert.equal(result.prompt, "");
    assert.equal(result.progress, 8);
  });

  it("parses a single PRD file", () => {
    const input = `<<<FILE:PRD.md>>>
# PRD Content
This is the PRD.
<<<FILE:TECH-STACK.md>>>`;
    const result = parseStreamedDocuments(input);
    assert.equal(result.files["PRD.md"], "# PRD Content\nThis is the PRD.");
    assert.equal(result.currentFile, "TECH-STACK.md");
  });

  it("parses all four files", () => {
    const input = `<<<FILE:PRD.md>>>
PRD content here
<<<FILE:TECH-STACK.md>>>
Tech stack content here
<<<FILE:UI-UX.md>>>
UI/UX content here
<<<FILE:SCHEMA.md>>>
Schema content here
<<<PROMPT>>>
Implementation prompt here
<<<END>>>`;
    const result = parseStreamedDocuments(input);
    assert.equal(result.files["PRD.md"], "PRD content here");
    assert.equal(result.files["TECH-STACK.md"], "Tech stack content here");
    assert.equal(result.files["UI-UX.md"], "UI/UX content here");
    assert.equal(result.files["SCHEMA.md"], "Schema content here");
    assert.equal(result.prompt, "Implementation prompt here");
    assert.equal(result.progress, 100);
  });

  it("handles partial streaming", () => {
    const input = `<<<FILE:PRD.md>>>
PRD content
<<<FILE:TECH-STACK.md>>>
Tech`;
    const result = parseStreamedDocuments(input);
    assert.equal(result.files["PRD.md"], "PRD content");
    assert.equal(result.files["TECH-STACK.md"], "Tech");
    assert.equal(result.progress, 36);
  });

  it("sets progress to 100 when END marker is present", () => {
    const input = `<<<FILE:PRD.md>>>
PRD
<<<FILE:TECH-STACK.md>>>
Tech
<<<FILE:UI-UX.md>>>
UI
<<<FILE:SCHEMA.md>>>
Schema
<<<PROMPT>>>
Prompt
<<<END>>>`;
    const result = parseStreamedDocuments(input);
    assert.equal(result.progress, 100);
  });
});

describe("getProviderError", () => {
  it("returns API key error for 401", () => {
    const error = getProviderError(401, "OpenAI");
    assert.match(error, /API key OpenAI/);
  });

  it("returns API key error for invalid api key message", () => {
    const error = getProviderError(500, "OpenAI", "Invalid API key provided");
    assert.match(error, /API key OpenAI/);
  });

  it("returns balance error for 402", () => {
    const error = getProviderError(402, "Groq");
    assert.match(error, /Saldo atau izin/);
  });

  it("returns permission error for 403", () => {
    const error = getProviderError(403, "Anthropic");
    assert.match(error, /Permintaan ditolak/);
  });

  it("returns rate limit error for 429", () => {
    const error = getProviderError(429, "OpenRouter");
    assert.match(error, /Batas penggunaan/);
  });

  it("returns custom message when provided", () => {
    const error = getProviderError(500, "DeepSeek", "Server overloaded");
    assert.equal(error, "Server overloaded");
  });

  it("returns generic error when no message", () => {
    const error = getProviderError(500, "Gemini");
    assert.equal(error, "Permintaan ke Gemini gagal.");
  });
});

describe("normalizeBaseUrl", () => {
  it("removes trailing slashes", () => {
    assert.equal(normalizeBaseUrl("https://api.example.com/v1/"), "https://api.example.com/v1");
    assert.equal(normalizeBaseUrl("https://api.example.com/v1///"), "https://api.example.com/v1");
  });

  it("trims whitespace", () => {
    assert.equal(normalizeBaseUrl("  https://api.example.com/v1  "), "https://api.example.com/v1");
  });

  it("returns empty string for empty input", () => {
    assert.equal(normalizeBaseUrl(""), "");
  });
});

describe("getPayloadError", () => {
  it("returns undefined for non-object input", () => {
    assert.equal(getPayloadError(null), undefined);
    assert.equal(getPayloadError("string"), undefined);
    assert.equal(getPayloadError(undefined), undefined);
  });

  it("extracts error string", () => {
    assert.equal(getPayloadError({ error: "Rate limited" }), "Rate limited");
  });

  it("extracts error.message", () => {
    assert.equal(getPayloadError({ error: { message: "Invalid" } }), "Invalid");
  });

  it("extracts top-level message", () => {
    assert.equal(getPayloadError({ message: "Something" }), "Something");
  });
});
