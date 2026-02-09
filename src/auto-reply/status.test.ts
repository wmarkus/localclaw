import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { normalizeTestText } from "../../test/helpers/normalize-text.js";
import { withTempHome } from "../../test/helpers/temp-home.js";
import {
  buildCommandsMessage,
  buildCommandsMessagePaginated,
  buildHelpMessage,
  buildStatusMessage,
} from "./status.js";

const { listPluginCommands } = vi.hoisted(() => ({
  listPluginCommands: vi.fn(() => []),
}));

vi.mock("../plugins/commands.js", () => ({
  listPluginCommands,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildStatusMessage", () => {
  it("summarizes agent readiness and context usage", () => {
    const text = buildStatusMessage({
      config: {
        models: {
          providers: {
            ollama: {
              apiKey: "test-key",
              models: [
                {
                  id: "pi:opus",
                  cost: {
                    input: 1,
                    output: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                },
              ],
            },
          },
        },
      } as OpenClawConfig,
      agent: {
        model: "ollama/pi:opus",
        contextTokens: 32_000,
      },
      sessionEntry: {
        sessionId: "abc",
        updatedAt: 0,
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 16_000,
        contextTokens: 32_000,
        thinkingLevel: "low",
        verboseLevel: "on",
        compactionCount: 2,
      },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      resolvedThink: "medium",
      resolvedVerbose: "off",
      queue: { mode: "collect", depth: 0 },
      now: 10 * 60_000, // 10 minutes later
    });
    const normalized = normalizeTestText(text);

    expect(normalized).toContain("OpenClaw");
    expect(normalized).toContain("Model: ollama/pi:opus");
    expect(normalized).toContain("Tokens: 1.2k in / 800 out");
    expect(normalized).toContain("Cost: $0.0020");
    expect(normalized).toContain("Context: 16k/32k (50%)");
    expect(normalized).toContain("Compactions: 2");
    expect(normalized).toContain("Session: agent:main:main");
    expect(normalized).toContain("updated 10m ago");
    expect(normalized).toContain("Runtime: direct");
    expect(normalized).toContain("Think: medium");
    expect(normalized).not.toContain("verbose");
    expect(normalized).toContain("elevated");
    expect(normalized).toContain("Queue: collect");
  });

  it("uses per-agent sandbox config when config and session key are provided", () => {
    const text = buildStatusMessage({
      config: {
        agents: {
          list: [
            { id: "main", default: true },
            { id: "discord", sandbox: { mode: "all" } },
          ],
        },
      } as OpenClawConfig,
      agent: {},
      sessionKey: "agent:discord:discord:channel:1456350065223270435",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    expect(normalizeTestText(text)).toContain("Runtime: docker/all");
  });

  it("shows verbose/elevated labels only when enabled", () => {
    const text = buildStatusMessage({
      agent: { model: "ollama/gpt-oss-120b" },
      sessionEntry: { sessionId: "v1", updatedAt: 0 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      resolvedThink: "low",
      resolvedVerbose: "on",
      resolvedElevated: "on",
      queue: { mode: "collect", depth: 0 },
    });

    expect(text).toContain("verbose");
    expect(text).toContain("elevated");
  });

  it("includes media understanding decisions when present", () => {
    const text = buildStatusMessage({
      agent: { model: "ollama/gpt-oss-120b" },
      sessionEntry: { sessionId: "media", updatedAt: 0 },
      sessionKey: "agent:main:main",
      queue: { mode: "none" },
      mediaDecisions: [
        {
          capability: "image",
          outcome: "success",
          attachments: [
            {
              attachmentIndex: 0,
              attempts: [
                {
                  type: "provider",
                  outcome: "success",
                  provider: "ollama",
                  model: "gpt-oss-120b",
                },
              ],
              chosen: {
                type: "provider",
                outcome: "success",
                provider: "ollama",
                model: "gpt-oss-120b",
              },
            },
          ],
        },
        {
          capability: "audio",
          outcome: "skipped",
          attachments: [
            {
              attachmentIndex: 1,
              attempts: [
                {
                  type: "provider",
                  outcome: "skipped",
                  reason: "maxBytes: too large",
                },
              ],
            },
          ],
        },
      ],
    });

    const normalized = normalizeTestText(text);
    expect(normalized).toContain(
      "Media: image ok (ollama/gpt-oss-120b) · audio skipped (maxBytes)",
    );
  });

  it("omits media line when all decisions are none", () => {
    const text = buildStatusMessage({
      agent: { model: "ollama/gpt-oss-120b" },
      sessionEntry: { sessionId: "media-none", updatedAt: 0 },
      sessionKey: "agent:main:main",
      queue: { mode: "none" },
      mediaDecisions: [
        { capability: "image", outcome: "no-attachment", attachments: [] },
        { capability: "audio", outcome: "no-attachment", attachments: [] },
        { capability: "video", outcome: "no-attachment", attachments: [] },
      ],
    });

    expect(normalizeTestText(text)).not.toContain("Media:");
  });

  it("does not show elevated label when session explicitly disables it", () => {
    const text = buildStatusMessage({
      agent: { model: "ollama/gpt-oss-120b", elevatedDefault: "on" },
      sessionEntry: { sessionId: "v1", updatedAt: 0, elevatedLevel: "off" },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      resolvedThink: "low",
      resolvedVerbose: "off",
      queue: { mode: "collect", depth: 0 },
    });

    const optionsLine = text.split("\n").find((line) => line.trim().startsWith("⚙️"));
    expect(optionsLine).toBeTruthy();
    expect(optionsLine).not.toContain("elevated");
  });

  it("prefers model overrides over last-run model", () => {
    const text = buildStatusMessage({
      agent: {
        model: "ollama/gpt-oss-120b",
        contextTokens: 32_000,
      },
      sessionEntry: {
        sessionId: "override-1",
        updatedAt: 0,
        providerOverride: "ollama",
        modelOverride: "gpt-oss-120b",
        modelProvider: "ollama",
        model: "gpt-oss-20b",
        contextTokens: 32_000,
      },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    expect(normalizeTestText(text)).toContain("Model: ollama/gpt-oss-120b");
  });

  it("keeps provider prefix from configured model", () => {
    const text = buildStatusMessage({
      agent: {
        model: "ollama/gpt-oss-120b",
      },
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    expect(normalizeTestText(text)).toContain("Model: ollama/gpt-oss-120b");
  });

  it("handles missing agent config gracefully", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    const normalized = normalizeTestText(text);
    expect(normalized).toContain("Model:");
    expect(normalized).toContain("Context:");
    expect(normalized).toContain("Queue: collect");
  });

  it("includes group activation for group sessions", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionEntry: {
        sessionId: "g1",
        updatedAt: 0,
        groupActivation: "always",
        chatType: "group",
      },
      sessionKey: "agent:main:whatsapp:group:123@g.us",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    expect(text).toContain("Activation: always");
  });

  it("shows queue details when overridden", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionEntry: { sessionId: "q1", updatedAt: 0 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: {
        mode: "collect",
        depth: 3,
        debounceMs: 2000,
        cap: 5,
        dropPolicy: "old",
        showDetails: true,
      },
    });

    expect(text).toContain("Queue: collect (depth 3 · debounce 2s · cap 5 · drop old)");
  });

  it("inserts usage summary beneath context line", () => {
    const text = buildStatusMessage({
      agent: { model: "ollama/gpt-oss-120b", contextTokens: 32_000 },
      sessionEntry: { sessionId: "u1", updatedAt: 0, totalTokens: 1000 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
      usageLine: "📊 Usage: Local 80% left (5h)",
    });

    const lines = normalizeTestText(text).split("\n");
    const contextIndex = lines.findIndex((line) => line.includes("Context:"));
    expect(contextIndex).toBeGreaterThan(-1);
    expect(lines[contextIndex + 1]).toContain("Usage: Local 80% left (5h)");
  });

  it("hides cost when not using an API key", () => {
    const text = buildStatusMessage({
      config: {
        models: {
          providers: {
            remote: {
              models: [
                {
                  id: "gpt-oss-120b",
                  cost: {
                    input: 1,
                    output: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                },
              ],
            },
          },
        },
      } as OpenClawConfig,
      agent: { model: "remote/gpt-oss-120b" },
      sessionEntry: { sessionId: "c1", updatedAt: 0, inputTokens: 10 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
    });

    expect(text).not.toContain("💵 Cost:");
  });

  it("prefers cached prompt tokens from the session log", async () => {
    await withTempHome(
      async (dir) => {
        vi.resetModules();
        const { buildStatusMessage: buildStatusMessageDynamic } = await import("./status.js");

        const sessionId = "sess-1";
        const logPath = path.join(
          dir,
          ".openclaw",
          "agents",
          "main",
          "sessions",
          `${sessionId}.jsonl`,
        );
        fs.mkdirSync(path.dirname(logPath), { recursive: true });

        fs.writeFileSync(
          logPath,
          [
            JSON.stringify({
              type: "message",
              message: {
                role: "assistant",
                model: "gpt-oss-120b",
                usage: {
                  input: 1,
                  output: 2,
                  cacheRead: 1000,
                  cacheWrite: 0,
                  totalTokens: 1003,
                },
              },
            }),
          ].join("\n"),
          "utf-8",
        );

        const text = buildStatusMessageDynamic({
          agent: {
            model: "ollama/gpt-oss-120b",
            contextTokens: 32_000,
          },
          sessionEntry: {
            sessionId,
            updatedAt: 0,
            totalTokens: 3, // would be wrong if cached prompt tokens exist
            contextTokens: 32_000,
          },
          sessionKey: "agent:main:main",
          sessionScope: "per-sender",
          queue: { mode: "collect", depth: 0 },
          includeTranscriptUsage: true,
        });

        expect(normalizeTestText(text)).toContain("Context: 1.0k/32k");
      },
      { prefix: "openclaw-status-" },
    );
  });
});

describe("buildCommandsMessage", () => {
  it("lists commands with aliases and text-only hints", () => {
    const text = buildCommandsMessage({
      commands: { config: false, debug: false },
    } as OpenClawConfig);
    expect(text).toContain("ℹ️ Slash commands");
    expect(text).toContain("Status");
    expect(text).toContain("/commands - List all slash commands.");
    expect(text).toContain("/skill - Run a skill by name.");
    expect(text).toContain("/think (/thinking, /t) - Set thinking level.");
    expect(text).toContain("/compact [text] - Compact the session context.");
    expect(text).not.toContain("/config");
    expect(text).not.toContain("/debug");
  });

  it("includes skill commands when provided", () => {
    const text = buildCommandsMessage(
      {
        commands: { config: false, debug: false },
      } as OpenClawConfig,
      [
        {
          name: "demo_skill",
          skillName: "demo-skill",
          description: "Demo skill",
        },
      ],
    );
    expect(text).toContain("/demo_skill - Demo skill");
  });
});

describe("buildHelpMessage", () => {
  it("hides config/debug when disabled", () => {
    const text = buildHelpMessage({
      commands: { config: false, debug: false },
    } as OpenClawConfig);
    expect(text).toContain("Skills");
    expect(text).toContain("/skill <name> [input]");
    expect(text).not.toContain("/config");
    expect(text).not.toContain("/debug");
  });
});

describe("buildCommandsMessagePaginated", () => {
  it("formats telegram output with pages", () => {
    const result = buildCommandsMessagePaginated(
      {
        commands: { config: false, debug: false },
      } as OpenClawConfig,
      undefined,
      { surface: "telegram", page: 1 },
    );
    expect(result.text).toContain("ℹ️ Commands (1/");
    expect(result.text).toContain("Session");
    expect(result.text).toContain("/stop - Stop the current run.");
  });

  it("includes plugin commands in the paginated list", () => {
    listPluginCommands.mockReturnValue([
      { name: "plugin_cmd", description: "Plugin command", pluginId: "demo-plugin" },
    ]);
    const result = buildCommandsMessagePaginated(
      {
        commands: { config: false, debug: false },
      } as OpenClawConfig,
      undefined,
      { surface: "telegram", page: 99 },
    );
    expect(result.text).toContain("Plugins");
    expect(result.text).toContain("/plugin_cmd (demo-plugin) - Plugin command");
  });
});
