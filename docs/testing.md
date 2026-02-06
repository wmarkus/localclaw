---
summary: "Test OpenClaw locally"
read_when:
  - You want to run tests
  - You need coverage or CI parity
  - You are debugging a regression
title: "Testing"
---

# Testing

OpenClaw tests are local-only in this build. There are **no** cloud provider live tests.

## Quick commands

- `pnpm test` (Vitest)
- `pnpm test:coverage`
- `pnpm build`
- `pnpm check`

## Local model integration

If a test requires a running local model, start Ollama on loopback and ensure
`gpt-oss-120b` is installed:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
ollama pull gpt-oss-120b
```

## Notes

- Keep `NODE_ENV=test` for deterministic behavior.
- The local-only build does not run any provider auth or usage telemetry tests.
