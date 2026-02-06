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

function assertModelSelection(
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
      { id: "gpt-oss-120b", name: "GPT OSS 120B", provider: "ollama" },
      { id: "gpt-oss-20b", name: "GPT OSS 20B", provider: "ollama" },
      { id: "gpt-oss-7b", name: "GPT OSS 7B", provider: "ollama" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aliases /model list to /models", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model list", From: "+1222", To: "+1222", CommandAuthorized: true },
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
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Providers:");
      expect(text).toContain("- ollama");
      expect(text).toContain("Use: /models <provider>");
      expect(text).toContain("Switch: /model <provider/model>");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("shows current model when catalog is unavailable", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      vi.mocked(loadModelCatalog).mockResolvedValueOnce([]);
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model", From: "+1222", To: "+1222", CommandAuthorized: true },
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
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Current: ollama/gpt-oss-120b");
      expect(text).toContain("Switch: /model <provider/model>");
      expect(text).toContain("Browse: /models (providers) or /models <provider> (models)");
      expect(text).toContain("More: /model status");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("includes catalog providers when no allowlist is set", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      vi.mocked(loadModelCatalog).mockResolvedValue([
        { id: "gpt-oss-120b", name: "GPT OSS 120B", provider: "ollama" },
        { id: "gpt-oss-20b", name: "GPT OSS 20B", provider: "ollama" },
      ]);
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model list", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: {
                primary: "ollama/gpt-oss-120b",
                fallbacks: ["ollama/gpt-oss-120b"],
              },
              imageModel: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Providers:");
      expect(text).toContain("- ollama");
      expect(text).toContain("Use: /models <provider>");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("lists config-only providers when catalog is present", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      // Catalog present but missing custom providers: /model should still include
      // allowlisted provider/model keys from config.
      vi.mocked(loadModelCatalog).mockResolvedValueOnce([
        {
          provider: "ollama",
          id: "gpt-oss-120b",
          name: "GPT OSS 120B",
        },
        { provider: "ollama", id: "gpt-oss-20b", name: "GPT OSS 20B" },
      ]);
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/models ollama", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-120b-lightning": { alias: "Lightning" },
              },
            },
          },
          models: {
            mode: "merge",
            providers: {
              ollama: {
                baseUrl: "http://127.0.0.1:11434/v1",
                api: "openai-completions",
                models: [{ id: "gpt-oss-120b-lightning", name: "GPT OSS 120B Lightning" }],
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Models (ollama)");
      expect(text).toContain("ollama/gpt-oss-120b-lightning");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("does not repeat missing auth labels on /model list", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model list", From: "+1222", To: "+1222", CommandAuthorized: true },
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
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Providers:");
      expect(text).not.toContain("missing (missing)");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("sets model override on /model directive", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        { Body: "/model ollama/gpt-oss-120b", From: "+1222", To: "+1222", CommandAuthorized: true },
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
          session: { store: storePath },
        },
      );

      assertModelSelection(storePath, {
        model: "gpt-oss-120b",
        provider: "ollama",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("supports model aliases on /model directive", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        { Body: "/model Opus", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": { alias: "Opus" },
              },
            },
          },
          session: { store: storePath },
        },
      );

      assertModelSelection(storePath, {
        model: "gpt-oss-120b",
        provider: "ollama",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
});
