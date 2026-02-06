import { tmpdir } from "node:os";
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

describe("trigger handling", () => {
  it("allows /activation from allowFrom in groups", async () => {
    await withTempHome(async (home) => {
      const cfg = makeCfg(home);
      const res = await getReplyFromConfig(
        {
          Body: "/activation mention",
          From: "123@g.us",
          To: "+2000",
          ChatType: "group",
          Provider: "whatsapp",
          SenderE164: "+999",
          CommandAuthorized: true,
        },
        {},
        cfg,
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("⚙️ Group activation set to mention.");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("injects group activation context into the system prompt", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await getReplyFromConfig(
        {
          Body: "hello group",
          From: "123@g.us",
          To: "+2000",
          ChatType: "group",
          Provider: "whatsapp",
          SenderE164: "+2000",
          GroupSubject: "Test Group",
          GroupMembers: "Alice (+1), Bob (+2)",
        },
        {},
        {
          agents: {
            defaults: {
              model: "ollama/gpt-oss-120b",
              workspace: join(home, "openclaw"),
            },
          },
          channels: {
            whatsapp: {
              allowFrom: ["*"],
              groups: { "*": { requireMention: false } },
            },
          },
          messages: {
            groupChat: {},
          },
          session: { store: join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const extra = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0]?.extraSystemPrompt ?? "";
      expect(extra).toContain("Test Group");
      expect(extra).toContain("Activation: always-on");
    });
  });
  it("runs a greeting prompt for a bare /new", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "hello" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await getReplyFromConfig(
        {
          Body: "/new",
          From: "+1003",
          To: "+2000",
          CommandAuthorized: true,
        },
        {},
        {
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
          session: {
            store: join(tmpdir(), `openclaw-session-test-${Date.now()}.json`),
          },
        },
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("hello");
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const prompt = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0]?.prompt ?? "";
      expect(prompt).toContain("A new session was started via /new or /reset");
    });
  });
});
