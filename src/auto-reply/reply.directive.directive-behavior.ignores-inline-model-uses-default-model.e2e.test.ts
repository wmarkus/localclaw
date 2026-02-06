import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { loadSessionStore } from "../config/sessions.js";
import { getReplyFromConfig } from "./reply.js";

const MAIN_SESSION_KEY = "agent:main:main";

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      return await fn(home);
    },
    {
      env: {
        OPENCLAW_AGENT_DIR: (home) => path.join(home, ".openclaw", "agent"),
        PI_CODING_AGENT_DIR: (home) => path.join(home, ".openclaw", "agent"),
      },
      prefix: "openclaw-reply-",
    },
  );
}

function _assertModelSelection(
  storePath: string,
  selection: { model?: string; provider?: string } = {},
) {
  const store = loadSessionStore(storePath);
  const entry = store[MAIN_SESSION_KEY];
  expect(entry).toBeDefined();
  expect(entry?.modelOverride).toBe(selection.model);
  expect(entry?.providerOverride).toBe(selection.provider);
}

describe("directive behavior", () => {
  beforeEach(() => {
    vi.mocked(runEmbeddedPiAgent).mockReset();
    vi.mocked(loadModelCatalog).mockResolvedValue([
      { id: "gpt-oss-120b", name: "Opus 4.5", provider: "ollama" },
      { id: "gpt-oss-120b", name: "Sonnet 4.1", provider: "ollama" },
      { id: "gpt-oss-120b", name: "GPT-4.1 Mini", provider: "ollama" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores inline /model and uses the default model", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "done" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const res = await getReplyFromConfig(
        {
          Body: "please sync /model ollama/gpt-oss-120b now",
          From: "+1004",
          To: "+2000",
        },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
              },
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: storePath },
        },
      );

      const texts = (Array.isArray(res) ? res : [res]).map((entry) => entry?.text).filter(Boolean);
      expect(texts).toContain("done");
      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const call = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0];
      expect(call?.provider).toBe("ollama");
      expect(call?.model).toBe("gpt-oss-120b");
    });
  });
  it("defaults thinking to low for reasoning-capable models", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "done" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });
      vi.mocked(loadModelCatalog).mockResolvedValueOnce([
        {
          id: "gpt-oss-120b",
          name: "Opus 4.5",
          provider: "ollama",
          reasoning: true,
        },
      ]);

      await getReplyFromConfig(
        {
          Body: "hello",
          From: "+1004",
          To: "+2000",
        },
        {},
        {
          agents: {
            defaults: {
              model: "ollama/gpt-oss-120b",
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: storePath },
        },
      );

      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const call = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0];
      expect(call?.thinkLevel).toBe("low");
    });
  });
  it("passes elevated defaults when sender is approved", async () => {
    await withTempHome(async (home) => {
      const storePath = path.join(home, "sessions.json");
      vi.mocked(runEmbeddedPiAgent).mockResolvedValue({
        payloads: [{ text: "done" }],
        meta: {
          durationMs: 5,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      await getReplyFromConfig(
        {
          Body: "hello",
          From: "+1004",
          To: "+2000",
          Provider: "whatsapp",
          SenderE164: "+1004",
        },
        {},
        {
          agents: {
            defaults: {
              model: "ollama/gpt-oss-120b",
              workspace: path.join(home, "openclaw"),
            },
          },
          tools: {
            elevated: {
              allowFrom: { whatsapp: ["+1004"] },
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: storePath },
        },
      );

      expect(runEmbeddedPiAgent).toHaveBeenCalledOnce();
      const call = vi.mocked(runEmbeddedPiAgent).mock.calls[0]?.[0];
      expect(call?.bashElevated).toEqual({
        enabled: true,
        allowed: true,
        defaultLevel: "on",
      });
    });
  });
});
