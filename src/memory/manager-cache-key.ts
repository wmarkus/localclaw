import type { ResolvedMemorySearchConfig } from "../agents/memory-search.js";
import { hashText } from "./internal.js";

export function computeMemoryManagerCacheKey(params: {
  agentId: string;
  workspaceDir: string;
  settings: ResolvedMemorySearchConfig;
}): string {
  const settings = params.settings;
  const fingerprint = hashText(
    JSON.stringify({
      enabled: settings.enabled,
      sources: [...settings.sources].toSorted((a, b) => a.localeCompare(b)),
      extraPaths: [...settings.extraPaths].toSorted((a, b) => a.localeCompare(b)),
      provider: settings.provider,
      model: settings.model,
      local: {
        modelPath: settings.local.modelPath,
        modelCacheDir: settings.local.modelCacheDir,
      },
      experimental: settings.experimental,
      store: {
        driver: settings.store.driver,
        path: settings.store.path,
        vector: {
          enabled: settings.store.vector.enabled,
          extensionPath: settings.store.vector.extensionPath,
        },
      },
      chunking: settings.chunking,
      sync: settings.sync,
      query: settings.query,
      cache: settings.cache,
    }),
  );
  return `${params.agentId}:${params.workspaceDir}:${fingerprint}`;
}
