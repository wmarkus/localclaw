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
      { id: "gpt-oss-120b-lightning", name: "GPT OSS 120B Lightning", provider: "ollama" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports fuzzy model matches on /model directive", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model oss", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-20b": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Model set to ollama/gpt-oss-120b.");
      assertModelSelection(storePath, {
        provider: "ollama",
        model: "gpt-oss-120b",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("resolves provider-less exact model ids via fuzzy matching when unambiguous", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        {
          Body: "/model gpt-oss-20b",
          From: "+1222",
          To: "+1222",
          CommandAuthorized: true,
        },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-20b": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Model set to ollama/gpt-oss-20b.");
      assertModelSelection(storePath, {
        provider: "ollama",
        model: "gpt-oss-20b",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("supports fuzzy matches within a provider on /model provider/model", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      const res = await getReplyFromConfig(
        { Body: "/model ollama/120", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-20b": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Model set to ollama/gpt-oss-120b.");
      assertModelSelection(storePath, {
        provider: "ollama",
        model: "gpt-oss-120b",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("picks the best fuzzy match when multiple models match", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        { Body: "/model ollama", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-120b-lightning": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      assertModelSelection(storePath);
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("picks the best fuzzy match within a provider", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        { Body: "/model ollama/120", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": {},
                "ollama/gpt-oss-120b-lightning": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      assertModelSelection(storePath);
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
});
