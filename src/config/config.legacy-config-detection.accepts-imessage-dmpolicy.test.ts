import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "./test-helpers.js";

describe("legacy config detection", () => {
  it('accepts imessage.dmPolicy="open" with allowFrom "*"', async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      channels: { imessage: { dmPolicy: "open", allowFrom: ["*"] } },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.imessage?.dmPolicy).toBe("open");
    }
  });
  it("defaults imessage.dmPolicy to pairing when imessage section exists", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({ channels: { imessage: {} } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.imessage?.dmPolicy).toBe("pairing");
    }
  });
  it("defaults imessage.groupPolicy to allowlist when imessage section exists", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({ channels: { imessage: {} } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.imessage?.groupPolicy).toBe("allowlist");
    }
  });
  it("defaults discord.groupPolicy to allowlist when discord section exists", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({ channels: { discord: {} } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.discord?.groupPolicy).toBe("allowlist");
    }
  });
  it("defaults slack.groupPolicy to allowlist when slack section exists", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({ channels: { slack: {} } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.slack?.groupPolicy).toBe("allowlist");
    }
  });
  it("defaults msteams.groupPolicy to allowlist when msteams section exists", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({ channels: { msteams: {} } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.channels?.msteams?.groupPolicy).toBe("allowlist");
    }
  });
  it("rejects unsafe executable config values", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      channels: { imessage: { cliPath: "imsg; rm -rf /" } },
      audio: { transcription: { command: ["whisper", "--model", "base"] } },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.path === "channels.imessage.cliPath")).toBe(true);
    }
  });
  it("accepts tools audio transcription without cli", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      audio: { transcription: { command: ["whisper", "--model", "base"] } },
    });
    expect(res.ok).toBe(true);
  });
  it("accepts path-like executable values with spaces", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      channels: { imessage: { cliPath: "/Applications/Imsg Tools/imsg" } },
      audio: {
        transcription: {
          command: ["whisper", "--model"],
        },
      },
    });
    expect(res.ok).toBe(true);
  });
  it('rejects discord.dm.policy="open" without allowFrom "*"', async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      channels: { discord: { dm: { policy: "open", allowFrom: ["123"] } } },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("channels.discord.dm.allowFrom");
    }
  });
  it('rejects slack.dm.policy="open" without allowFrom "*"', async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      channels: { slack: { dm: { policy: "open", allowFrom: ["U123"] } } },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("channels.slack.dm.allowFrom");
    }
  });
  it("rejects legacy agent.model string", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const res = validateConfigObject({
      agent: { model: "ollama/gpt-oss-120b" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.path === "agent.model")).toBe(true);
    }
  });
  it("migrates telegram.requireMention to channels.telegram.groups.*.requireMention", async () => {
    vi.resetModules();
    const { migrateLegacyConfig } = await import("./config.js");
    const res = migrateLegacyConfig({
      telegram: { requireMention: false },
    });
    expect(res.changes).toContain(
      'Moved telegram.requireMention → channels.telegram.groups."*".requireMention.',
    );
    expect(res.config?.channels?.telegram?.groups?.["*"]?.requireMention).toBe(false);
    expect(res.config?.channels?.telegram?.requireMention).toBeUndefined();
  });
  it("migrates messages.tts.enabled to messages.tts.auto", async () => {
    vi.resetModules();
    const { migrateLegacyConfig } = await import("./config.js");
    const res = migrateLegacyConfig({
      messages: { tts: { enabled: true } },
    });
    expect(res.changes).toContain("Moved messages.tts.enabled → messages.tts.auto (always).");
    expect(res.config?.messages?.tts?.auto).toBe("always");
    expect(res.config?.messages?.tts?.enabled).toBeUndefined();
  });
  it("migrates legacy model config to agent.models + model lists", async () => {
    vi.resetModules();
    const { migrateLegacyConfig } = await import("./config.js");
    const res = migrateLegacyConfig({
      agent: {
        model: "ollama/gpt-oss-120b",
        modelFallbacks: ["ollama/gpt-oss-20b"],
        imageModel: "ollama/gpt-oss-120b",
        imageModelFallbacks: ["ollama/gpt-oss-20b"],
        allowedModels: ["ollama/gpt-oss-120b", "ollama/gpt-oss-20b"],
        modelAliases: { Oss: "ollama/gpt-oss-120b" },
      },
    });

    expect(res.config?.agents?.defaults?.model?.primary).toBe("ollama/gpt-oss-120b");
    expect(res.config?.agents?.defaults?.model?.fallbacks).toEqual(["ollama/gpt-oss-20b"]);
    expect(res.config?.agents?.defaults?.imageModel?.primary).toBe("ollama/gpt-oss-120b");
    expect(res.config?.agents?.defaults?.imageModel?.fallbacks).toEqual(["ollama/gpt-oss-20b"]);
    expect(res.config?.agents?.defaults?.models?.["ollama/gpt-oss-120b"]).toMatchObject({
      alias: "Oss",
    });
    expect(res.config?.agents?.defaults?.models?.["ollama/gpt-oss-20b"]).toBeTruthy();
    expect(res.config?.agent).toBeUndefined();
  });
  it("flags legacy config in snapshot", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ routing: { allowFrom: ["+15555550123"] } }),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.legacyIssues.some((issue) => issue.path === "routing.allowFrom")).toBe(true);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        routing?: { allowFrom?: string[] };
        channels?: unknown;
      };
      expect(parsed.routing?.allowFrom).toEqual(["+15555550123"]);
      expect(parsed.channels).toBeUndefined();
    });
  });
  it("flags legacy provider sections in snapshot", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ whatsapp: { allowFrom: ["+1555"] } }, null, 2),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.legacyIssues.some((issue) => issue.path === "whatsapp")).toBe(true);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        channels?: unknown;
        whatsapp?: unknown;
      };
      expect(parsed.channels).toBeUndefined();
      expect(parsed.whatsapp).toBeTruthy();
    });
  });
  it("flags routing.allowFrom in snapshot", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ routing: { allowFrom: ["+1666"] } }, null, 2),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.legacyIssues.some((issue) => issue.path === "routing.allowFrom")).toBe(true);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        channels?: unknown;
        routing?: { allowFrom?: string[] };
      };
      expect(parsed.channels).toBeUndefined();
      expect(parsed.routing?.allowFrom).toEqual(["+1666"]);
    });
  });
  it("rejects bindings[].match.provider on load", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            bindings: [{ agentId: "main", match: { provider: "slack" } }],
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.issues.length).toBeGreaterThan(0);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        bindings?: Array<{ match?: { provider?: string } }>;
      };
      expect(parsed.bindings?.[0]?.match?.provider).toBe("slack");
    });
  });
  it("rejects bindings[].match.accountID on load", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            bindings: [{ agentId: "main", match: { channel: "telegram", accountID: "work" } }],
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.issues.length).toBeGreaterThan(0);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        bindings?: Array<{ match?: { accountID?: string } }>;
      };
      expect(parsed.bindings?.[0]?.match?.accountID).toBe("work");
    });
  });
  it("rejects session.sendPolicy.rules[].match.provider on load", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify(
          {
            session: {
              sendPolicy: {
                rules: [{ action: "deny", match: { provider: "telegram" } }],
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.issues.length).toBeGreaterThan(0);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        session?: { sendPolicy?: { rules?: Array<{ match?: { provider?: string } }> } };
      };
      expect(parsed.session?.sendPolicy?.rules?.[0]?.match?.provider).toBe("telegram");
    });
  });
  it("rejects messages.queue.byProvider on load", async () => {
    await withTempHome(async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ messages: { queue: { byProvider: { whatsapp: "queue" } } } }, null, 2),
        "utf-8",
      );

      vi.resetModules();
      const { readConfigFileSnapshot } = await import("./config.js");
      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.issues.length).toBeGreaterThan(0);

      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        messages?: {
          queue?: {
            byProvider?: Record<string, unknown>;
          };
        };
      };
      expect(parsed.messages?.queue?.byProvider?.whatsapp).toBe("queue");
    });
  });
});
