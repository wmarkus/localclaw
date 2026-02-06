import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withEnvOverride, withTempHome } from "./test-helpers.js";

describe("config env vars", () => {
  it("applies env vars from env block when missing", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            env: { vars: { OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" } },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await withEnvOverride({ OLLAMA_BASE_URL: undefined }, async () => {
        const { loadConfig } = await import("./config.js");
        loadConfig();
        expect(process.env.OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434/v1");
      });
    });
  });

  it("does not override existing env vars", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            env: { vars: { OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" } },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await withEnvOverride({ OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" }, async () => {
        const { loadConfig } = await import("./config.js");
        loadConfig();
        expect(process.env.OLLAMA_BASE_URL).toBe("http://127.0.0.1:11434/v1");
      });
    });
  });

  it("applies env vars from env.vars when missing", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            env: { vars: { DISCORD_BOT_TOKEN: "discord-config" } },
          },
          null,
          2,
        ),
        "utf-8",
      );

      await withEnvOverride({ DISCORD_BOT_TOKEN: undefined }, async () => {
        const { loadConfig } = await import("./config.js");
        loadConfig();
        expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-config");
      });
    });
  });
});
