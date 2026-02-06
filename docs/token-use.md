---
summary: "How OpenClaw builds prompt context and reports token usage"
read_when:
  - Explaining token usage or context windows
  - Debugging context growth or compaction behavior
title: "Token Use"
---

# Token use

OpenClaw tracks **tokens**, not characters. Tokenization is model-specific, but most
Common tokenizers average ~4 characters per token for English text.

## How the system prompt is built

OpenClaw assembles its system prompt on every run. It includes:

- Tool list + short descriptions
- Skills list (metadata only; instructions are loaded on demand with `read`)
- Self-update instructions
- Workspace + bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md` when new)
- Time (UTC + user timezone)
- Reply tags + heartbeat behavior
- Runtime metadata (host/OS/model/thinking)

See the full breakdown in [System Prompt](/concepts/system-prompt).

## What counts in the context window

Everything the model receives counts toward the context limit:

- System prompt
- Conversation history (user + assistant messages)
- Tool calls and tool results
- Attachments/transcripts (images, audio, files)
- Compaction summaries and pruning artifacts

For a practical breakdown, use `/context list` or `/context detail`. See [Context](/concepts/context).

## How to see current token usage

Use these in chat:

- `/status` → status card with session model and context usage
- `/usage off|tokens|full` → per-response usage footer

Other surfaces:

- **TUI/Web TUI:** `/status` + `/usage`
- **CLI:** `openclaw status --usage`

## Costs

Local-only models have **zero** API cost. Cost fields remain zero.

## Tips for reducing token pressure

- Use `/compact` to summarize long sessions.
- Trim large tool outputs in your workflows.
- Keep skill descriptions short (skill list is injected into the prompt).
