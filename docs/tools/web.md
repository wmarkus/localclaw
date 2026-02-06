---
summary: "Web tools in the local-only build"
read_when:
  - You want to use web tools
  - You are configuring tools.web
title: "Web Tools"
---

# Web tools

The local-only build **disables web search**. The `web_search` tool is not
available.

`web_fetch` remains available for direct URL fetches and readability extraction.

## Enable or disable web fetch

```json5
{
  tools: {
    web: {
      fetch: { enabled: true },
    },
  },
}
```

## Notes

- Web fetch accesses external URLs. If you want a fully local environment, disable it.
