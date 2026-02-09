import type { Api, Model } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../../config/config.js";
import type { ModelRow } from "./list.types.js";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import { ensureOpenClawModelsJson } from "../../agents/models-config.js";
import { discoverAuthStorage, discoverModels } from "../../agents/pi-model-discovery.js";

const isLocalBaseUrl = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
};

export async function loadModelRegistry(cfg: OpenClawConfig) {
  await ensureOpenClawModelsJson(cfg);
  const agentDir = resolveOpenClawAgentDir();
  const authStorage = discoverAuthStorage(agentDir);
  const registry = discoverModels(authStorage, agentDir);
  const models = registry.getAll();
  return { registry, models };
}

export function toModelRow(params: {
  model?: Model<Api>;
  key: string;
  tags: string[];
  aliases?: string[];
}): ModelRow {
  const { model, key, tags, aliases = [] } = params;
  if (!model) {
    return {
      key,
      name: key,
      input: "-",
      contextWindow: null,
      local: null,
      tags: [...tags, "missing"],
      missing: true,
    };
  }

  const input = model.input.join("+") || "text";
  const local = isLocalBaseUrl(model.baseUrl);
  const aliasTags = aliases.length > 0 ? [`alias:${aliases.join(",")}`] : [];
  const mergedTags = new Set(tags);
  if (aliasTags.length > 0) {
    for (const tag of mergedTags) {
      if (tag === "alias" || tag.startsWith("alias:")) {
        mergedTags.delete(tag);
      }
    }
    for (const tag of aliasTags) {
      mergedTags.add(tag);
    }
  }

  return {
    key,
    name: model.name || model.id,
    input,
    contextWindow: model.contextWindow ?? null,
    local,
    tags: Array.from(mergedTags),
    missing: false,
  };
}
