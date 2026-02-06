---
summary: "Gateway authentication and local-only model access"
read_when:
  - You are securing Gateway access
  - You are debugging Gateway auth settings
title: "Authentication"
---

# Authentication

Local-only builds do **not** use model provider authentication. Models are served
locally through Ollama on loopback.

The only authentication you typically configure is **Gateway access** for the
control UI or remote CLI access.

## Gateway auth

Configure a token or password under `gateway.auth`:

```json5
{
  gateway: {
    auth: {
      mode: "token", // token | password
      token: "shared-secret",
    },
  },
}
```

## CLI usage

```bash
openclaw gateway status --url http://127.0.0.1:18789 --token shared-secret
```

## Notes

- `gateway.auth` protects the Gateway HTTP/RPC surface.
- Model access does not require API keys in the local-only build.
