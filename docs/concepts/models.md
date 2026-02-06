---
summary: "Models CLI for local-only Ollama models"
read_when:
  - You are changing models list/set/status behavior
  - You need local model selection rules
title: "Models CLI"
---

# Models CLI

OpenClaw is **local-only** and uses **Ollama** on loopback. Model refs are `ollama/<model>`.

## How model selection works

1. **Primary** model (`agents.defaults.model.primary` or `agents.defaults.model`).
2. **Fallbacks** in `agents.defaults.model.fallbacks` (in order).

Related:

- `agents.defaults.models` is the allowlist of models OpenClaw can use (plus aliases).
- `agents.defaults.imageModel` is used only when the primary model cannot accept images.
- Per-agent defaults can override `agents.defaults.model` via `agents.list[].model` (see [/concepts/multi-agent](/concepts/multi-agent)).

## Setup wizard (recommended)

Run the onboarding wizard for a local-only setup:

```bash
openclaw onboard
```

## Config keys (overview)

- `agents.defaults.model.primary` and `agents.defaults.model.fallbacks`
- `agents.defaults.imageModel.primary` and `agents.defaults.imageModel.fallbacks`
- `agents.defaults.models` (allowlist + aliases)
- `models.providers.ollama` (local provider config written into `models.json`)

## Allowlist example

```json5
{
  agents: {
    defaults: {
      model: { primary: "ollama/gpt-oss-120b" },
      models: {
        "ollama/gpt-oss-120b": { alias: "oss" },
        "ollama/gpt-oss-20b": { alias: "oss-20b" },
      },
    },
  },
}
```

## Switching models in chat

```
/model
/model list
/model ollama/gpt-oss-120b
/model status
```

Notes:

- `/model` and `/model list` are compact pickers.
- `/model status` shows the resolved model and auth summary.
- If you omit the provider, OpenClaw assumes the default provider (`ollama`).

Full command behavior: [Slash commands](/tools/slash-commands).

## CLI commands

```bash
openclaw models list
openclaw models status
openclaw models set ollama/<model>
openclaw models set-image ollama/<model>

openclaw models aliases list
openclaw models aliases add <alias> ollama/<model>
openclaw models aliases remove <alias>

openclaw models fallbacks list
openclaw models fallbacks add ollama/<model>
openclaw models fallbacks remove ollama/<model>
openclaw models fallbacks clear

openclaw models image-fallbacks list
openclaw models image-fallbacks add ollama/<model>
openclaw models image-fallbacks remove ollama/<model>
openclaw models image-fallbacks clear
```

## Models registry (`models.json`)

The local provider config is stored in `models.json` under the agent directory
(default `~/.openclaw/agents/<agentId>/models.json`). This file is merged by
default unless `models.mode` is set to `replace`.
