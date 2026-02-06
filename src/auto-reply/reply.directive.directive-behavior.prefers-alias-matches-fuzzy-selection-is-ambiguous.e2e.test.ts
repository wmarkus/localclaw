import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { loadSessionStore } from "../config/sessions.js";
import { drainSystemEvents } from "../infra/system-events.js";
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

  it("prefers alias matches when fuzzy selection is ambiguous", async () => {
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
                "ollama/gpt-oss-120b": { alias: "Oss" },
                "ollama/gpt-oss-20b": {},
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Model set to Oss (ollama/gpt-oss-120b).");
      assertModelSelection(storePath, {
        provider: "ollama",
        model: "gpt-oss-120b",
      });
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("stores auth profile overrides on /model directive", async () => {
    await withTempHome(async (home) => {
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");
      const authDir = path.join(home, ".openclaw", "agents", "main", "agent");
      await fs.mkdir(authDir, { recursive: true, mode: 0o700 });
      await fs.writeFile(
        path.join(authDir, "auth-profiles.json"),
        JSON.stringify(
          {
            version: 1,
            profiles: {
              "ollama:work": {
                type: "api_key",
                provider: "ollama",
                key: "sk-test-1234567890",
              },
            },
          },
          null,
          2,
        ),
      );

      const res = await getReplyFromConfig(
        { Body: "/model Oss@ollama:work", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": { alias: "Oss" },
              },
            },
          },
          session: { store: storePath },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Auth profile set to ollama:work");
      const store = loadSessionStore(storePath);
      const entry = store["agent:main:main"];
      expect(entry.authProfileOverride).toBe("ollama:work");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("queues a system event when switching models", async () => {
    await withTempHome(async (home) => {
      drainSystemEvents(MAIN_SESSION_KEY);
      vi.mocked(runEmbeddedPiAgent).mockReset();
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        { Body: "/model Oss", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
              models: {
                "ollama/gpt-oss-120b": { alias: "Oss" },
              },
            },
          },
          session: { store: storePath },
        },
      );

      const events = drainSystemEvents(MAIN_SESSION_KEY);
      expect(events).toContain("Model switched to Oss (ollama/gpt-oss-120b).");
      expect(runEmbeddedPiAgent).not.toHaveBeenCalled();
    });
  });
  it("queues a system event when toggling elevated", async () => {
    await withTempHome(async (home) => {
      drainSystemEvents(MAIN_SESSION_KEY);
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        {
          Body: "/elevated on",
          From: "+1222",
          To: "+1222",
          Provider: "whatsapp",
          CommandAuthorized: true,
        },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
            },
          },
          tools: { elevated: { allowFrom: { whatsapp: ["*"] } } },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: storePath },
        },
      );

      const events = drainSystemEvents(MAIN_SESSION_KEY);
      expect(events.some((e) => e.includes("Elevated ASK"))).toBe(true);
    });
  });
  it("queues a system event when toggling reasoning", async () => {
    await withTempHome(async (home) => {
      drainSystemEvents(MAIN_SESSION_KEY);
      const storePath = path.join(home, "sessions.json");

      await getReplyFromConfig(
        {
          Body: "/reasoning stream",
          From: "+1222",
          To: "+1222",
          Provider: "whatsapp",
          CommandAuthorized: true,
        },
        {},
        {
          agents: {
            defaults: {
              model: { primary: "ollama/gpt-oss-120b" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: storePath },
        },
      );

      const events = drainSystemEvents(MAIN_SESSION_KEY);
      expect(events.some((e) => e.includes("Reasoning STREAM"))).toBe(true);
    });
  });
});
