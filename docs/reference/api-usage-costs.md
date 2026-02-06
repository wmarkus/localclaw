---
summary: "Local-only usage and cost notes"
read_when:
  - You want to audit which features can call paid APIs
  - You need to explain usage reporting
title: "API Usage and Costs"
---

# API usage and costs

This build is **local-only** for model inference. There are no paid model provider
calls and no model usage costs tracked.

## What still can use external services

OpenClaw can still call external services if you explicitly configure them, for example:

- Web fetch to public URLs
- Skills that call third-party APIs

If you want a fully local environment, keep these features disabled.

## What /status shows

`/status` and `openclaw status` report the current model and session metadata. Cost
fields remain zero for local-only models.
