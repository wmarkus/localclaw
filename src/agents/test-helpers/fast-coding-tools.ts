import { vi } from "vitest";

vi.mock("../tools/web-tools.js", () => ({
  createWebSearchTool: () => null,
  createWebFetchTool: () => null,
}));

vi.mock("../../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
  getPluginToolMeta: () => undefined,
}));
