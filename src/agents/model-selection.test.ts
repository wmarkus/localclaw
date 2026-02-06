import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  parseModelRef,
  resolveModelRefFromString,
  resolveConfiguredModelRef,
  buildModelAliasIndex,
  normalizeProviderId,
  modelKey,
} from "./model-selection.js";

describe("model-selection", () => {
  describe("normalizeProviderId", () => {
    it("should normalize provider names", () => {
      expect(normalizeProviderId("Ollama")).toBe("ollama");
      expect(normalizeProviderId("  Ollama  ")).toBe("ollama");
    });
  });

  describe("parseModelRef", () => {
    it("should parse full model refs", () => {
      expect(parseModelRef("ollama/gpt-oss-120b", "ollama")).toEqual({
        provider: "ollama",
        model: "gpt-oss-120b",
      });
    });

    it("should use default provider if none specified", () => {
      expect(parseModelRef("gpt-oss-120b", "ollama")).toEqual({
        provider: "ollama",
        model: "gpt-oss-120b",
      });
    });

    it("should return null for empty strings", () => {
      expect(parseModelRef("", "ollama")).toBeNull();
      expect(parseModelRef("  ", "ollama")).toBeNull();
    });

    it("should handle invalid slash usage", () => {
      expect(parseModelRef("/", "ollama")).toBeNull();
      expect(parseModelRef("ollama/", "ollama")).toBeNull();
      expect(parseModelRef("/model", "ollama")).toBeNull();
    });
  });

  describe("buildModelAliasIndex", () => {
    it("should build alias index from config", () => {
      const cfg: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            models: {
              "ollama/gpt-oss-120b": { alias: "default" },
            },
          },
        },
      };

      const index = buildModelAliasIndex({
        cfg: cfg as OpenClawConfig,
        defaultProvider: "ollama",
      });

      expect(index.byAlias.get("default")?.ref).toEqual({
        provider: "ollama",
        model: "gpt-oss-120b",
      });
      expect(index.byKey.get(modelKey("ollama", "gpt-oss-120b"))).toEqual(["default"]);
    });
  });

  describe("resolveModelRefFromString", () => {
    it("should resolve from string with alias", () => {
      const index = {
        byAlias: new Map([
          ["default", { alias: "default", ref: { provider: "ollama", model: "gpt-oss-120b" } }],
        ]),
        byKey: new Map(),
      };

      const resolved = resolveModelRefFromString({
        raw: "default",
        defaultProvider: "ollama",
        aliasIndex: index,
      });

      expect(resolved?.ref).toEqual({ provider: "ollama", model: "gpt-oss-120b" });
      expect(resolved?.alias).toBe("default");
    });

    it("should resolve direct ref if no alias match", () => {
      const resolved = resolveModelRefFromString({
        raw: "ollama/gpt-oss-120b",
        defaultProvider: "ollama",
      });
      expect(resolved?.ref).toEqual({ provider: "ollama", model: "gpt-oss-120b" });
    });
  });

  describe("resolveConfiguredModelRef", () => {
    it("uses config model when provided", () => {
      const cfg: Partial<OpenClawConfig> = {
        agents: {
          defaults: {
            model: "gpt-oss-120b",
          },
        },
      };

      const result = resolveConfiguredModelRef({
        cfg: cfg as OpenClawConfig,
        defaultProvider: "ollama",
        defaultModel: "gpt-oss-120b",
      });

      expect(result).toEqual({ provider: "ollama", model: "gpt-oss-120b" });
    });

    it("should use default provider/model if config is empty", () => {
      const cfg: Partial<OpenClawConfig> = {};
      const result = resolveConfiguredModelRef({
        cfg: cfg as OpenClawConfig,
        defaultProvider: "ollama",
        defaultModel: "gpt-oss-120b",
      });
      expect(result).toEqual({ provider: "ollama", model: "gpt-oss-120b" });
    });
  });
});
