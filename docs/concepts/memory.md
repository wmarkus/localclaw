---
summary: "Local memory and semantic search"
read_when:
  - You want durable memory files
  - You are configuring memory search
  - You need local embeddings
title: "Memory"
---

# Memory

OpenClaw stores durable memory in plain Markdown files and can index them for
**local semantic search**.

## Files

- Main memory file: `MEMORY.md`
- Additional notes: `memory/*.md`

## Local embeddings

Local-only builds use a **local embedding model** via `node-llama-cpp`.
No remote embedding APIs are used.

### Config

```json5
{
  memorySearch: {
    provider: "local",
    local: {
      // Optional: use a specific GGUF file
      modelPath: "~/models/embedding.gguf",
      // Optional: model cache directory
      modelCacheDir: "~/.openclaw/models",
    },
  },
}
```

Notes:

- If `modelPath` points to a local file, it is used directly.
- If `modelPath` is omitted, OpenClaw uses a built-in default embedding model.
- The first run may download the default model if it is not cached yet.

## Commands

- `openclaw memory status`
- `openclaw memory index`
- `openclaw memory search "<query>"`
