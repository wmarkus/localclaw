---
summary: "Local models with Ollama"
read_when:
  - You want to run models locally
  - You are setting up Ollama for OpenClaw
title: "Local Models"
---

# Local models

OpenClaw runs local-only models through Ollama on loopback.

## Quick start

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
ollama pull gpt-oss-120b
```

OpenClaw defaults to `ollama/gpt-oss-120b`.

## Explicit model catalog

If you want a fixed catalog or custom context windows:

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
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "ollama/gpt-oss-120b" },
    },
  },
}
```

## Notes

- Non-loopback `baseUrl` values are rejected and reset to loopback.
- If Ollama discovery fails, OpenClaw falls back to a built-in `gpt-oss-120b` entry.
