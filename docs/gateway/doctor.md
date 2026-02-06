---
summary: "Doctor command: health checks, config migrations, and repair steps"
read_when:
  - Adding or modifying doctor migrations
  - Introducing breaking config changes
title: "Doctor"
---

# Doctor

`openclaw doctor` is the repair + migration tool for OpenClaw. It fixes stale
config/state, checks health, and provides actionable repair steps.

## Quick start

```bash
openclaw doctor
```

### Headless / automation

```bash
openclaw doctor --yes
```

Accept defaults without prompting (including restart/service/sandbox repair steps when applicable).

```bash
openclaw doctor --repair
```

Apply recommended repairs without prompting (repairs + restarts where safe).

```bash
openclaw doctor --non-interactive
```

Run without prompts and only apply safe migrations (config normalization + on-disk state moves).

## What it does (summary)

- Optional pre-flight update for git installs (interactive only).
- UI protocol freshness check (rebuilds Control UI when the protocol schema is newer).
- Health check + restart prompt.
- Skills status summary (eligible/missing/blocked).
- Config normalization for legacy values.
- Legacy on-disk state migration (sessions/agent dir/WhatsApp auth).
- State integrity and permissions checks (sessions, transcripts, state dir).
- Config file permission checks (chmod 600) when running locally.
- Sandbox image repair when sandboxing is enabled.
- Legacy service migration and extra gateway detection.
- Gateway runtime checks (service installed but not running; cached launchd label).
- Channel status warnings (probed from the running gateway).
- Supervisor config audit (launchd/systemd/schtasks) with optional repair.
- Gateway runtime best-practice checks (Node vs Bun, version-manager paths).
- Gateway port collision diagnostics (default `18789`).
- Security warnings for open DM policies.
- Gateway auth warnings when no `gateway.auth.token` is set (local mode; offers token generation).
- systemd linger check on Linux.
- Source install checks (pnpm workspace mismatch, missing UI assets, missing tsx binary).
- Writes updated config + wizard metadata.

## Legacy config key migrations

When the config contains deprecated keys, other commands refuse to run and ask
you to run `openclaw doctor`.

Doctor will:

- Explain which legacy keys were found.
- Show the migration it applied.
- Rewrite `~/.openclaw/openclaw.json` with the updated schema.

Current migrations include:

- `routing.allowFrom` → `channels.whatsapp.allowFrom`
- `routing.groupChat.requireMention` → `channels.whatsapp/telegram/imessage.groups."*".requireMention`
- `routing.groupChat.historyLimit` → `messages.groupChat.historyLimit`
- `routing.groupChat.mentionPatterns` → `messages.groupChat.mentionPatterns`
- `routing.queue` → `messages.queue`
- `routing.bindings` → top-level `bindings`
- `routing.agents`/`routing.defaultAgentId` → `agents.list` + `agents.list[].default`
- `routing.agentToAgent` → `tools.agentToAgent`
- `routing.transcribeAudio` → `tools.media.audio.models`
- `bindings[].match.accountID` → `bindings[].match.accountId`
- `identity` → `agents.list[].identity`
- `agent.*` → `agents.defaults` + `tools.*` (tools/elevated/exec/sandbox/subagents)
- `agent.model`/`allowedModels`/`modelAliases`/`modelFallbacks`/`imageModelFallbacks`
  → `agents.defaults.models` + `agents.defaults.model.primary/fallbacks` + `agents.defaults.imageModel.primary/fallbacks`

## Legacy state migrations (disk layout)

Doctor can migrate older on-disk layouts into the current structure:

- Sessions store + transcripts:
  - from `~/.openclaw/sessions/` to `~/.openclaw/agents/<agentId>/sessions/`
- Agent dir:
  - from `~/.openclaw/agent/` to `~/.openclaw/agents/<agentId>/agent/`
- WhatsApp auth state (Baileys):
  - from legacy `~/.openclaw/credentials/*.json` (except `oauth.json`)
  - to `~/.openclaw/credentials/whatsapp/<accountId>/...` (default account id: `default`)

These migrations are best-effort and idempotent; doctor will emit warnings when
it leaves any legacy folders behind as backups.
