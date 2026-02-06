---
summary: "Local-only FAQ for OpenClaw"
read_when:
  - You want quick answers about local-only OpenClaw
  - You need troubleshooting tips
title: "FAQ"
---

# FAQ

## Do I need any cloud model account

No. This build runs **local-only** models through Ollama on loopback.

## What model does OpenClaw use by default

`ollama/gpt-oss-120b`.

## Can I use a different local model

Yes. Update `agents.defaults.model.primary` and ensure the model exists in Ollama.

Example:

```json5
{
  agents: {
    defaults: {
      model: { primary: "ollama/gpt-oss-20b" },
    },
  },
}
```

## Why is OpenClaw forcing 127.0.0.1 for Ollama

Local-only mode enforces loopback. Any non-loopback base URL is rejected and
reset to `http://127.0.0.1:11434/v1` to prevent LAN or remote model serving.

## I see connection refused to 127.0.0.1:11434

Start Ollama on loopback:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

Then verify:

```bash
curl http://127.0.0.1:11434/api/tags
```

## Why does /model show unknown model

The model must exist in Ollama or be explicitly defined in `models.providers.ollama`.
Check installed models:

```bash
ollama list
```

## Does OpenClaw do TTS

No. Text-to-speech is disabled in the local-only build.

## Does media understanding work

Yes, but only via local CLI tools. Use `tools.media.*.models` with `type: "cli"`.

## Are cloud providers supported

No. All cloud providers and auth flows have been removed from this build.

## Where is the config file

`~/.openclaw/openclaw.json` (JSON5 supported).

## How do I change the default workspace

Set `agents.defaults.workspace`:

```json5
{
  agents: { defaults: { workspace: "~/.openclaw/workspace" } },
}
```
