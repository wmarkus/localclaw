import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  compactEmbeddedPiSession: vi.fn(),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

const usageMocks = vi.hoisted(() => ({
  loadProviderUsageSummary: vi.fn().mockResolvedValue({
    updatedAt: 0,
    providers: [],
  }),
  formatUsageSummaryLine: vi.fn().mockReturnValue("📊 Usage: Local 80% left"),
  resolveUsageProviderId: vi.fn((provider: string) => provider.split("/")[0]),
}));

vi.mock("../infra/provider-usage.js", () => usageMocks);

const modelCatalogMocks = vi.hoisted(() => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    { provider: "ollama", id: "gpt-oss-120b", name: "GPT OSS 120B", contextWindow: 200000 },
    { provider: "ollama", id: "gpt-oss-20b", name: "GPT OSS 20B", contextWindow: 65000 },
    { provider: "ollama", id: "gpt-oss-7b", name: "GPT OSS 7B", contextWindow: 32768 },
  ]),
  resetModelCatalogCacheForTest: vi.fn(),
}));

vi.mock("../agents/model-catalog.js", () => modelCatalogMocks);

import { abortEmbeddedPiRun, runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { getReplyFromConfig } from "./reply.js";

const _MAIN_SESSION_KEY = "agent:main:main";

const webMocks = vi.hoisted(() => ({
  webAuthExists: vi.fn().mockResolvedValue(true),
  getWebAuthAgeMs: vi.fn().mockReturnValue(120_000),
  readWebSelfId: vi.fn().mockReturnValue({ e164: "+1999" }),
}));

vi.mock("../web/session.js", () => webMocks);

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      await mkdir(join(home, ".openclaw", "agents", "main", "sessions"), { recursive: true });
      vi.mocked(runEmbeddedPiAgent).mockClear();
      vi.mocked(abortEmbeddedPiRun).mockClear();
      return await fn(home);
    },
    { prefix: "openclaw-triggers-" },
  );
}

function makeCfg(home: string) {
  return {
    agents: {
      defaults: {
        model: "ollama/gpt-oss-120b",
        workspace: join(home, "openclaw"),
      },
    },
    channels: {
      whatsapp: {
        allowFrom: ["*"],
      },
    },
    session: { store: join(home, "sessions.json") },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("group intro prompts", () => {
  const groupParticipationNote =
    "Be a good group participant: mostly lurk and follow the conversation; reply only when directly addressed or you can add clear value. Emoji reactions are welcome when available. Write like a human. Avoid Markdown tables. Don't type literal \\n sequences; use real line breaks sparingly.";

  it("labels Discord groups using the surface metadata", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      await getReplyFromConfig(
        {
          Body: "status update",
          From: "discord:group:dev",
          To: "+1888",
          ChatType: "group",
          GroupSubject: "Release Squad",
          GroupMembers: "Alice, Bob",
          Provider: "discord",
        },
        {},
        makeCfg(home),
      );

      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const extraSystemPrompt =
        vi.mocked(runEmbeddedPiAgent).mock.calls.at(-1)?.[0]?.extraSystemPrompt ?? "";
      expect(extraSystemPrompt).toBe(
        `You are replying inside the Discord group "Release Squad". Group members: Alice, Bob. Activation: trigger-only (you are invoked only when explicitly mentioned; recent context may be included). ${groupParticipationNote} Address the specific sender noted in the message context.`,
      );
    });
  });
  it("keeps WhatsApp labeling for WhatsApp group chats", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      await getReplyFromConfig(
        {
          Body: "ping",
          From: "123@g.us",
          To: "+1999",
          ChatType: "group",
          GroupSubject: "Ops",
          Provider: "whatsapp",
        },
        {},
        makeCfg(home),
      );

      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const extraSystemPrompt =
        vi.mocked(runEmbeddedPiAgent).mock.calls.at(-1)?.[0]?.extraSystemPrompt ?? "";
      expect(extraSystemPrompt).toBe(
        `You are replying inside the WhatsApp group "Ops". Activation: trigger-only (you are invoked only when explicitly mentioned; recent context may be included). WhatsApp IDs: SenderId is the participant JID; [message_id: ...] is the message id for reactions (use SenderId as participant). ${groupParticipationNote} Address the specific sender noted in the message context.`,
      );
    });
  });
  it("labels Telegram groups using their own surface", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      await getReplyFromConfig(
        {
          Body: "ping",
          From: "telegram:group:tg",
          To: "+1777",
          ChatType: "group",
          GroupSubject: "Dev Chat",
          Provider: "telegram",
        },
        {},
        makeCfg(home),
      );

      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const extraSystemPrompt =
        vi.mocked(runEmbeddedPiAgent).mock.calls.at(-1)?.[0]?.extraSystemPrompt ?? "";
      expect(extraSystemPrompt).toBe(
        `You are replying inside the Telegram group "Dev Chat". Activation: trigger-only (you are invoked only when explicitly mentioned; recent context may be included). ${groupParticipationNote} Address the specific sender noted in the message context.`,
      );
    });
  });
});
