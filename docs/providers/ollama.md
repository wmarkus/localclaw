---
summary: "Run OpenClaw with Ollama (local-only runtime)"
read_when:
  - You want to run OpenClaw with local models via Ollama
  - You need Ollama setup and configuration guidance
title: "Ollama"
---

# Ollama

Ollama is a local LLM runtime that runs models on **this machine**. OpenClaw integrates with
Ollama's OpenAI-compatible API and enforces **loopback-only** connectivity.

OpenClaw will only talk to `127.0.0.1`, `localhost`, or `::1`. Any other host is rejected and
replaced with the loopback default. This keeps model serving local and prevents LAN access.

## Quick start

1. Install Ollama: https://ollama.ai

2. Bind Ollama to loopback only:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

3. Pull the default model:

```bash
ollama pull gpt-oss-120b
```

4. Start OpenClaw. No extra config is required. The default model is
   `ollama/gpt-oss-120b`.

## Model discovery

OpenClaw always tries to discover local models from your Ollama instance:

- Calls `http://127.0.0.1:11434/api/tags`
- Converts each tag to a local model entry with zero cost
- Falls back to a built-in `gpt-oss-120b` entry if discovery fails

Discovery runs even when you define `models.providers.ollama`. The default
`models.mode: "merge"` keeps your explicit models and adds any discovered ones
that are missing.

## Configuration

### Minimal explicit config

Use this when you want a fixed catalog or custom context windows:

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
      model: {
        primary: "ollama/gpt-oss-120b",
        fallbacks: ["ollama/gpt-oss-20b"],
      },
    },
  },
}
```

Notes:

- `apiKey` is not required; OpenClaw uses a local placeholder internally.
- Non-loopback `baseUrl` values are ignored and reset to `http://127.0.0.1:11434/v1`.

### Model selection

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "ollama/gpt-oss-120b",
        fallbacks: ["ollama/gpt-oss-20b", "ollama/gpt-oss-7b"],
      },
    },
  },
}
```

## Troubleshooting

### Connection refused

Ensure Ollama is running on loopback only:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

Check the local API:

```bash
curl http://127.0.0.1:11434/api/tags
```

### No models discovered

Confirm the model is installed:

```bash
ollama list
```

If the list is empty, pull a model and retry:

```bash
ollama pull gpt-oss-120b
```

## See Also

- [Configuration](/gateway/configuration) - Full config reference
- [Configuration Examples](/gateway/configuration-examples) - Working config snippets
- [Models](/concepts/models) - Model selection and aliases
