import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";

export function createWebSearchTool(_options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  return null;
}

export const __testing = {};
