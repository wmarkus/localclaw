---
summary: "Usage tracking surfaces and credential requirements"
read_when:
  - You are wiring provider usage/quota surfaces
  - You need to explain usage tracking behavior or auth requirements
title: "Usage Tracking"
---

# Usage tracking

## What it is

- In the local-only build, provider usage tracking is disabled.
- `/status` and `/usage` show local session tokens only; costs remain zero.

## Where it shows up

- `/status` in chats: emoji‑rich status card with session tokens (local-only).
- `/usage off|tokens|full` in chats: per-response usage footer.
- `/usage cost` in chats: local cost summary aggregated from OpenClaw session logs.
- CLI: `openclaw status --usage` prints local usage totals.
- CLI: `openclaw channels list` prints the local usage snapshot (use `--no-usage` to skip).
- macOS menu bar: “Usage” section under Context (local-only).

## Providers + credentials

Provider usage credentials are not used in the local-only build.
