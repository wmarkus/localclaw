import type { AgentMessage, AgentToolResult } from "@mariozechner/pi-agent-core";
import { sanitizeToolCallIds, type ToolCallIdMode } from "../tool-call-id.js";
import { sanitizeContentBlocksImages } from "../tool-images.js";
import { stripThoughtSignatures } from "./bootstrap.js";

type ContentBlock = AgentToolResult<unknown>["content"][number];

export function isEmptyAssistantMessageContent(
  message: Extract<AgentMessage, { role: "assistant" }>,
): boolean {
  const content = message.content;
  if (content == null) {
    return true;
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.every((block) => {
    if (!block || typeof block !== "object") {
      return true;
    }
    const rec = block as { type?: unknown; text?: unknown };
    if (rec.type !== "text") {
      return false;
    }
    return typeof rec.text !== "string" || rec.text.trim().length === 0;
  });
}

export async function sanitizeSessionMessagesImages(
  messages: AgentMessage[],
  label: string,
  options?: {
    sanitizeMode?: "full" | "images-only";
    sanitizeToolCallIds?: boolean;
    toolCallIdMode?: ToolCallIdMode;
  },
): Promise<AgentMessage[]> {
  const sanitizeMode = options?.sanitizeMode ?? "full";
  const allowNonImageSanitization = sanitizeMode === "full";
  const out: AgentMessage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      out.push(msg);
      continue;
    }

    const role = (msg as { role?: unknown }).role;
    if (role === "toolResult") {
      const toolMsg = msg as Extract<AgentMessage, { role: "toolResult" }>;
      const content = Array.isArray(toolMsg.content) ? toolMsg.content : [];
      const nextContent = (await sanitizeContentBlocksImages(
        content,
        label,
      )) as unknown as typeof toolMsg.content;
      out.push({ ...toolMsg, content: nextContent });
      continue;
    }

    if (role === "user") {
      const userMsg = msg as Extract<AgentMessage, { role: "user" }>;
      const content = userMsg.content;
      if (Array.isArray(content)) {
        const nextContent = (await sanitizeContentBlocksImages(
          content as unknown as ContentBlock[],
          label,
        )) as unknown as typeof userMsg.content;
        out.push({ ...userMsg, content: nextContent });
        continue;
      }
    }

    if (role === "assistant") {
      const assistantMsg = msg as Extract<AgentMessage, { role: "assistant" }>;
      if (assistantMsg.stopReason === "error") {
        const content = assistantMsg.content;
        if (Array.isArray(content)) {
          const nextContent = (await sanitizeContentBlocksImages(
            content as unknown as ContentBlock[],
            label,
          )) as unknown as typeof assistantMsg.content;
          const cleaned = allowNonImageSanitization
            ? stripThoughtSignatures(nextContent)
            : nextContent;
          out.push({ ...assistantMsg, content: cleaned });
        } else {
          out.push(assistantMsg);
        }
        continue;
      }
      const content = assistantMsg.content;
      if (Array.isArray(content)) {
        if (!allowNonImageSanitization) {
          const nextContent = (await sanitizeContentBlocksImages(
            content as unknown as ContentBlock[],
            label,
          )) as unknown as typeof assistantMsg.content;
          out.push({ ...assistantMsg, content: nextContent });
          continue;
        }
        const filteredContent = content.filter((block) => {
          if (!block || typeof block !== "object") {
            return true;
          }
          const rec = block as { type?: unknown; text?: unknown };
          if (rec.type !== "text" || typeof rec.text !== "string") {
            return true;
          }
          return rec.text.trim().length > 0;
        });
        const finalContent = (await sanitizeContentBlocksImages(
          filteredContent as unknown as ContentBlock[],
          label,
        )) as unknown as typeof assistantMsg.content;
        const cleaned = stripThoughtSignatures(finalContent);
        if (cleaned.length === 0) {
          continue;
        }
        out.push({ ...assistantMsg, content: cleaned });
        continue;
      }
    }

    out.push(msg);
  }
  if (options?.sanitizeToolCallIds) {
    return sanitizeToolCallIds(out, options.toolCallIdMode);
  }
  return out;
}
