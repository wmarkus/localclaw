import type { Llama, LlamaEmbeddingContext, LlamaModel } from "node-llama-cpp";
import fsSync from "node:fs";
import type { OpenClawConfig } from "../config/config.js";
import { resolveUserPath } from "../utils.js";
import { importNodeLlamaCpp } from "./node-llama.js";

function sanitizeAndNormalizeEmbedding(vec: number[]): number[] {
  const sanitized = vec.map((value) => (Number.isFinite(value) ? value : 0));
  const magnitude = Math.sqrt(sanitized.reduce((sum, value) => sum + value * value, 0));
  if (magnitude < 1e-10) {
    return sanitized;
  }
  return sanitized.map((value) => value / magnitude);
}

export type EmbeddingProvider = {
  id: string;
  model: string;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider;
  requestedProvider: "local";
};

export type EmbeddingProviderOptions = {
  config: OpenClawConfig;
  agentDir?: string;
  provider: "local";
  model: string;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
};

const DEFAULT_LOCAL_MODEL = "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf";

function canAutoSelectLocal(options: EmbeddingProviderOptions): boolean {
  const modelPath = options.local?.modelPath?.trim();
  if (!modelPath) {
    return false;
  }
  if (/^(hf:|https?:)/i.test(modelPath)) {
    return false;
  }
  const resolved = resolveUserPath(modelPath);
  try {
    return fsSync.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

async function createLocalEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProvider> {
  const modelPath = options.local?.modelPath?.trim() || DEFAULT_LOCAL_MODEL;
  const modelCacheDir = options.local?.modelCacheDir?.trim();

  // Lazy-load node-llama-cpp to keep startup light unless local is enabled.
  const { getLlama, resolveModelFile, LlamaLogLevel } = await importNodeLlamaCpp();

  let llama: Llama | null = null;
  let embeddingModel: LlamaModel | null = null;
  let embeddingContext: LlamaEmbeddingContext | null = null;

  const ensureContext = async () => {
    if (!llama) {
      llama = await getLlama({ logLevel: LlamaLogLevel.error });
    }
    if (!embeddingModel) {
      const resolved = await resolveModelFile(modelPath, modelCacheDir || undefined);
      embeddingModel = await llama.loadModel({ modelPath: resolved });
    }
    if (!embeddingContext) {
      embeddingContext = await embeddingModel.createEmbeddingContext();
    }
    return embeddingContext;
  };

  return {
    id: "local",
    model: modelPath,
    embedQuery: async (text) => {
      const ctx = await ensureContext();
      const embedding = await ctx.getEmbeddingFor(text);
      return sanitizeAndNormalizeEmbedding(Array.from(embedding.vector));
    },
    embedBatch: async (texts) => {
      const ctx = await ensureContext();
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          const embedding = await ctx.getEmbeddingFor(text);
          return sanitizeAndNormalizeEmbedding(Array.from(embedding.vector));
        }),
      );
      return embeddings;
    },
  };
}

export async function createEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<EmbeddingProviderResult> {
  const requestedProvider = options.provider;
  if (requestedProvider !== "local" && !canAutoSelectLocal(options)) {
    throw new Error("Local embeddings unavailable: missing local model configuration.");
  }
  const provider = await createLocalEmbeddingProvider(options);
  return { provider, requestedProvider: "local" };
}
