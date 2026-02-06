---
summary: "Local model provider reference for OpenClaw"
read_when:
  - You want to run models locally
  - You need the local model configuration rules
title: "Local Model Provider"
---

# Local model provider

OpenClaw runs **local-only** models via **Ollama** on loopback. Cloud providers are not supported in this build.

## Model refs

- Use `ollama/<model>` (example: `ollama/gpt-oss-120b`).
- If you set `agents.defaults.models`, it becomes the allowlist.
- CLI helpers: `openclaw models list`, `openclaw models set ollama/<model>`.

## Default behavior

- Base URL is pinned to `http://127.0.0.1:11434/v1`.
- Non-loopback URLs are rejected.
- Default model is `ollama/gpt-oss-120b`.

## Config example

```json5
{
  agents: { defaults: { model: { primary: "ollama/gpt-oss-120b" } } },
  models: {
    mode: "merge",
    providers: {
      ollama: {
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
        api: "openai-completions",
        models: [{ id: "gpt-oss-120b", name: "GPT OSS 120B" }],
      },
    },
  },
}
```
