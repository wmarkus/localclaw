---
summary: "Scripted onboarding and agent setup for the OpenClaw CLI"
read_when:
  - You are automating onboarding in scripts or CI
  - You need non-interactive examples for local-only setup
title: "CLI Automation"
sidebarTitle: "CLI automation"
---

# CLI Automation

Use `--non-interactive` to automate `openclaw onboard`.

<Note>
`--json` does not imply non-interactive mode. Use `--non-interactive` (and `--workspace`) for scripts.
</Note>

## Baseline non-interactive example

```bash
openclaw onboard --non-interactive \
  --mode local \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node \
  --skip-skills
```

Add `--json` for a machine-readable summary.

## Add another agent

Use `openclaw agents add <name>` to create a separate agent with its own workspace
and sessions. Running without `--workspace` launches the wizard.

```bash
openclaw agents add work \
  --workspace ~/.openclaw/workspace-work \
  --model ollama/gpt-oss-120b \
  --bind whatsapp:biz
```
