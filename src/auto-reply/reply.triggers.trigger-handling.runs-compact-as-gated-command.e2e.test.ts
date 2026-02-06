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

import {
  abortEmbeddedPiRun,
  compactEmbeddedPiSession,
  runEmbeddedPiAgent,
} from "../agents/pi-embedded.js";
import { loadSessionStore, resolveSessionKey } from "../config/sessions.js";
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
  it("runs /compact as a gated command", async () => {
    await withTempHome(async (home) => {
      const storePath = join(tmpdir(), `openclaw-session-test-${Date.now()}.json`);
      vi.mocked(compactEmbeddedPiSession).mockResolvedValue({
        ok: true,
        compacted: true,
        result: {
          summary: "summary",
          firstKeptEntryId: "x",
          tokensBefore: 12000,
        },
      });

      const res = await getReplyFromConfig(
        {
          Body: "/compact focus on decisions",
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
            store: storePath,
          },
        },
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text?.startsWith("⚙️ Compacted")).toBe(true);
      expect(compactEmbeddedPiSession).toHaveBeenCalledOnce();
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
      const store = loadSessionStore(storePath);
      const sessionKey = resolveSessionKey("per-sender", {
        Body: "/compact focus on decisions",
        From: "+1003",
        To: "+2000",
      });
      expect(store[sessionKey]?.compactionCount).toBe(1);
    });
  });
  it("ignores think directives that only appear in the context wrapper", async () => {
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
          Body: [
            "[Chat messages since your last reply - for context]",
            "Peter: /thinking high [2025-12-05T21:45:00.000Z]",
            "",
            "[Current message - respond to this]",
            "Give me the status",
          ].join("\n"),
          From: "+1002",
          To: "+2000",
        },
        {},
        makeCfg(home),
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const prompt = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0]?.prompt ?? "";
      expect(prompt).toContain("Give me the status");
      expect(prompt).not.toContain("/thinking high");
      expect(prompt).not.toContain("/think high");
    });
  });
  it("does not emit directive acks for heartbeats with /think", async () => {
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
          Body: "HEARTBEAT /think:high",
          From: "+1003",
          To: "+1003",
        },
        { isHeartbeat: true },
        makeCfg(home),
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(text).not.toMatch(/Thinking level set/i);
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
    });
  });
});
