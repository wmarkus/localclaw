import { describe, expect, it } from "vitest";
import {
  listThinkingLevelLabels,
  listThinkingLevels,
  normalizeReasoningLevel,
  normalizeThinkLevel,
} from "./thinking.js";

describe("normalizeThinkLevel", () => {
  it("accepts mid as medium", () => {
    expect(normalizeThinkLevel("mid")).toBe("medium");
  });

  it("accepts xhigh", () => {
    expect(normalizeThinkLevel("xhigh")).toBe("xhigh");
  });

  it("accepts on as low", () => {
    expect(normalizeThinkLevel("on")).toBe("low");
  });
});

describe("listThinkingLevels", () => {
  it("excludes xhigh for codex models", () => {
    expect(listThinkingLevels(undefined, "gpt-oss-120b-codex")).not.toContain("xhigh");
    expect(listThinkingLevels(undefined, "gpt-5.3-codex")).not.toContain("xhigh");
  });

  it("includes xhigh for ollama gpt-oss-120b", () => {
    expect(listThinkingLevels("ollama", "gpt-oss-120b")).toContain("xhigh");
  });

  it("excludes xhigh for other local models", () => {
    expect(listThinkingLevels("ollama", "mistral-8b")).not.toContain("xhigh");
  });
});

describe("listThinkingLevelLabels", () => {
  it("returns full levels for local models", () => {
    expect(listThinkingLevelLabels("ollama", "gpt-oss-120b")).toContain("low");
    expect(listThinkingLevelLabels("ollama", "gpt-oss-120b")).not.toContain("on");
  });
});

describe("normalizeReasoningLevel", () => {
  it("accepts on/off", () => {
    expect(normalizeReasoningLevel("on")).toBe("on");
    expect(normalizeReasoningLevel("off")).toBe("off");
  });

  it("accepts show/hide", () => {
    expect(normalizeReasoningLevel("show")).toBe("on");
    expect(normalizeReasoningLevel("hide")).toBe("off");
  });

  it("accepts stream", () => {
    expect(normalizeReasoningLevel("stream")).toBe("stream");
    expect(normalizeReasoningLevel("streaming")).toBe("stream");
  });
});
