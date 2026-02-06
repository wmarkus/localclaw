---
summary: "CLI reference for `openclaw models` (status/list/set, aliases, fallbacks)"
read_when:
  - You want to change default models or view local model status
  - You want to manage aliases and fallbacks
title: "models"
---

# `openclaw models`

Local model discovery and configuration (default model, fallbacks, aliases).

## Common commands

```bash
openclaw models status
openclaw models list
openclaw models set ollama/gpt-oss-120b
```

Notes:

- Model refs use `ollama/<model>` (example: `ollama/gpt-oss-120b`).
- If you omit the provider, OpenClaw warns and assumes `ollama/<model>`.

## `models status`

Shows the resolved default model and fallbacks plus the local catalog source.

Options:

- `--json`
- `--plain`
- `--agent <id>` (configured agent id; overrides `OPENCLAW_AGENT_DIR`/`PI_CODING_AGENT_DIR`)

## `models list`

Lists available local models. Options:

- `--all`
- `--local`
- `--provider <name>`
- `--json`
- `--plain`

## `models set` and fallbacks

```bash
openclaw models set ollama/gpt-oss-120b
openclaw models fallbacks add ollama/gpt-oss-20b
```

## Aliases

```bash
openclaw models aliases add oss ollama/gpt-oss-120b
openclaw models aliases list
```

## `models scan`

Model scanning is disabled in the local-only build.
