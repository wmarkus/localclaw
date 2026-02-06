import type { ToolCallIdMode } from "./tool-call-id.js";

export type TranscriptSanitizeMode = "full" | "images-only";

export type TranscriptPolicy = {
  sanitizeMode: TranscriptSanitizeMode;
  sanitizeToolCallIds: boolean;
  toolCallIdMode?: ToolCallIdMode;
  repairToolUseResultPairing: boolean;
  preserveSignatures: boolean;
  sanitizeThoughtSignatures?: {
    allowBase64Only?: boolean;
    includeCamelCase?: boolean;
  };
  allowSyntheticToolResults: boolean;
};

export function resolveTranscriptPolicy(): TranscriptPolicy {
  return {
    sanitizeMode: "images-only",
    sanitizeToolCallIds: false,
    toolCallIdMode: undefined,
    repairToolUseResultPairing: false,
    preserveSignatures: false,
    sanitizeThoughtSignatures: undefined,
    allowSyntheticToolResults: false,
  };
}
