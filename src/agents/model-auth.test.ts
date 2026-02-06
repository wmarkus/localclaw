import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveApiKeyForProvider } from "./model-auth.js";

describe("model-auth", () => {
  it("returns default ollama auth when no config is provided", async () => {
    const resolved = await resolveApiKeyForProvider({ provider: "ollama" });
    expect(resolved.apiKey).toBe("ollama");
    expect(resolved.source).toBe("local");
  });

  it("uses configured ollama apiKey when provided", async () => {
    const cfg = {
      models: { providers: { ollama: { apiKey: "custom-key" } } },
    } satisfies OpenClawConfig;
    const resolved = await resolveApiKeyForProvider({ provider: "ollama", cfg });
    expect(resolved.apiKey).toBe("custom-key");
    expect(resolved.source).toBe("models.json");
  });

  it("rejects non-ollama providers", async () => {
    await expect(resolveApiKeyForProvider({ provider: "remote" })).rejects.toThrow(
      /local-only mode/,
    );
  });
});
