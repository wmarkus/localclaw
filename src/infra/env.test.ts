import { describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "./env.js";

describe("isTruthyEnvValue", () => {
  it("accepts common truthy values", () => {
    expect(isTruthyEnvValue("1")).toBe(true);
    expect(isTruthyEnvValue("true")).toBe(true);
    expect(isTruthyEnvValue(" yes ")).toBe(true);
    expect(isTruthyEnvValue("ON")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isTruthyEnvValue("0")).toBe(false);
    expect(isTruthyEnvValue("false")).toBe(false);
    expect(isTruthyEnvValue("")).toBe(false);
    expect(isTruthyEnvValue(undefined)).toBe(false);
  });
});
