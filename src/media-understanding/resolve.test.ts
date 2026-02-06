import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveEntriesWithActiveFallback, resolveModelEntries } from "./resolve.js";

const providerRegistry = new Map();

describe("resolveModelEntries", () => {
  it("skips provider entries when no local provider support exists", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          models: [{ provider: "remote", model: "example" }],
        },
      },
    };

    const imageEntries = resolveModelEntries({
      cfg,
      capability: "image",
      providerRegistry,
    });
    expect(imageEntries).toHaveLength(0);
  });

  it("keeps per-capability CLI entries", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          image: {
            models: [{ type: "cli", command: "whisper", args: ["--help"] }],
          },
        },
      },
    };

    const imageEntries = resolveModelEntries({
      cfg,
      capability: "image",
      config: cfg.tools?.media?.image,
      providerRegistry,
    });
    expect(imageEntries).toHaveLength(1);
  });

  it("skips shared CLI entries without capabilities", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          models: [{ type: "cli", command: "whisper", args: ["--file", "{{MediaPath}}"] }],
        },
      },
    };

    const entries = resolveModelEntries({
      cfg,
      capability: "image",
      providerRegistry,
    });
    expect(entries).toHaveLength(0);
  });
});

describe("resolveEntriesWithActiveFallback", () => {
  it("does not use active model when providers are unavailable", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          audio: { enabled: true },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "audio",
      config: cfg.tools?.media?.audio,
      providerRegistry,
      activeModel: { provider: "remote", model: "example" },
    });
    expect(entries).toHaveLength(0);
  });

  it("returns configured CLI entries even when active model is present", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          audio: { enabled: true, models: [{ type: "cli", command: "whisper" }] },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "audio",
      config: cfg.tools?.media?.audio,
      providerRegistry,
      activeModel: { provider: "remote", model: "example" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("cli");
  });

  it("skips active model when provider lacks capability", () => {
    const cfg: OpenClawConfig = {
      tools: {
        media: {
          video: { enabled: true },
        },
      },
    };

    const entries = resolveEntriesWithActiveFallback({
      cfg,
      capability: "video",
      config: cfg.tools?.media?.video,
      providerRegistry,
      activeModel: { provider: "remote", model: "example" },
    });
    expect(entries).toHaveLength(0);
  });
});
