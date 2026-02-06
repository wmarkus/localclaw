---
summary: "Schema-accurate configuration examples for local-only OpenClaw setups"
read_when:
  - Learning how to configure OpenClaw
  - Looking for configuration examples
  - Setting up OpenClaw for the first time
title: "Configuration Examples"
---

# Configuration Examples

Examples below are aligned with the current config schema. For the exhaustive reference and per-field notes, see [Configuration](/gateway/configuration).

## Quick start

### Absolute minimum

```json5
{
  agents: { defaults: { workspace: "~/.openclaw/workspace" } },
  channels: { whatsapp: { allowFrom: ["+15555550123"] } },
}
```

Save to `~/.openclaw/openclaw.json` and you can DM the bot from that number.

### Recommended starter

```json5
{
  identity: {
    name: "Clawd",
    theme: "helpful assistant",
    emoji: "🦞",
  },
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: { primary: "ollama/gpt-oss-120b" },
    },
  },
  channels: {
    whatsapp: {
      allowFrom: ["+15555550123"],
      groups: { "*": { requireMention: true } },
    },
  },
}
```

## Local models

### Explicit model catalog

Use this when you want a fixed catalog or tuned context windows:

```json5
{
  models: {
    providers: {
      ollama: {
        baseUrl: "http://127.0.0.1:11434/v1",
        api: "openai-completions",
        models: [
          {
            id: "gpt-oss-120b",
            name: "GPT OSS 120B",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
          {
            id: "gpt-oss-20b",
            name: "GPT OSS 20B",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 65000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: {
        primary: "ollama/gpt-oss-120b",
        fallbacks: ["ollama/gpt-oss-20b"],
      },
    },
  },
}
```

### Aliases for `/model`

```json5
{
  agents: {
    defaults: {
      models: {
        "ollama/gpt-oss-120b": { alias: "oss" },
        "ollama/gpt-oss-20b": { alias: "oss-mini" },
      },
      model: { primary: "ollama/gpt-oss-120b" },
    },
  },
}
```

## Multi-channel allowlists

```json5
{
  agents: { defaults: { workspace: "~/.openclaw/workspace" } },
  channels: {
    whatsapp: {
      allowFrom: ["+15555550123"],
      groups: { "*": { requireMention: true } },
    },
    telegram: {
      enabled: true,
      botToken: "YOUR_TELEGRAM_BOT_TOKEN",
      allowFrom: ["123456789"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["123456789"],
      groups: { "*": { requireMention: true } },
    },
    discord: {
      enabled: true,
      token: "YOUR_DISCORD_BOT_TOKEN",
      dm: { enabled: true, allowFrom: ["username#0001"] },
      guilds: {
        "123456789012345678": {
          slug: "friends",
          requireMention: false,
          channels: {
            general: { allow: true },
            help: { allow: true, requireMention: true },
          },
        },
      },
    },
  },
}
```

## Media understanding with local CLI tools

The local-only build ships with **no remote media providers**. Use a local CLI tool instead.

```json5
{
  tools: {
    media: {
      audio: {
        enabled: true,
        models: [
          {
            type: "cli",
            command: "whisper",
            args: ["--model", "base", "{{MediaPath}}"],
          },
        ],
      },
    },
  },
}
```

## Sessions and routing

```json5
{
  session: {
    scope: "per-sender",
    reset: { mode: "daily", atHour: 4, idleMinutes: 60 },
    typingIntervalSeconds: 5,
  },
  routing: {
    groupChat: { mentionPatterns: ["@openclaw", "openclaw"], historyLimit: 50 },
    queue: { mode: "collect", debounceMs: 1000, cap: 20, drop: "summarize" },
  },
}
```
