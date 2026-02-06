---
summary: "Local-only onboarding wizard reference"
read_when:
  - You are running the CLI wizard
  - You want to understand wizard outputs
title: "Wizard CLI Reference"
---

# Wizard CLI reference

The onboarding wizard in the local-only build configures **local Ollama models** and
basic gateway settings. Cloud provider auth is not available.

## What the wizard configures

- `agents.defaults.workspace`
- `agents.defaults.model.primary` (default `ollama/gpt-oss-120b`)
- Basic channel allowlists
- Gateway bind/auth settings (local or remote gateway)

## Model behavior

- Default model: `ollama/gpt-oss-120b`
- If you enter a model without a provider, the wizard assumes `ollama/<model>`.
- The wizard checks the local model catalog and warns if the model is missing.

## Credential and profile paths

Local-only builds do **not** use model auth profiles. The only credentials you may
set are gateway tokens (for the control UI or remote gateway access).

## Outputs and internals

Typical fields in `~/.openclaw/openclaw.json`:

- `agents.defaults.workspace`
- `agents.defaults.model.primary`
- `channels.*` allowlists
- `gateway.auth.*` (optional)
