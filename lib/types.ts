export type FileName = "PRD.md" | "TECH-STACK.md" | "UI-UX.md" | "SCHEMA.md";
export type GeneratedFiles = Record<FileName, string>;
export type ProviderStreamEvent = {
  type?: string;
  error?: { code?: number; type?: string; message?: string };
  delta?: { type?: string; text?: string };
  content?: string;
  output_text?: string;
  response?: string;
  choices?: Array<{
    delta?: { content?: string; text?: string; reasoning_content?: string };
    message?: { content?: string };
    text?: string;
    finish_reason?: string | null;
  }>;
};
