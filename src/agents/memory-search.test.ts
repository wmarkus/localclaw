import { describe, expect, it } from "vitest";
import { resolveMemorySearchConfig } from "./memory-search.js";

describe("memory search config", () => {
  it("returns null when disabled", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: { enabled: true },
        },
        list: [
          {
            id: "main",
            default: true,
            memorySearch: { enabled: false },
          },
        ],
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved).toBeNull();
  });

  it("defaults provider to local when unspecified", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            enabled: true,
          },
        },
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.provider).toBe("local");
  });

  it("merges defaults and overrides", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            provider: "local",
            model: "embeddinggemma-300M",
            store: {
              vector: {
                enabled: false,
                extensionPath: "/opt/sqlite-vec.dylib",
              },
            },
            chunking: { tokens: 500, overlap: 100 },
            query: { maxResults: 4, minScore: 0.2 },
          },
        },
        list: [
          {
            id: "main",
            default: true,
            memorySearch: {
              chunking: { tokens: 320 },
              query: { maxResults: 8 },
              store: {
                vector: {
                  enabled: true,
                },
              },
            },
          },
        ],
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.provider).toBe("local");
    expect(resolved?.model).toBe("embeddinggemma-300M");
    expect(resolved?.chunking.tokens).toBe(320);
    expect(resolved?.chunking.overlap).toBe(100);
    expect(resolved?.query.maxResults).toBe(8);
    expect(resolved?.query.minScore).toBe(0.2);
    expect(resolved?.store.vector.enabled).toBe(true);
    expect(resolved?.store.vector.extensionPath).toBe("/opt/sqlite-vec.dylib");
  });

  it("merges extra memory paths from defaults and overrides", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            extraPaths: ["/shared/notes", " docs "],
          },
        },
        list: [
          {
            id: "main",
            default: true,
            memorySearch: {
              extraPaths: ["/shared/notes", "../team-notes"],
            },
          },
        ],
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.extraPaths).toEqual(["/shared/notes", "docs", "../team-notes"]);
  });

  it("defaults session delta thresholds", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            provider: "local",
          },
        },
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.sync.sessions).toEqual({
      deltaBytes: 100000,
      deltaMessages: 50,
    });
  });

  it("gates session sources behind experimental flag", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            provider: "local",
            sources: ["memory", "sessions"],
          },
        },
        list: [
          {
            id: "main",
            default: true,
            memorySearch: {
              experimental: { sessionMemory: false },
            },
          },
        ],
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.sources).toEqual(["memory"]);
  });

  it("allows session sources when experimental flag is enabled", () => {
    const cfg = {
      agents: {
        defaults: {
          memorySearch: {
            provider: "local",
            sources: ["memory", "sessions"],
            experimental: { sessionMemory: true },
          },
        },
      },
    };
    const resolved = resolveMemorySearchConfig(cfg, "main");
    expect(resolved?.sources).toContain("sessions");
  });
});
