---
summary: "Reference for running local-only tests"
read_when:
  - You are running tests locally
  - You need a reminder of test commands
title: "Test Reference"
---

# Test reference

Local-only builds do not include cloud provider live tests.

## Commands

```bash
pnpm test
pnpm test:coverage
pnpm build
pnpm check
```

If a test requires a running local model:

```bash
OLLAMA_HOST=127.0.0.1:11434 ollama serve
ollama pull gpt-oss-120b
```
