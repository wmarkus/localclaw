import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("Ollama provider", () => {
  it("returns ollama provider defaults when no models are discoverable", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.ollama).toBeTruthy();
    expect(providers?.ollama?.api).toBe("openai-completions");
    expect(providers?.ollama?.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(providers?.ollama?.models?.[0]?.id).toBe("gpt-oss-120b");
  });
});
