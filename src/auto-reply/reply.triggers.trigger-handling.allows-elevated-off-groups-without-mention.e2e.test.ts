import fs from "node:fs/promises";
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
import { loadSessionStore } from "../config/sessions.js";
import { getReplyFromConfig } from "./reply.js";

const MAIN_SESSION_KEY = "agent:main:main";

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

function _makeCfg(home: string) {
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
  it("allows elevated off in groups without mention", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });
      const cfg = {
        agents: {
          defaults: {
            model: "ollama/gpt-oss-120b",
            workspace: join(home, "openclaw"),
          },
        },
        tools: {
          elevated: {
            allowFrom: { whatsapp: ["+1000"] },
          },
        },
        channels: {
          whatsapp: {
            allowFrom: ["+1000"],
            groups: { "*": { requireMention: false } },
          },
        },
        session: { store: join(home, "sessions.json") },
      };

      const res = await getReplyFromConfig(
        {
          Body: "/elevated off",
          From: "whatsapp:group:123@g.us",
          To: "whatsapp:+2000",
          Provider: "whatsapp",
          SenderE164: "+1000",
          CommandAuthorized: true,
          ChatType: "group",
          WasMentioned: false,
        },
        {},
        cfg,
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Elevated mode disabled.");

      const store = loadSessionStore(cfg.session.store);
      expect(store["agent:main:whatsapp:group:123@g.us"]?.elevatedLevel).toBe("off");
    });
  });
  it("allows elevated directive in groups when mentioned", async () => {
    await withTempHome(async (home) => {
      const cfg = {
        agents: {
          defaults: {
            model: "ollama/gpt-oss-120b",
            workspace: join(home, "openclaw"),
          },
        },
        tools: {
          elevated: {
            allowFrom: { whatsapp: ["+1000"] },
          },
        },
        channels: {
          whatsapp: {
            allowFrom: ["+1000"],
            groups: { "*": { requireMention: true } },
          },
        },
        session: { store: join(home, "sessions.json") },
      };

      const res = await getReplyFromConfig(
        {
          Body: "/elevated on",
          From: "whatsapp:group:123@g.us",
          To: "whatsapp:+2000",
          Provider: "whatsapp",
          SenderE164: "+1000",
          CommandAuthorized: true,
          ChatType: "group",
          WasMentioned: true,
        },
        {},
        cfg,
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Elevated mode set to ask");

      const storeRaw = await fs.readFile(cfg.session.store, "utf-8");
      const store = JSON.parse(storeRaw) as Record<string, { elevatedLevel?: string }>;
      expect(store["agent:main:whatsapp:group:123@g.us"]?.elevatedLevel).toBe("on");
    });
  });
  it("allows elevated directive in direct chats without mentions", async () => {
    await withTempHome(async (home) => {
      const cfg = {
        agents: {
          defaults: {
            model: "ollama/gpt-oss-120b",
            workspace: join(home, "openclaw"),
          },
        },
        tools: {
          elevated: {
            allowFrom: { whatsapp: ["+1000"] },
          },
        },
        channels: {
          whatsapp: {
            allowFrom: ["+1000"],
          },
        },
        session: { store: join(home, "sessions.json") },
      };

      const res = await getReplyFromConfig(
        {
          Body: "/elevated on",
          From: "+1000",
          To: "+2000",
          Provider: "whatsapp",
          SenderE164: "+1000",
          CommandAuthorized: true,
        },
        {},
        cfg,
      );
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Elevated mode set to ask");

      const storeRaw = await fs.readFile(cfg.session.store, "utf-8");
      const store = JSON.parse(storeRaw) as Record<string, { elevatedLevel?: string }>;
      expect(store[MAIN_SESSION_KEY]?.elevatedLevel).toBe("on");
    });
  });
});
