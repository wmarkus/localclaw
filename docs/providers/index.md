---
summary: "Local model provider supported by OpenClaw"
read_when:
  - You want to run models locally
  - You need a quick overview of the supported local backend
title: "Local Models"
---

# Local Models

OpenClaw runs **local-only** models and uses **Ollama** on loopback by default.
Set the default model as `ollama/<model>`.

Looking for chat channel docs (WhatsApp/Telegram/Discord/Slack/Mattermost (plugin)/etc.)? See [Channels](/channels).

## Quick start

1. Install and run Ollama locally.
2. Set the default model:

```json5
{
  agents: { defaults: { model: { primary: "ollama/gpt-oss-120b" } } },
}
```

## Provider docs

- [Ollama (local models)](/providers/ollama)
