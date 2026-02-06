---
summary: "Troubleshooting for local-only OpenClaw"
read_when:
  - The gateway fails to start
  - Models are not responding
  - You need common fixes
title: "Troubleshooting"
---

# Troubleshooting

## Gateway will not start

Run:

```bash
openclaw doctor
```

Common causes:

- Invalid config JSON5
- Duplicate agent directories
- Missing workspace permissions

## Connection refused to Ollama

Ensure Ollama is running on loopback only:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
curl http://127.0.0.1:11434/api/tags
```

## Unknown model

The model must exist locally or be explicitly configured:

```bash
ollama list
```

If it is missing, pull it:

```bash
ollama pull gpt-oss-120b
```

## Gateway auth errors

If you set `gateway.auth`, pass the token or password to CLI commands:

```bash
openclaw gateway status --url http://127.0.0.1:18789 --token shared-secret
```

## Channel not responding

Check channel status:

```bash
openclaw channels status --probe
```

Confirm allowlists and mention rules in `openclaw.json`.

## Logs

```bash
openclaw logs --follow
```

## Reset a session

Send `/reset` or `/new` in the chat, or delete the session file under:

`~/.openclaw/agents/<agentId>/sessions/`
