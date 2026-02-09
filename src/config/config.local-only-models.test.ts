import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("local-only model validation", () => {
  it("rejects non-ollama providers in models.providers", () => {
    const res = validateConfigObject({
      models: {
        providers: {
          openai: {
            baseUrl: "https://example.com/v1",
            models: [{ id: "gpt-4", name: "gpt-4" }],
          },
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("models.providers.openai");
      expect(res.issues[0]?.message).toContain("local-only mode");
    }
  });

  it("rejects non-ollama model refs in agent defaults", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          model: { primary: "openai/gpt-4" },
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("agents.defaults.model.primary");
      expect(res.issues[0]?.message).toContain("local-only mode");
    }
  });
});
